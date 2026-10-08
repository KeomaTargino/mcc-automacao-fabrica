// pocketbase/hooks/pcp_diag_http.js — DIAGNÓSTICO TEMPORÁRIO (remover após uso)
// Prova 4: timeout de 15s — como $http.send se comporta com host que não responde?
routerAdd(
  'GET',
  '/backend/v1/pcp/diag-http',
  (e) => {
    const t0 = Date.now()
    try {
      const res = $http.send({ url: 'https://10.255.255.1/', method: 'GET', timeout: 15 })
      return e.json(200, { ms: Date.now() - t0, status: res.statusCode })
    } catch (err) {
      return e.json(200, { ms: Date.now() - t0, excecao: String(err).slice(0, 200) })
    }
  },
  $apis.requireAuth(),
)
