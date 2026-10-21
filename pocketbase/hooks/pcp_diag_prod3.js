// pocketbase/hooks/pcp_diag_prod3.js — TEMPORÁRIO (diagnóstico 4e0fcf1c rodada 3)
// Consulta bruta de 1 código para ver o corpo da resposta do Omie agora.
routerAdd('POST', '/backend/v1/pcp/diag/prod3', (e) => {
  const esperado = $secrets.get('PCP_DIAG_TOKEN') || ''
  const headers = e.requestInfo().headers || {}
  const authz = String(headers['authorization'] || '')
  const token = authz.replace(/^Bearer\s+/i, '').trim()
  if (!esperado || token !== esperado) return e.unauthorizedError('Token ausente ou invalido.')
  const appKey = $secrets.get('OMIE_APP_KEY')
  const appSecret = $secrets.get('OMIE_APP_SECRET')
  if (!appKey || !appSecret) return e.json(200, { ok: false, erro: 'credencial_ausente' })
  const body = e.requestInfo().body
  const codigo = String(body.codigo || 'M011001')
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
    return e.json(200, {
      status: res.statusCode,
      corpo: String(JSON.stringify(res.json)).slice(0, 3000),
    })
  } catch (err) {
    return e.json(200, { status: 0, erro: String(err) })
  }
})
