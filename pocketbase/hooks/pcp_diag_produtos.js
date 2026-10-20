// pocketbase/hooks/pcp_diag_produtos.js — TEMPORÁRIO (re-checagem 3, 20/10/2026)
// Diagnóstico final 4e0fcf1c: captura BRUTA de empresas (multi-empresa?) e posição de
// estoque (contraste: estoque tem produtos, catálogo não). Somente leitura; removida após a prova.
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
  const bruto = (endpoint, call, param) => {
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
      return {
        status: res.statusCode,
        corpo: String(res.raw || JSON.stringify(res.json)).slice(0, 600),
      }
    } catch (err) {
      return { status: 0, erro: String(err) }
    }
  }
  return e.json(200, {
    ok: true,
    empresas: bruto('https://app.omie.com.br/api/v1/geral/empresas/', 'ListarEmpresas', {
      pagina: 1,
      registros_por_pagina: 20,
    }),
    estoque: bruto('https://app.omie.com.br/api/v1/estoque/consulta/', 'ListarPosEstoque', {
      nPagina: 1,
      nRegPorPagina: 5,
      dDataPosicao: '',
      cExibeTodos: 'S',
    }),
  })
})
