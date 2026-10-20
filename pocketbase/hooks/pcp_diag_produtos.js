// pocketbase/hooks/pcp_diag_produtos.js — TEMPORÁRIO (task 4e0fcf1c, 20/10/2026)
// Sonda comparativa do cadastro de produtos no Omie: ListarProdutosResumido (método
// provado na F1) vs ListarProdutos (completo). Somente leitura; removida após a prova.
// Acesso: token efêmero PCP_DIAG_TOKEN no header Authorization.
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
  const chamar = (call, param) => {
    try {
      const res = $http.send({
        url: 'https://app.omie.com.br/api/v1/geral/produtos/',
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
      const arr = (j.produtos || []).map((p) => ({
        codigo_produto: String(p.codigo_produto || ''),
        codigo: String(p.codigo || ''),
        descricao: String(p.descricao || ''),
        unidade: String(p.unidade || ''),
        inativo: String(p.inativo || 'N'),
      }))
      return {
        status: res.statusCode,
        total: Number(j.total_de_registros || 0),
        paginas: Number(j.total_de_paginas || 0),
        fault: String(j.faultstring || ''),
        produtos: arr,
      }
    } catch (err) {
      return { status: 0, erro: String(err) }
    }
  }
  const resumido = chamar('ListarProdutosResumido', { pagina: 1, registros_por_pagina: 50 })
  const completo = chamar('ListarProdutos', { pagina: 1, registros_por_pagina: 50 })
  return e.json(200, { ok: true, resumido: resumido, completo: completo })
})
