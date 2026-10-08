// pocketbase/hooks/pcp_sync_pagina.js — SPEC-1-002/1-003/1-004 (reconciliado com as contas reais)
// Uma página por etapa. Recebe APENAS execucao_id: fonte/recurso/cursor carregados do
// registro no servidor (nunca do navegador). Rede FORA da transação; persistência/ativação
// em transação curta.
// OMIE (CL-001): ListarPosEstoque (estoque) + ListarPedidos (pedidos — CA-N3) +
// ListarProdutosResumido (produtos — SPEC-1-004; conta real com cadastro VAZIO = lote vazio
// legítimo, não erro); rate-limit = HTTP 500 REDUNDANT com janela "Aguarde N segundos" no
// corpo — SPEC manda respeitar a janela quando a fonte a informa.
// NUVEMSHOP (CL-002): GET /v1/{store_id}/orders, auth "Authentication: <token>", User-Agent
// obrigatório; paginação page/per_page (máx. 200); fim = arr.length < 200.
// CA-O3: falha transitória → até 3 tentativas em ETAPAS SEPARADAS; 401/403 encerra
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
        "fonte = {:f} && recurso = {:r} && aplicativo_ref = 'app1'",
        { f: exec.getString('fonte'), r: recurso },
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
    const paginaAtual = Number(exec.get('pagina') || 0) + 1
    let itens = []
    let erroRede = ''
    let transitorio = false
    let esperaMs = 0
    let metaFim = false
    const fonteNome = exec.getString('fonte')

    if (fonteNome === 'omie') {
      const appKey = $secrets.get('OMIE_APP_KEY')
      const appSecret = $secrets.get('OMIE_APP_SECRET')
      if (appKey && appSecret) {
        const ALLOW = {
          estoque: {
            endpoint: 'https://app.omie.com.br/api/v1/estoque/consulta/',
            call: 'ListarPosEstoque',
            param: () => [
              { nPagina: paginaAtual, nRegPorPagina: 50, dDataPosicao: '', cExibeTodos: 'S' },
            ],
          },
          pedidos: {
            endpoint: 'https://app.omie.com.br/api/v1/produtos/pedido/',
            call: 'ListarPedidos',
            param: () => [{ pagina: paginaAtual, registros_por_pagina: 100 }],
          },
          produtos: {
            endpoint: 'https://app.omie.com.br/api/v1/geral/produtos/',
            call: 'ListarProdutosResumido',
            param: () => [{ pagina: paginaAtual, registros_por_pagina: 100 }],
          },
        }
        const cfg = ALLOW[recurso]
        if (!cfg) return e.badRequestError('recurso_nao_reconciliado')
        try {
          const res = $http.send({
            url: cfg.endpoint,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              call: cfg.call,
              app_key: appKey,
              app_secret: appSecret,
              param: cfg.param(),
            }),
            timeout: 15,
          })
          if (res.statusCode === 401 || res.statusCode === 403) {
            erroRede = 'autenticacao_recusada'
          } else if (res.statusCode >= 200 && res.statusCode < 300) {
            const j = res.json
            if (recurso === 'estoque') {
              const arr = (j && j.produtos) || []
              itens = (Array.isArray(arr) ? arr : []).map((p) => ({
                produto_id: String(p.nCodProd || ''),
                local_id: String(p.codigo_local_estoque || ''),
                unidade: 'UN',
                saldo: p.nSaldo !== undefined && p.nSaldo !== null ? Number(p.nSaldo) : null,
                fisico: p.fisico !== undefined && p.fisico !== null ? Number(p.fisico) : null,
                reservado:
                  p.reservado !== undefined && p.reservado !== null ? Number(p.reservado) : null,
                codigo: String(p.cCodigo || ''),
                descricao: String(p.cDescricao || ''),
              }))
              const totPaginas = Number((j && j.nTotPaginas) || 0)
              metaFim = totPaginas > 0 && paginaAtual >= totPaginas
            } else if (recurso === 'pedidos') {
              const arr = (j && j.pedido_venda_produto) || []
              itens = (Array.isArray(arr) ? arr : []).map((p) => {
                const cab = (p && p.cabecalho) || {}
                return {
                  cabecalho: {
                    codigo_pedido:
                      cab.codigo_pedido !== undefined && cab.codigo_pedido !== null
                        ? String(cab.codigo_pedido)
                        : '',
                    codigo_pedido_integracao: String(cab.codigo_pedido_integracao || ''),
                    numero_pedido: String(cab.numero_pedido || ''),
                    origem_pedido: String(cab.origem_pedido || ''),
                    etapa: String(cab.etapa || ''),
                    data_previsao: String(cab.data_previsao || ''),
                  },
                }
              })
              const totPaginas = Number((j && j.total_de_paginas) || 0)
              metaFim = totPaginas > 0 && paginaAtual >= totPaginas
            } else if (recurso === 'produtos') {
              const arr = (j && j.produtos) || []
              itens = (Array.isArray(arr) ? arr : []).map((p) => ({
                produto_id: String(p.codigo_produto || ''),
                codigo: String(p.codigo || ''),
                descricao: String(p.descricao || ''),
                unidade: String(p.unidade || ''),
                ativo: String(p.inativo || 'N') === 'N' ? 'S' : 'N',
                familia: String(p.descricao_familia || p.codigo_familia || ''),
              }))
              const totPaginas = Number((j && j.total_de_paginas) || 0)
              metaFim = totPaginas > 0 && paginaAtual >= totPaginas
            }
          } else {
            erroRede = 'falha_http_' + res.statusCode
            transitorio = res.statusCode === 429 || res.statusCode >= 500
            // SPEC: respeitar janela quando a fonte a informa (Omie: "Aguarde N segundos" no corpo)
            const aguarde = /Aguarde\s+(\d+)\s+segundos/.exec(
              String((res.json && res.json.faultstring) || ''),
            )
            if (aguarde) esperaMs = Math.min(Number(aguarde[1]) + 5, 90) * 1000
          }
        } catch (err) {
          erroRede = 'falha_transporte'
          transitorio = true
        }
      } else {
        erroRede = 'credencial_ausente'
      }
    } else if (fonteNome === 'nuvemshop') {
      const storeId = $secrets.get('NUVEMSHOP_STORE_ID')
      const nsToken = $secrets.get('NUVEMSHOP_TOKEN')
      if (storeId && nsToken) {
        const ALLOW_NS = { pedidos: 'pedidos' }
        if (!ALLOW_NS[recurso]) return e.badRequestError('recurso_nao_reconciliado')
        try {
          const res = $http.send({
            url:
              'https://api.tiendanube.com/v1/' +
              storeId +
              '/orders?per_page=200&page=' +
              paginaAtual,
            method: 'GET',
            headers: { Authentication: nsToken, 'User-Agent': 'mcc-automacao-fabrica (executor)' },
            timeout: 15,
          })
          if (res.statusCode === 401 || res.statusCode === 403) {
            erroRede = 'autenticacao_recusada'
          } else if (res.statusCode >= 200 && res.statusCode < 300) {
            const j = res.json
            const arr = Array.isArray(j) ? j : []
            itens = arr.map((o) => ({
              pedido_id: String(o.id || ''),
              numero: String(o.number || ''),
              status: String(o.status || ''),
              pagamento: String(o.payment_status || ''),
              criado_em: String(o.created_at || ''),
              atualizado_em: String(o.updated_at || ''),
              total: o.total !== undefined && o.total !== null ? Number(o.total) : null,
              itens: (o.products || []).map((p) => ({
                item_id: String(p.id || ''),
                product_id: String(p.product_id || ''),
                variant_id: String(p.variant_id || ''),
                quantidade:
                  p.quantity !== undefined && p.quantity !== null ? Number(p.quantity) : null,
                preco: p.price !== undefined && p.price !== null ? Number(p.price) : null,
              })),
            }))
            metaFim = arr.length < 200
          } else {
            erroRede = 'falha_http_' + res.statusCode
            transitorio = res.statusCode === 429 || res.statusCode >= 500
          }
        } catch (err) {
          erroRede = 'falha_transporte'
          transitorio = true
        }
      } else {
        erroRede = 'credencial_ausente'
      }
    } else {
      return e.badRequestError('fonte_desconhecida')
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
          proxima_em_ms: esperaMs || (tentativas + 1 === 1 ? 2000 : 5000),
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
        let chave = ''
        if (fonteNome === 'omie') {
          if (recurso === 'estoque') {
            chave = 'omie:estoque:app1:' + it.produto_id + ':' + it.local_id + ':' + it.unidade
          } else if (recurso === 'pedidos') {
            chave = 'omie:pedidos:app1:' + it.cabecalho.codigo_pedido
          } else {
            chave = 'omie:produtos:app1:' + it.produto_id
          }
        } else {
          chave = 'nuvemshop:pedidos:app1:' + it.pedido_id
        }
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

    if (metaFim) {
      // Ativação ATÔMICA: staging → completo; anterior → substituido; contagem POR LOTE
      $app.runInTransaction((tx) => {
        let anterior = null
        try {
          anterior = tx.findFirstRecordByFilter(
            'pcp_lotes',
            "fonte = {:f} && recurso = {:r} && estado = 'completo'",
            { f: fonteNome, r: recurso },
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
