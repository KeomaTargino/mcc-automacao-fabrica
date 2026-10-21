// pocketbase/hooks/pcp_diag_d3.js — TEMPORÁRIO (9318a299, 21/10/2026)
// Sonda de LEITURA (CA-D3, SPEC-2-001): pedidos de venda (ListarPedidos), pedidos de
// compra (PesquisarPedCompra) e NF-e (ListarNFe). NENHUM mutante (Incluir/Alterar/
// Excluir/Upsert/Devolver). Removida após a prova.
routerAdd('GET', '/backend/v1/pcp/diag/d3', (e) => {
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
      return { status: res.statusCode, corpo: String(JSON.stringify(res.json)).slice(0, 6000) }
    } catch (err) {
      return { status: 0, erro: String(err) }
    }
  }
  return e.json(200, {
    ok: true,
    vendas: chamar('https://app.omie.com.br/api/v1/produtos/pedido/', 'ListarPedidos', {
      pagina: 1,
      registros_por_pagina: 5,
      apenas_resumo: 'S',
    }),
    compras: chamar('https://app.omie.com.br/api/v1/produtos/pedidocompra/', 'PesquisarPedCompra', {
      nPagina: 1,
      nRegsPorPagina: 5,
      lApenasImportadoApi: 'F',
      lExibirPedidosPendentes: 'T',
      lExibirPedidosFaturados: 'T',
      lExibirPedidosRecebidos: 'T',
      lExibirPedidosCancelados: 'T',
      lExibirPedidosEncerrados: 'T',
      lExibirPedidosRecParciais: 'T',
      lExibirPedidosFatParciais: 'T',
    }),
    nfe: chamar('https://app.omie.com.br/api/v1/produtos/nfe/', 'ListarNFe', {
      nPagina: 1,
      nRegPorPagina: 5,
      dDataEmissaoInicial: '01/08/2026',
      dDataEmissaoFinal: '21/10/2026',
    }),
  })
})
