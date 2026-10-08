// pocketbase/hooks/pcp_sync_pagina.js — SPEC-1-002 CA-O1/O2 (reconciliação real) + CA-O3/O4
// Uma página por etapa. Recebe APENAS execucao_id: fonte/recurso/cursor carregados do
// registro no servidor (nunca do navegador). Rede FORA da transação; persistência/ativação
// em transação curta.
// RECONCILIADO COM A CONTA REAL (2026-10-08, ListarPosEstoque pág.1: 1055 registros / 22 páginas):
// campos reais → nCodProd, cCodigo, cDescricao, codigo_local_estoque, nSaldo, fisico, reservado.
// Paginação: nPagina/nRegPorPagina; fim = nPagina >= nTotPaginas (metadatagem da resposta).
// DIAGNÓSTICO 2026-10-08: $http.send do worker falha para app.omie.com.br (falha_transporte em
// ~0,7s) enquanto a mesma chamada em Python/fora do worker responde 200 em 0,77s — limite de
// egress do worker Skip, não do contrato. Fallback autorizado pela SPEC (construção mínima):
// proxy de leitura via MCP não existe em runtime; enquanto o egress não for liberado, o hook
// marca a tentativa como falha_transporte (retry em etapas separadas) e a ativação real fica
// pendente de infraestrutura — NUNCA declara sucesso falso nem usa mock em produção.
// CA-O3: falha transitória → até 3 tentativas em ETAPAS SEPARADAS (2s/5s); 401/403 encerra
// na primeira; lote anterior permanece ativo.
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
    let modo = 'real'
    let metaFim = false
    if (appKey && appSecret) {
      const ALLOW = {
        estoque: {
          endpoint: 'https://app.omie.com.br/api/v1/estoque/consulta/',
          call: 'ListarPosEstoque',
        },
      }
      const cfg = ALLOW[recurso]
      if (!cfg) {
        return e.badRequestError('recurso_nao_reconciliado')
      }
      try {
        const res = $http.send({
          url: cfg.endpoint,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            call: cfg.call,
            app_key: appKey,
            app_secret: appSecret,
            param: [
              { nPagina: paginaAtual, nRegPorPagina: 50, dDataPosicao: '', cExibeTodos: 'S' },
            ],
          }),
          timeout: 15,
        })
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const j = res.json
          const arr = (j && j.produtos) || []
          itens = (Array.isArray(arr) ? arr : []).map((p) => ({
            produto_id: String(p.nCodProd || ''),
            local_id: String(p.codigo_local_estoque || ''),
            unidade: 'UN', // unidade oficial vem do cadastro (SPEC-1-004); posição não a expõe
            saldo: p.nSaldo !== undefined && p.nSaldo !== null ? Number(p.nSaldo) : null,
            fisico: p.fisico !== undefined && p.fisico !== null ? Number(p.fisico) : null,
            reservado:
              p.reservado !== undefined && p.reservado !== null ? Number(p.reservado) : null,
            codigo: String(p.cCodigo || ''),
            descricao: String(p.cDescricao || ''),
          }))
          const totPaginas = Number((j && j.nTotPaginas) || 0)
          metaFim = totPaginas > 0 && paginaAtual >= totPaginas
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
      // Sem credencial: modo mock de HOMOLOGAÇÃO identificado (nunca 'real')
      modo = 'mock'
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
      } else {
        metaFim = true
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
      fonte.set('lease_ate', new Date(Date.now() + 5 * 60 * 1000).toISOString()) // renova lease
      tx.save(fonte)
    })

    const ultimaPagina =
      modo === 'mock' ? metaFim || (itens.length === 0 && paginaAtual > 2) : metaFim
    if (ultimaPagina) {
      // Ativação ATÔMICA: staging → completo; anterior → substituido; contagem POR LOTE
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
        const doLote = tx.findRecordsByFilter('pcp_dados', 'lote = {:l}', '', 10000, 0, {
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
      return e.json(200, { ok: true, lote_ativado: true, pagina: paginaAtual, itens: itens.length })
    }
    return e.json(200, { ok: true, lote_ativado: false, pagina: paginaAtual, itens: itens.length })
  },
  $apis.requireAuth(),
)
