// pocketbase/hooks/pcp_diag_http.js — DIAGNÓSTICO TEMPORÁRIO (remover após uso)
// Prova 3: chamada REAL ao Omie com os secrets do servidor — qual status/corpo o runtime recebe?
// NÃO registra segredo nem dado de produto na resposta (só status e chaves).
routerAdd(
  'GET',
  '/backend/v1/pcp/diag-http',
  (e) => {
    const appKey = $secrets.get('OMIE_APP_KEY')
    const appSecret = $secrets.get('OMIE_APP_SECRET')
    if (!appKey || !appSecret) return e.json(200, { tem_secrets: false })
    try {
      const res = $http.send({
        url: 'https://app.omie.com.br/api/v1/geral/produtos/',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          call: 'ListarProdutosResumido',
          app_key: appKey,
          app_secret: appSecret,
          param: [{ pagina: 1, registros_por_pagina: 1, apenas_importado_api: 'N' }],
        }),
        timeout: 15,
      })
      let chaves = []
      try {
        chaves = Object.keys(res.json || {})
      } catch (_) {}
      return e.json(200, {
        tem_secrets: true,
        status: res.statusCode,
        chaves_raiz: chaves.slice(0, 8),
      })
    } catch (err) {
      return e.json(200, { tem_secrets: true, excecao: String(err).slice(0, 300) })
    }
  },
  $apis.requireAuth(),
)
