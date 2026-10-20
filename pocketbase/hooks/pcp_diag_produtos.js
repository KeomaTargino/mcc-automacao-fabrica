// pocketbase/hooks/pcp_diag_produtos.js — TEMPORÁRIO (re-checagem 4e0fcf1c, 20/10/2026)
// Sonda de leitura do cadastro de produtos no Omie (ListarProdutosResumido, método provado
// na F1). Somente leitura; removida após a prova. Acesso: token efêmero PCP_DIAG_TOKEN.
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
  try {
    const res = $http.send({
      url: 'https://app.omie.com.br/api/v1/geral/produtos/',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        call: 'ListarProdutosResumido',
        app_key: appKey,
        app_secret: appSecret,
        param: [{ pagina: 1, registros_por_pagina: 50 }],
      }),
      timeout: 15,
    })
    const j = res.json || {}
    const arr = (j.produtos || []).map((p) => ({
      codigo_produto: String(p.codigo_produto || ''),
      codigo: String(p.codigo || ''),
      descricao: String(p.descricao || ''),
      unidade: String(p.unidade || ''),
      inativo: String(p.inativo || 'N'),
      familia: String(p.descricao_familia || p.codigo_familia || ''),
    }))
    return e.json(200, {
      ok: true,
      status: res.statusCode,
      total_de_registros: Number(j.total_de_registros || 0),
      total_de_paginas: Number(j.total_de_paginas || 0),
      fault: String(j.faultstring || ''),
      produtos: arr,
    })
  } catch (err) {
    return e.json(200, { ok: false, erro: 'falha_transporte', detalhe: String(err) })
  }
})
