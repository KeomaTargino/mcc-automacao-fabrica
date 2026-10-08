// pocketbase/hooks/pcp_diag_http.js — DIAGNÓSTICO TEMPORÁRIO (remover após uso)
// Prova se $http.send funciona no runtime goja do projeto (sem segredo envolvido).
routerAdd(
  'GET',
  '/backend/v1/pcp/diag-http',
  (e) => {
    try {
      const res = $http.send({ url: 'https://httpbin.org/get', method: 'GET', timeout: 10 })
      return e.json(200, { ok: true, status: res.statusCode })
    } catch (err) {
      return e.json(200, { ok: false, erro: String(err).slice(0, 300) })
    }
  },
  $apis.requireAuth(),
)
