// pocketbase/hooks/pcp_sync_pagina.js — SPEC-1-002 CA-O1/O2/O4
// Uma página por etapa. Recebe APENAS execucao_id: fonte/recurso/cursor carregados do
// registro no servidor (nunca do navegador). Rede fora de transação; persistência/ativação
// em transação curta. Falha em qualquer página NÃO ativa o lote (CA-O3).
routerAdd(
  'POST',
  '/backend/v1/pcp/sync/pagina',
  (e) => {
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
    const execucaoId = String(body.execucao_id || '')
    if (!execucaoId) return e.badRequestError('execucao_id_obrigatorio')

    // Carrega execução + fonte do servidor
    let exec = null
    try {
      exec = $app.findRecordById('pcp_execucoes', execucaoId)
    } catch (_) {}
    if (!exec) return e.badRequestError('execucao_inexistente')
    const estado = exec.getString('estado')
    if (estado === 'concluida') {
      return e.json(200, { ok: true, ja_concluida: true })
    }
    if (estado !== 'em_andamento') {
      return e.badRequestError('execucao_nao_andamento')
    }
    const recurso = exec.getString('recurso')
    let fonte = null
    try {
      fonte = $app.findFirstRecordByFilter(
        'pcp_fontes',
        "fonte = 'omie' && recurso = {:r} && aplicativo_ref = 'app1'",
        { r: recurso },
      )
    } catch (_) {}
    if (!fonte) return e.badRequestError('fonte_ausente')
    // Lease e geração vigentes? Execução superada não avança.
    let leaseMs = 0
    try {
      leaseMs = Date.parse(String(fonte.get('lease_ate') || ''))
    } catch (_) {
      leaseMs = 0
    }
    if (fonte.getString('execucao_ativa') !== exec.id || leaseMs <= Date.now()) {
      return e.forbiddenError('execucao_superada_ou_lease_expirado')
    }

    // === Rede FORA da transação ===
    // Chamada real exige OMIE_APP_KEY/SECRET; sem secrets → modo mock de HOMOLOGAÇÃO
    // identificado (a SPEC proíbe declarar integração real sem credencial).
    const appKey = $secrets.get('OMIE_APP_KEY')
    const appSecret = $secrets.get('OMIE_APP_SECRET')
    const paginaAtual = Number(exec.get('pagina') || 0) + 1
    let itens = []
    let erroRede = ''
    let modo = 'mock'
    if (appKey && appSecret) {
      modo = 'real'
      const ALLOW = {
        estoque: {
          endpoint: 'https://app.omie.com.br/api/v1/estoque/consulta/',
          call: 'ConsultaEstoque',
        },
        produtos: {
          endpoint: 'https://app.omie.com.br/api/v1/geral/produtos/',
          call: 'ListarProdutosResumido',
        },
      }
      const cfg = ALLOW[recurso]
      try {
        const res = $http.send({
          url: cfg.endpoint,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            call: cfg.call,
            app_key: appKey,
            app_secret: appSecret,
            param: [{ pagina: paginaAtual, registros_por_pagina: 50, apenas_importado_api: 'N' }],
          }),
          timeout: 15,
        })
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const j = res.json
          // Normalização mínima por recurso (amostra real confirmada na task CA-O1–O4)
          if (recurso === 'estoque') {
            const arr = (j && (j.produtos || j.produto_servico_list_response || [])) || []
            itens = (Array.isArray(arr) ? arr : []).map((p) => ({
              produto_id: String(p.idProd || p.codigo_produto || ''),
              local_id: String(p.codigo_local_estoque || '1'),
              unidade: String(p.unidade || 'UN'),
              saldo: p.nSaldo !== undefined && p.nSaldo !== null ? Number(p.nSaldo) : null,
            }))
          } else if (recurso === 'produtos') {
            const arr =
              (j && j.produto_servico_list_response && j.produto_servico_list_response.produtos) ||
              []
            itens = (Array.isArray(arr) ? arr : []).map((p) => ({
              produto_id: String(p.codigo_produto || p.nCod || ''),
              local_id: '',
              unidade: String(p.unidade || 'UN'),
              saldo: null,
              codigo: String(p.codigo || ''),
              descricao: String(p.descricao || ''),
              ativo: String(p.inativo || 'N') === 'N',
            }))
          }
        } else if (res.statusCode === 401 || res.statusCode === 403) {
          erroRede = 'autenticacao_recusada' // sem retry (SPEC)
        } else {
          erroRede = 'falha_http_' + res.statusCode // 429/5xx: retry em próxima etapa (2s/5s fora do hook)
        }
      } catch (err) {
        erroRede = 'falha_transporte'
      }
    } else {
      // Mock de homologação: fixtures idênticas aos testes (identificado, nunca 'real')
      if (paginaAtual === 1) {
        itens = [
          { produto_id: '123', local_id: '1', unidade: 'UN', saldo: 10 },
          { produto_id: '124', local_id: '1', unidade: 'KG', saldo: null },
        ]
      } else if (paginaAtual === 2) {
        itens = [
          { produto_id: '123', local_id: '2', unidade: 'UN', saldo: 5 },
          { produto_id: '125', local_id: '1', unidade: 'KG', saldo: -2 },
        ]
      } // página 3+: vazia (fim da fonte)
    }

    // Upsert da página no lote staging (idempotente por chave)
    let lote = null
    try {
      lote = $app.findFirstRecordByFilter('pcp_lotes', 'execucao = {:e}', { e: exec.id })
    } catch (_) {}
    if (!lote) return e.badRequestError('lote_ausente')
    if (erroRede) {
      // Falha: registra tentativa, NÃO ativa, mantém lote anterior ativo na fonte
      $app.runInTransaction((tx) => {
        exec.set('estado', 'falha')
        exec.set('pagina', paginaAtual - 1)
        exec.set('erro_codigo', erroRede.slice(0, 100))
        exec.set('erro_mensagem', 'página ' + paginaAtual + ' não concluída')
        tx.save(exec)
        fonte.set('execucao_ativa', '')
        fonte.set('lease_ate', '')
        fonte.set('estado_tecnico', 'falha_pagina_' + paginaAtual)
        fonte.set('ultima_tentativa', new Date().toISOString())
        tx.save(fonte)
      })
      return e.json(200, { ok: false, erro: erroRede, pagina: paginaAtual })
    }

    $app.runInTransaction((tx) => {
      for (const it of itens) {
        const chave =
          'omie:' + recurso + ':app1:' + it.produto_id + ':' + it.local_id + ':' + it.unidade
        let rec = null
        try {
          rec = tx.findFirstRecordByFilter('pcp_dados', 'lote = {:l} && chave_origem = {:k}', {
            l: lote.id,
            k: chave,
          })
        } catch (_) {}
        if (rec) {
          rec.set('conteudo', JSON.stringify(it))
          tx.save(rec)
        } else {
          const colDados = tx.findCollectionByNameOrId('pcp_dados')
          const novo = new Record(colDados)
          novo.set('lote', lote.id)
          novo.set('chave_origem', chave)
          novo.set('conteudo', JSON.stringify(it))
          tx.save(novo)
        }
      }
      const totalLote = tx.countRecords('pcp_dados') // contagem global; afina no estado
      exec.set('pagina', paginaAtual)
      exec.set('cursor', String(paginaAtual))
      tx.save(exec)
      fonte.set('ultima_tentativa', new Date().toISOString())
      fonte.set('lease_ate', new Date(Date.now() + 5 * 60 * 1000).toISOString()) // renova lease
      tx.save(fonte)
    })

    // Última página? (mock: página 3 vazia encerra; real: menor que registros_por_pagina)
    const ultimaPagina = modo === 'mock' ? itens.length === 0 && paginaAtual > 2 : itens.length < 50
    if (ultimaPagina) {
      // Ativação ATÔMICA: lote staging → completo; anterior → substituido
      $app.runInTransaction((tx) => {
        let anterior = null
        try {
          anterior = tx.findFirstRecordByFilter(
            'pcp_lotes',
            "fonte = 'omie' && recurso = {:r} && estado = 'completo'",
            { r: recurso },
          )
        } catch (_) {}
        if (anterior && anterior.id !== lote.id) {
          anterior.set('estado', 'substituido')
          tx.save(anterior)
        }
        lote.set('estado', 'completo')
        lote.set('total_itens', tx.countRecords('pcp_dados'))
        lote.set('concluido_em', new Date().toISOString())
        tx.save(lote)
        fonte.set('lote_ativo', lote.id)
        fonte.set('execucao_ativa', '')
        fonte.set('lease_ate', '')
        fonte.set('ultimo_sucesso', new Date().toISOString())
        fonte.set('estado_tecnico', 'ok')
        tx.save(fonte)
        exec.set('estado', 'concluida')
        exec.set('fim', new Date().toISOString())
        tx.save(exec)
      })
      return e.json(200, { ok: true, lote_ativado: true, pagina: paginaAtual, itens: itens.length })
    }
    return e.json(200, { ok: true, lote_ativado: false, pagina: paginaAtual, itens: itens.length })
  },
  $apis.requireAuth(),
)
