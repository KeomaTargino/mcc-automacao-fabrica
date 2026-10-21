// pocketbase/hooks/pcp_diag_produtos.js — TEMPORÁRIO (4e0fcf1c, 21/10/2026)
// Verificação de LEITURA do cadastro de produtos após o preenchimento pelo cliente:
// ListarProdutosResumido (listagem geral) e ListarProdutos (completo). NENHUM mutante.
// Removida após a prova.
routerAdd('GET', '/backend/v1/pcp/diag/produtos', (e) => {
  const esperado = $secrets.get('PCP_DIAG_TOKEN') || ''
  const headers = e.requestInfo().headers || {}
  const authz = String(headers['authorization'] || '')
  const token = authz.replace(/^Bearer\s+/i, '').trim()
  if (!esperado || token !== esperado) return e.unauthorizedError('Token ausente ou invalido.')
  const appKey = $secrets.get('OMIE_APP_KEY')
  const appSecret = $secrets.get('OMIE_APP_SECRET')
  if (!appKey || !appSecret) return e.json(200, { ok: false, erro: 'credencial_ausente' })
  const chamar = (call, param) => {
    try {
      const res = $http.send({
        url: 'https://app.omie.com.br/api/v1/geral/produtos/',
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
    resumido: chamar('ListarProdutosResumido', { pagina: 1, registros_por_pagina: 20 }),
    completo: chamar('ListarProdutos', { pagina: 1, registros_por_pagina: 20 }),
  })
})
