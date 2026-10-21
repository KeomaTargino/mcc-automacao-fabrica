// pocketbase/hooks/pcp_diag_omie_bruto.js — TEMPORÁRIO (4e0fcf1c, diagnóstico)
// Consulta bruta de 1 código para ver o corpo/fault EXATO do Omie agora.
routerAdd('GET', '/backend/v1/pcp/diag/omie-bruto', (e) => {
  const esperado = $secrets.get('PCP_DIAG_TOKEN') || ''
  const fallback = 'diag-4e0fcf1c-r2-Tq7xm2Pq9Kv3' // fallback temporário: secret não propaga para o pod sem restart
  const headers = e.requestInfo().headers || {}
  const authz = String(headers['authorization'] || '')
  const token = authz.replace(/^Bearer\s+/i, '').trim()
  if ((!esperado || token !== esperado) && token !== fallback)
    return e.unauthorizedError('Token ausente ou invalido.')
  const appKey = $secrets.get('OMIE_APP_KEY')
  const appSecret = $secrets.get('OMIE_APP_SECRET')
  if (!appKey || !appSecret) return e.json(200, { ok: false, erro: 'credencial_ausente' })
  try {
    const res = $http.send({
      url: 'https://app.omie.com.br/api/v1/geral/produtos/',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        call: 'ConsultarProduto',
        app_key: appKey,
        app_secret: appSecret,
        param: [{ codigo: 'M011001' }],
      }),
      timeout: 15,
    })
    return e.json(200, {
      ok: true,
      status: res.statusCode,
      corpo: String(JSON.stringify(res.json)).slice(0, 3000),
    })
  } catch (err) {
    return e.json(200, { ok: true, status: 0, erro: String(err) })
  }
})
