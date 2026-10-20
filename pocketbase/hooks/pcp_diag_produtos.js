// pocketbase/hooks/pcp_diag_produtos.js — TEMPORÁRIO (4e0fcf1c, 20/10/2026)
// Sonda dirigida pelo código informado pelo owner (PRD513892905525504):
// ConsultarProduto + ListarProdutosResumido filtrado + catálogo geral (baseline).
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
  const COD = 'PRD513892905525504'
  const normalizar = (call, param) => {
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
      return res
    } catch (err) {
      return null
    }
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
      const arr = Array.isArray(j.produtos) ? j.produtos : []
      return {
        status: res.statusCode,
        total: Number(j.total_de_registros || 0),
        fault: String(j.faultstring || ''),
        corpo: arr.length ? undefined : String(JSON.stringify(j)).slice(0, 500),
        produtos: arr.slice(0, 5).map((p) => ({
          codigo_produto: String(p.codigo_produto || ''),
          codigo: String(p.codigo || ''),
          descricao: String(p.descricao || ''),
          unidade: String(p.unidade || ''),
          inativo: String(p.inativo || 'N'),
          familia: String(p.descricao_familia || p.codigo_familia || ''),
        })),
      }
    } catch (err) {
      return { status: 0, erro: String(err) }
    }
  }
  // Resumo do produto consultado (campos críticos da SPEC: unidade, inativo, família)
  const r1 = normalizar('ConsultarProduto', { codigo: COD })
  const j1 = (r1 && r1.json) || {}
  const resumo = {
    status: r1 ? r1.statusCode : 0,
    codigo_produto: String(j1.codigo_produto || ''),
    codigo: String(j1.codigo || ''),
    descricao: String(j1.descricao || ''),
    unidade: String(j1.unidade || ''),
    inativo: String(j1.inativo || 'N'),
    familia: String(j1.descricao_familia || j1.codigo_familia || ''),
    tipo_item: String(j1.tipo_item || ''),
    ncm: String(j1.ncm || ''),
    incluido_em:
      String((j1.info && j1.info.dInc) || '') + ' ' + String((j1.info && j1.info.hInc) || ''),
  }
  return e.json(200, {
    ok: true,
    codigo_informado: COD,
    produto: resumo,
    catalogo_geral: chamar('ListarProdutosResumido', { pagina: 1, registros_por_pagina: 50 }),
  })
})
