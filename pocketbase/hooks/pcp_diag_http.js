// pocketbase/hooks/pcp_diag_http.js — DIAGNÓSTICO TEMPORÁRIO (remover após uso)
// Prova 2: $http.send alcança app.omie.com.br? (sem segredo no corpo — só conectividade)
routerAdd(
  'GET',
  '/backend/v1/pcp/diag-http',
  (e) => {
    const alvos = [
      {
        nome: 'omie',
        url: 'https://app.omie.com.br/api/v1/geral/produtos/',
        metodo: 'POST',
        corpo: JSON.stringify({
          call: 'ListarProdutosResumido',
          app_key: 'x',
          app_secret: 'y',
          param: [{ pagina: 1, registros_por_pagina: 1 }],
        }),
      },
      { nome: 'httpbin', url: 'https://httpbin.org/get', metodo: 'GET', corpo: '' },
    ]
    const out = []
    for (const a of alvos) {
      try {
        const opts = { url: a.url, method: a.metodo, timeout: 12 }
        if (a.corpo) {
          opts.headers = { 'Content-Type': 'application/json' }
          opts.body = a.corpo
        }
        const res = $http.send(opts)
        out.push({ alvo: a.nome, ok: true, status: res.statusCode })
      } catch (err) {
        out.push({ alvo: a.nome, ok: false, erro: String(err).slice(0, 250) })
      }
    }
    return e.json(200, { resultados: out })
  },
  $apis.requireAuth(),
)
