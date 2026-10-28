// pocketbase/hooks/pcp_catalogo_sync.js — SPEC-3-001 CA-3-01
// Catálogo real do Omie PRODUTO A PRODUTO, com cursor, pausa e parada no bloqueio.
// Os códigos vêm da posição de estoque ativa (ListarPosEstoque, ordenados e sem repetição);
// cada chamada consulta no máximo `tamanho` códigos (padrão 20, máx. 40) a partir do cursor
// guardado em pcp_execucoes (pagina = próximo índice, cursor = total da lista). Os produtos
// vão para um lote de STAGING; o lote só vira o ativo quando a lista inteira foi percorrida —
// antes disso o catálogo anterior segue intacto. HTTP 425 ou "consumo redundante": para, grava
// a hora da próxima tentativa (guarda de 12 h) e NÃO repete em laço. Só leitura: nenhum
// método do Omie que grave é chamado. Contrato puro: src/lib/pcp/catalogo-sync.ts.
routerAdd(
  'POST',
  '/backend/v1/pcp/catalogo/sync',
  (e) => {
    const GUARDA_MS = 12 * 60 * 60 * 1000
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Sessão ausente ou expirada.')
    let perfil = null
    try {
      perfil = $app.findFirstRecordByFilter('pcp_perfis', 'usuario = {:u}', { u: auth.id })
    } catch (_) {}
    if (!perfil || !perfil.getBool('ativo') || !perfil.getBool('pode_atualizar_fontes')) {
      return e.forbiddenError('sem_permissao_tecnica')
    }
    const body = e.requestInfo().body
    let tamanho = Number(body.tamanho || 20)
    if (!(tamanho >= 1)) tamanho = 20
    if (tamanho > 40) tamanho = 40
    const reiniciar = body.reiniciar === true

    const appKey = $secrets.get('OMIE_APP_KEY')
    const appSecret = $secrets.get('OMIE_APP_SECRET')
    if (!appKey || !appSecret) return e.badRequestError('credencial_ausente')

    let fonte = null
    try {
      fonte = $app.findFirstRecordByFilter(
        'pcp_fontes',
        "fonte = 'omie' && recurso = 'produtos' && aplicativo_ref = 'app1'",
        {},
      )
    } catch (_) {}
    if (!fonte) return e.badRequestError('fonte_produtos_ausente')
    let fonteEstoque = null
    try {
      fonteEstoque = $app.findFirstRecordByFilter(
        'pcp_fontes',
        "fonte = 'omie' && recurso = 'estoque' && aplicativo_ref = 'app1'",
        {},
      )
    } catch (_) {}
    if (!fonteEstoque || !fonteEstoque.getString('lote_ativo')) {
      return e.badRequestError('estoque_sem_lote_ativo')
    }

    // Lista de códigos: estoque ativo, em maiúsculas, sem repetição, ordem estável.
    const itensEstoque = $app.findRecordsByFilter('pcp_dados', 'lote = {:l}', '', 20000, 0, {
      l: fonteEstoque.getString('lote_ativo'),
    })
    const vistos = {}
    const codigos = []
    for (const r of itensEstoque) {
      let c = ''
      try {
        c = String(JSON.parse(r.getString('conteudo')).codigo || '')
          .trim()
          .toUpperCase()
      } catch (_) {}
      if (c && !vistos[c]) {
        vistos[c] = true
        codigos.push(c)
      }
    }
    codigos.sort()
    if (codigos.length === 0) return e.badRequestError('lista_de_codigos_vazia')

    // Execução em andamento (cursor) ou nova.
    let exec = null
    try {
      exec = $app.findFirstRecordByFilter(
        'pcp_execucoes',
        "fonte = 'omie' && recurso = 'produtos_dirigido' && estado = 'em_andamento'",
        {},
      )
    } catch (_) {}
    if (exec && reiniciar) {
      exec.set('estado', 'falha')
      exec.set('erro_codigo', 'reiniciada_pelo_operador')
      $app.save(exec)
      exec = null
    }
    if (exec && Number(exec.getString('cursor') || 0) !== codigos.length) {
      exec.set('estado', 'falha')
      exec.set('erro_codigo', 'lista_mudou')
      exec.set('erro_mensagem', 'a posição de estoque mudou durante a leitura; recomeçando')
      $app.save(exec)
      exec = null
    }
    let lote = null
    if (!exec) {
      $app.runInTransaction((tx) => {
        const colExec = tx.findCollectionByNameOrId('pcp_execucoes')
        const nova = new Record(colExec)
        nova.set('fonte', 'omie')
        nova.set('aplicativo_ref', 'app1')
        nova.set('recurso', 'produtos_dirigido')
        nova.set('estado', 'em_andamento')
        nova.set('pagina', 0)
        nova.set('cursor', String(codigos.length))
        tx.save(nova)
        const colLote = tx.findCollectionByNameOrId('pcp_lotes')
        const novoLote = new Record(colLote)
        novoLote.set('fonte', 'omie')
        novoLote.set('recurso', 'produtos')
        novoLote.set('aplicativo_ref', 'app1')
        novoLote.set('estado', 'staging')
        novoLote.set('execucao', nova.id)
        tx.save(novoLote)
        exec = nova
        lote = novoLote
      })
    } else {
      lote = $app.findFirstRecordByFilter('pcp_lotes', 'execucao = {:e}', { e: exec.id })
    }

    // Guarda depois de bloqueio: não consulta nada antes da hora.
    if (exec.getString('erro_codigo') === 'bloqueado_omie') {
      const ate = Date.parse(exec.getString('erro_mensagem').replace('proxima:', ''))
      if (ate && Date.now() < ate) {
        return e.json(200, {
          ok: true,
          parou: 'aguardando_guarda',
          proxima_tentativa: new Date(ate).toISOString(),
          feitos: Number(exec.get('pagina') || 0),
          total: codigos.length,
        })
      }
    }

    const consultar = (codigo) => {
      try {
        const res = $http.send({
          url: 'https://app.omie.com.br/api/v1/geral/produtos/',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            call: 'ConsultarProduto',
            app_key: appKey,
            app_secret: appSecret,
            param: [{ codigo: codigo }],
          }),
          timeout: 15,
        })
        const falha = String((res.json && res.json.faultstring) || '').toLowerCase()
        if (res.statusCode === 425) return { tipo: 'bloqueado', motivo: 'http_425' }
        if (falha.indexOf('consumo redundante') >= 0) {
          return { tipo: 'bloqueado', motivo: 'consumo_redundante' }
        }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const j = res.json
          if (j && j.descricao !== undefined && j.descricao !== null) return { tipo: 'ok', j: j }
          return { tipo: 'nao_encontrado' }
        }
        if (res.statusCode === 404) return { tipo: 'nao_encontrado' }
        if (res.statusCode >= 500 || res.statusCode === 0) return { tipo: 'erro' }
        return { tipo: 'nao_encontrado' }
      } catch (_) {
        return { tipo: 'erro' }
      }
    }
    const pausa = (ms) => {
      const fim = Date.now() + ms
      while (Date.now() < fim) {}
    }

    let cursor = Number(exec.get('pagina') || 0)
    let consultados = 0
    let encontrados = 0
    let naoEncontrados = 0
    let parou = 'fim_do_sublote'
    let proxima = ''
    while (cursor < codigos.length && consultados < tamanho) {
      const codigo = codigos[cursor]
      if (consultados > 0) pausa(350) // ≈2,8 consultas por segundo, abaixo do limite de 3
      const r = consultar(codigo)
      consultados += 1
      if (r.tipo === 'bloqueado') {
        proxima = new Date(Date.now() + GUARDA_MS).toISOString()
        exec.set('erro_codigo', 'bloqueado_omie')
        exec.set('erro_mensagem', 'proxima:' + proxima)
        exec.set('pagina', cursor)
        $app.save(exec)
        fonte.set('estado_tecnico', 'bloqueado_omie')
        fonte.set('ultima_tentativa', new Date().toISOString())
        $app.save(fonte)
        parou = 'bloqueio_omie'
        break
      }
      if (r.tipo === 'erro') {
        exec.set('erro_codigo', 'erro_transitorio')
        exec.set(
          'erro_mensagem',
          'falha ao consultar ' + codigo + '; tenta de novo no mesmo código',
        )
        exec.set('pagina', cursor)
        $app.save(exec)
        parou = 'erro_transitorio'
        break
      }
      if (r.tipo === 'ok') {
        const j = r.j
        const unidade =
          j.unidade === null || j.unidade === undefined || j.unidade === ''
            ? null
            : String(j.unidade)
        const inativo = j.inativo === true || j.inativo === 'S' || j.inativo === 'true'
        // Mesmo formato do catálogo lido por pcp_catalogo.js: ativo 'S'/'N', produto_id e família.
        const linha = {
          produto_id: String(j.codigo_produto || ''),
          codigo: codigo,
          descricao: String(j.descricao || ''),
          unidade: unidade,
          ativo: inativo ? 'N' : 'S',
          familia: String(j.descricao_familia || j.codigo_familia || ''),
          origem: 'consulta_dirigida',
        }
        const chave = 'omie:produtos:app1:' + codigo
        let rec = null
        try {
          rec = $app.findFirstRecordByFilter('pcp_dados', 'lote = {:l} && chave_origem = {:k}', {
            l: lote.id,
            k: chave,
          })
        } catch (_) {}
        if (rec) {
          rec.set('conteudo', JSON.stringify(linha))
          $app.save(rec)
        } else {
          const colDados = $app.findCollectionByNameOrId('pcp_dados')
          const novo = new Record(colDados)
          novo.set('lote', lote.id)
          novo.set('chave_origem', chave)
          novo.set('conteudo', JSON.stringify(linha))
          $app.save(novo)
        }
        encontrados += 1
      } else {
        naoEncontrados += 1 // vira a lista de faltantes (comparação estoque × catálogo)
      }
      cursor += 1
    }

    if (parou === 'fim_do_sublote') {
      exec.set('pagina', cursor)
      exec.set('erro_codigo', '')
      exec.set('erro_mensagem', '')
      $app.save(exec)
    }

    let ativado = false
    if (cursor >= codigos.length && parou === 'fim_do_sublote') {
      $app.runInTransaction((tx) => {
        let anterior = null
        try {
          anterior = tx.findFirstRecordByFilter(
            'pcp_lotes',
            "fonte = 'omie' && recurso = 'produtos' && estado = 'completo'",
            {},
          )
        } catch (_) {}
        if (anterior && anterior.id !== lote.id) {
          anterior.set('estado', 'substituido')
          tx.save(anterior)
        }
        const doLote = tx.findRecordsByFilter('pcp_dados', 'lote = {:l}', '', 20000, 0, {
          l: lote.id,
        })
        lote.set('estado', 'completo')
        lote.set('total_itens', doLote.length)
        lote.set('concluido_em', new Date().toISOString())
        tx.save(lote)
        fonte.set('lote_ativo', lote.id)
        fonte.set('ultimo_sucesso', new Date().toISOString())
        fonte.set('estado_tecnico', 'ok')
        tx.save(fonte)
        exec.set('estado', 'concluida')
        exec.set('fim', new Date().toISOString())
        tx.save(exec)
      })
      ativado = true
      parou = 'fim_da_lista'
    }

    return e.json(200, {
      ok: true,
      parou: parou,
      consultados: consultados,
      encontrados: encontrados,
      nao_encontrados: naoEncontrados,
      feitos: cursor,
      total: codigos.length,
      proxima_tentativa: proxima || null,
      lote_ativado: ativado,
    })
  },
  $apis.requireAuth(),
)
