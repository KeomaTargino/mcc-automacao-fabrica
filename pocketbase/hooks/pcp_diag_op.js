// pocketbase/hooks/pcp_diag_op.js — TEMPORÁRIO (a2a4ccf1, 20/10/2026)
// Sonda de LEITURA dos métodos de Ordem de Produção (produtos/op):
// ConsultarOrdemProducao (por nCodOP) e ListarOPs (paginação). NENHUM mutante
// (Incluir/Alterar/Concluir) — CA-O1 da SPEC-2-005. Removida após a prova.
routerAdd('GET', '/backend/v1/pcp/diag/op', (e) => {
  const esperado = $secrets.get('PCP_DIAG_TOKEN') || ''
  const headers = e.requestInfo().headers || {}
  const authz = String(headers['authorization'] || '')
  const token = authz.replace(/^Bearer\s+/i, '').trim()
  if (!esperado || token !== esperado) return e.unauthorizedError('Token ausente ou invalido.')
  const appKey = $secrets.get('OMIE_APP_KEY')
  const appSecret = $secrets.get('OMIE_APP_SECRET')
  if (!appKey || !appSecret) return e.json(200, { ok: false, erro: 'credencial_ausente' })
  const chamar = (call, param) => {
    try {
      const res = $http.send({
        url: 'https://app.omie.com.br/api/v1/produtos/op/',
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
      return { status: res.statusCode, corpo: String(JSON.stringify(res.json)).slice(0, 1800) }
    } catch (err) {
      return { status: 0, erro: String(err) }
    }
  }
  return e.json(200, {
    ok: true,
    consultar_por_ncodop: chamar('ConsultarOrdemProducao', { nCodOP: 0 }),
    listar: chamar('ListarOrdemProducao', {
      pagina: 1,
      registros_por_pagina: 10,
      apenas_importado_api: 'N',
    }),
  })
})
