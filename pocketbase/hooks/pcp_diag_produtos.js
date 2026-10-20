// pocketbase/hooks/pcp_diag_produtos.js — TEMPORÁRIO (task 4e0fcf1c, 20/10/2026)
// Diagnóstico do cadastro de produtos no Omie após o cadastro do produto piloto pelo
// owner ("Cadastrei o produto no Omie"). Somente leitura; sem mutação de dados.
// REMOVER após a prova (padrão da F1: hook temporário removido em seguida).
// Acesso: apenas o token de superuser do próprio pod (secret PB_SUPERUSER_TOKEN)
// no header Authorization — nenhuma conta operacional é usada; rota temporária.
routerAdd('GET', '/backend/v1/pcp/diag/produtos', (e) => {
  const esperado = $secrets.get('PB_SUPERUSER_TOKEN') || ''
  const authz = String(e.requestInfo().header('Authorization') || '')
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
      tipo: String(p.tipo || ''),
    }))
    return e.json(200, {
      ok: true,
      status: res.statusCode,
      total_de_registros: Number(j.total_de_registros || 0),
      total_de_paginas: Number(j.total_de_paginas || 0),
      pagina: Number(j.pagina || 0),
      produtos: arr,
    })
  } catch (err) {
    return e.json(200, { ok: false, erro: 'falha_transporte', detalhe: String(err) })
  }
})
