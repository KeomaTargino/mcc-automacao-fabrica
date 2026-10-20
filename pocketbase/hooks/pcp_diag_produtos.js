// pocketbase/hooks/pcp_diag_produtos.js — TEMPORÁRIO (re-checagem 4e0fcf1c, 20/10/2026)
// Sonda ampliada de leitura no Omie: catálogo de produtos (baseline), serviços (hipótese
// módulo errado) e empresas (hipótese multi-empresa — a qual empresa a credencial liga).
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
      const j = res.json || {}
      const arr = Array.isArray(j.produtos)
        ? j.produtos
        : Array.isArray(j.empresas)
          ? j.empresas
          : Array.isArray(j.servicos)
            ? j.servicos
            : []
      return {
        status: res.statusCode,
        total: Number(j.total_de_registros || 0),
        paginas: Number(j.total_de_paginas || 0),
        fault: String(j.faultstring || ''),
        amostra: arr.slice(0, 5).map((x) => String(JSON.stringify(x)).slice(0, 400)),
      }
    } catch (err) {
      return { status: 0, erro: String(err) }
    }
  }
  return e.json(200, {
    ok: true,
    produtos: chamar('https://app.omie.com.br/api/v1/geral/produtos/', 'ListarProdutosResumido', {
      pagina: 1,
      registros_por_pagina: 50,
    }),
    servicos: chamar('https://app.omie.com.br/api/v1/geral/servicos/', 'ListarServicos', {
      pagina: 1,
      registros_por_pagina: 50,
    }),
    empresas: chamar('https://app.omie.com.br/api/v1/geral/empresas/', 'ListarEmpresasCadastro', {
      pagina: 1,
      registros_por_pagina: 50,
    }),
  })
})
