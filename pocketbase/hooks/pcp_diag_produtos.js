// pocketbase/hooks/pcp_diag_produtos.js — TEMPORÁRIO (5d8793fb, 20/10/2026)
// Conciliação: ficha técnica (malha) do produto piloto + local de estoque.
// Somente leitura; removida após a prova. Acesso: token efêmero PCP_DIAG_TOKEN.
routerAdd('GET', '/backend/v1/pcp/diag/produtos', (e) => {
  const esperado = $secrets.get('PCP_DIAG_TOKEN') || ''
  const headers = e.requestInfo().headers || {}
  const authz = String(headers['authorization'] || '')
  const token = authz.replace(/^Bearer\s+/i, '').trim()
  if (!esperado || token !== esperado) {
    return e.unauthorizedError('Token de diagnóstico ausente ou inválido.')
  }
  const appKey = $secrets.get('OMIE_APP_KEY')
  const appSecret = $secrets.get('OMIE_APP_SECRET')
  if (!appKey || !appSecret) {
    return e.json(200, { ok: false, erro: 'credencial_ausente' })
  }
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
      return { status: res.statusCode, corpo: String(JSON.stringify(res.json)).slice(0, 1500) }
    } catch (err) {
      return { status: 0, erro: String(err) }
    }
  }
  return e.json(200, {
    ok: true,
    ficha_consultar: chamar('https://app.omie.com.br/api/v1/geral/malha/', 'ConsultarEstrutura', {
      codProduto: 'PRD513892905525504',
    }),
    ficha_listar: chamar('https://app.omie.com.br/api/v1/geral/malha/', 'ListarEstruturas', {
      nPagina: 1,
      nRegPorPagina: 50,
    }),
    locais: chamar('https://app.omie.com.br/api/v1/geral/locaisestoque/', 'ListarLocaisEstoque', {
      pagina: 1,
      registros_por_pagina: 50,
    }),
  })
})
