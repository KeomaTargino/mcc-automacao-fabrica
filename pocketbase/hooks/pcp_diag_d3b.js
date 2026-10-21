// pocketbase/hooks/pcp_diag_d3b.js — TEMPORÁRIO (9318a299, rodada 2)
// Completa o mapa CA-D3: cabeçalho/status do pedido de compra (1 reg/página) e
// NF-e com histórico largo. NENHUM mutante. Removida após a prova.
routerAdd('GET', '/backend/v1/pcp/diag/d3b', (e) => {
  const esperado = $secrets.get('PCP_DIAG_TOKEN') || ''
  const headers = e.requestInfo().headers || {}
  const authz = String(headers['authorization'] || '')
  const token = authz.replace(/^Bearer\s+/i, '').trim()
  if (!esperado || token !== esperado) return e.unauthorizedError('Token ausente ou invalido.')
  const appKey = $secrets.get('OMIE_APP_KEY')
  const appSecret = $secrets.get('OMIE_APP_SECRET')
  if (!appKey || !appSecret) return e.json(200, { ok: false, erro: 'credencial_ausente' })
  const chamar = (endpoint, call, param) => {
    try {
      const res = $http.send({
        url: endpoint,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          call: call,
          app_key: appKey,
          app_secret: appSecret,
          param: [param],
        }),
        timeout: 15,
      })
      return { status: res.statusCode, corpo: String(JSON.stringify(res.json)).slice(0, 9000) }
    } catch (err) {
      return { status: 0, erro: String(err) }
    }
  }
  return e.json(200, {
    ok: true,
    compra_unica: chamar(
      'https://app.omie.com.br/api/v1/produtos/pedidocompra/',
      'PesquisarPedCompra',
      {
        nPagina: 1,
        nRegsPorPagina: 1,
        lApenasImportadoApi: 'F',
        lExibirPedidosPendentes: 'T',
        lExibirPedidosFaturados: 'T',
        lExibirPedidosRecebidos: 'T',
        lExibirPedidosCancelados: 'T',
        lExibirPedidosEncerrados: 'T',
        lExibirPedidosRecParciais: 'T',
        lExibirPedidosFatParciais: 'T',
      },
    ),
    nfe_historico: chamar('https://app.omie.com.br/api/v1/produtos/nfe/', 'ListarNFe', {
      nPagina: 1,
      nRegPorPagina: 5,
      dDataEmissaoInicial: '01/01/2023',
      dDataEmissaoFinal: '21/10/2026',
    }),
  })
})
