// pocketbase/hooks/pcp_sync_pagina.js — SPEC-1-002 CA-O1–O4 · RECONCILIAÇÃO REAL (CL-001)
// Uma página por etapa. Recebe APENAS execucao_id: fonte/recurso/cursor carregados do
// registro no servidor (nunca do navegador). Rede FORA da transação; persistência/ativação
// em transação curta.
// CA-O3: falha transitória (5xx/429/transporte) NÃO encerra a execução — até 3 tentativas
// em ETAPAS SEPARADAS (2s/5s), mesma execução/cursor; 401/403 sem retry; lote anterior ativo.
//
// RECURSO PILOTO REAL = "estoque" via ListarMovimentoEstoque (janela de 90 dias):
// a conta real confirma idProd/codigo_local_estoque/qtde/saldo/tipo/dtMov em cada movimento.
// O último saldo por (idProd, local) reconstrói a POSIÇÃO de estoque sem inventar local.
// "produtos" usa ListarProdutosResumido (pagina/registros_por_pagina confirmado na conta).
// Mock de homologação permanece para ambiente SEM secrets (identificado, nunca 'real').
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

    let exec = null
    try {
      exec = $app.findRecordById('pcp_execucoes', execucaoId)
    } catch (_) {}
    if (!exec) return e.badRequestError('execucao_inexistente')
    const estadoExec = exec.getString('estado')
    if (estadoExec === 'concluida') {
      return e.json(200, { ok: true, ja_concluida: true })
    }
    if (estadoExec === 'falha') {
      return e.badRequestError('execucao_em_falha')
    }
    if (estadoExec !== 'em_andamento') {
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
    let leaseMs = 0
    try {
      leaseMs = Date.parse(String(fonte.get('lease_ate') || ''))
    } catch (_) {
      leaseMs = 0
    }
    if (fonte.getString('execucao_ativa') !== exec.id || leaseMs <= Date.now()) {
      return e.forbiddenError('execucao_superada_ou_lease_expirado')
    }

    const erroAnterior = exec.getString('erro_codigo') || ''
    const tentativas = erroAnterior.indexOf('retry_') === 0 ? Number(erroAnterior.slice(6)) || 0 : 0

    // === Rede FORA da transação ===
    const appKey = $secrets.get('OMIE_APP_KEY')
    const appSecret = $secrets.get('OMIE_APP_SECRET')
    const paginaAtual = Number(exec.get('pagina') || 0) + 1
    let itens = []
    let erroRede = ''
    let transitorio = false
    let modo = 'mock'
    if (appKey && appSecret) {
      modo = 'real'
      const ALLOW = {
        estoque: {
          endpoint: 'https://app.omie.com.br/api/v1/estoque/consulta/',
          call: 'ListarMovimentoEstoque',
        },
        produtos: {
          endpoint: 'https://app.omie.com.br/api/v1/geral/produtos/',
          call: 'ListarProdutosResumido',
        },
      }
      const cfg = ALLOW[recurso]
      let body = null
      if (recurso === 'estoque') {
        // Janela de 90 dias (limite da Fase 1); dtMov no formato da conta real dd/mm/aaaa
        const fmt = (d) => {
          const p = (n) => String(n).padStart(2, '0')
          return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear()
        }
        const fim = new Date()
        const ini = new Date(Date.now() - 90 * 24 * 3600 * 1000)
        body = {
          param: [
            { nPagina: paginaAtual, nRegPorPagina: 50, dDtInicial: fmt(ini), dDtFinal: fmt(fim) },
          ],
        }
      } else {
        body = {
          param: [{ pagina: paginaAtual, registros_por_pagina: 50, apenas_importado_api: 'N' }],
        }
      }
      try {
        const res = $http.send({
          url: cfg.endpoint,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ call: cfg.call, app_key: appKey, app_secret: appSecret, ...body }),
          timeout: 15,
        })
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const j = res.json
          if (j && (j.faultstring || j.status === 'error')) {
            // Falha de negócio da Omie (ex.: método/param) — não é dado; trata como erro de fonte
            erroRede = 'omie_erro_negocio'
            transitorio = true
          } else if (recurso === 'estoque') {
            // Normalização REAL confirmada na conta: movimento com idProd, local, qtde, saldo
            const movs = (j && j.movProdutoListar) || []
            const vistos = {}
            for (const m of movs) {
              const pid = String(m.idProd || '')
              const lid = String(m.codigo_local_estoque || '')
              const k = pid + ':' + lid
              // último movimento do produto+local na página vence (ordenado por data na fonte)
              vistos[k] = {
                produto_id: pid,
                local_id: lid,
                unidade: 'UN',
                saldo: m.saldo !== undefined && m.saldo !== null ? Number(m.saldo) : null,
              }
            }
            itens = Object.keys(vistos).map((k) => vistos[k])
          } else if (recurso === 'produtos') {
            const arr = (j && j.produto_servico_resumido) || []
            itens = (Array.isArray(arr) ? arr : []).map((p) => ({
              produto_id: String(p.codigo_produto || ''),
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
        } else if (res.statusCode === 429 || res.statusCode >= 500) {
          erroRede = 'falha_http_' + res.statusCode
          transitorio = true
        } else {
          erroRede = 'falha_http_' + res.statusCode
        }
      } catch (err) {
        erroRede = 'falha_transporte'
        transitorio = true
      }
    } else {
      // Mock de homologação: fixtures idênticas aos testes (identificado, nunca 'real').
      const simPg = Number($secrets.get('PCP_SIMULAR_FALHA_PAGINA') || 0)
      if (simPg === paginaAtual) {
        erroRede = 'falha_simulada_homolog'
        transitorio = true
      } else if (paginaAtual === 1) {
        itens = [
          { produto_id: '123', local_id: '1', unidade: 'UN', saldo: 10 },
          { produto_id: '124', local_id: '1', unidade: 'KG', saldo: null },
        ]
      } else if (paginaAtual === 2) {
        itens = [
          { produto_id: '123', local_id: '2', unidade: 'UN', saldo: 5 },
          { produto_id: '125', local_id: '1', unidade: 'KG', saldo: -2 },
        ]
      }
    }

    let lote = null
    try {
      lote = $app.findFirstRecordByFilter('pcp_lotes', 'execucao = {:e}', { e: exec.id })
    } catch (_) {}
    if (!lote) return e.badRequestError('lote_ausente')
    if (erroRede) {
      if (transitorio && tentativas + 1 < 3) {
        $app.runInTransaction((tx) => {
          exec.set('erro_codigo', 'retry_' + (tentativas + 1))
          exec.set(
            'erro_mensagem',
            'tentativa ' + (tentativas + 1) + ' da página ' + paginaAtual + ': ' + erroRede,
          )
          tx.save(exec)
          fonte.set('ultima_tentativa', new Date().toISOString())
          fonte.set('lease_ate', new Date(Date.now() + 5 * 60 * 1000).toISOString())
          tx.save(fonte)
        })
        return e.json(200, {
          ok: false,
          retry: true,
          tentativa: tentativas + 1,
          erro: erroRede,
          pagina: paginaAtual,
          proxima_em_ms: tentativas + 1 === 1 ? 2000 : 5000,
        })
      }
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
      return e.json(200, { ok: false, erro: erroRede, pagina: paginaAtual, encerrada: true })
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
      exec.set('pagina', paginaAtual)
      exec.set('cursor', String(paginaAtual))
      exec.set('erro_codigo', '')
      exec.set('erro_mensagem', '')
      tx.save(exec)
      fonte.set('ultima_tentativa', new Date().toISOString())
      fonte.set('lease_ate', new Date(Date.now() + 5 * 60 * 1000).toISOString())
      tx.save(fonte)
    })

    // Última página: real = veio menos que o tamanho da página; mock = página 3 vazia
    const ultimaPagina = modo === 'real' ? itens.length < 50 : itens.length === 0 && paginaAtual > 2
    if (ultimaPagina) {
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
        const doLote = tx.findRecordsByFilter('pcp_dados', 'lote = {:l}', '', 100000, 0, {
          l: lote.id,
        })
        lote.set('estado', 'completo')
        lote.set('total_itens', doLote.length)
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
      return e.json(200, {
        ok: true,
        lote_ativado: true,
        pagina: paginaAtual,
        itens: itens.length,
        modo,
      })
    }
    return e.json(200, {
      ok: true,
      lote_ativado: false,
      pagina: paginaAtual,
      itens: itens.length,
      modo,
    })
  },
  $apis.requireAuth(),
)
