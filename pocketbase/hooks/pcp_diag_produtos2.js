// pocketbase/hooks/pcp_diag_produtos2.js — TEMPORÁRIO (4e0fcf1c, rodada 2)
// Listagem = 0 mas cliente diz que cadastrou: consulta DIRIGIDA por código
// (ConsultarProduto) para M011001 e M043024 + ListarCaracterísticas só para
// confirmar saúde da credencial. NENHUM mutante. Removida após a prova.
routerAdd('GET', '/backend/v1/pcp/diag/produtos2', (e) => {
  const esperado = $secrets.get('PCP_DIAG_TOKEN') || ''
  const headers = e.requestInfo().headers || {}
  const authz = String(headers['authorization'] || '')
  const token = authz.replace(/^Bearer\s+/i, '').trim()
  if (!esperado || token !== esperado) return e.unauthorizedError('Token ausente ou invalido.')
  const appKey = $secrets.get('OMIE_APP_KEY')
  const appSecret = $secrets.get('OMIE_APP_SECRET')
  if (!appKey || !appSecret) return e.json(200, { ok: false, erro: 'credencial_ausente' })
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
      return { status: res.statusCode, corpo: String(JSON.stringify(res.json)).slice(0, 5000) }
    } catch (err) {
      return { status: 0, erro: String(err) }
    }
  }
  return e.json(200, {
    ok: true,
    consultar_M011001: chamar(
      'https://app.omie.com.br/api/v1/geral/produtos/',
      'ConsultarProduto',
      { codigo: 'M011001' },
    ),
    consultar_M043024: chamar(
      'https://app.omie.com.br/api/v1/geral/produtos/',
      'ConsultarProduto',
      { codigo: 'M043024' },
    ),
    resumido_pag2: chamar(
      'https://app.omie.com.br/api/v1/geral/produtos/',
      'ListarProdutosResumido',
      { pagina: 1, registros_por_pagina: 500 },
    ),
  })
})
