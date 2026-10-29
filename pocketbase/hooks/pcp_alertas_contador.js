// pocketbase/hooks/pcp_alertas_contador.js — SPEC-3-011 CA-3-34
// GET /backend/v1/pcp/alertas/contador — quantos alertas ainda não tratados a pessoa pode ver (a área
// dela; as três áreas = gestão). Alimenta o número no menu. Sem perfil ou sem área, devolve zero.
routerAdd(
  'GET',
  '/backend/v1/pcp/alertas/contador',
  (e) => {
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Sessão ausente ou expirada.')
    let perfil = null
    try {
      perfil = $app.findFirstRecordByFilter('pcp_perfis', 'usuario = {:u}', { u: auth.id })
    } catch (_) {}
    if (!perfil || !perfil.getBool('ativo')) return e.json(200, { abertos: 0 })
    const AREA = {
      estoque: 'planejamento',
      producao: 'planejamento',
      divergencia: 'planejamento',
      compra: 'compras',
      preco: 'compras',
      pedido: 'faturamento',
    }
    const areas = perfil.getStringSlice('areas')
    const gestao =
      areas.indexOf('planejamento') !== -1 &&
      areas.indexOf('compras') !== -1 &&
      areas.indexOf('faturamento') !== -1
    let n = 0
    for (const r of $app.findRecordsByFilter(
      'pcp_alertas',
      "estado != 'tratado'",
      'created',
      5000,
      0,
    )) {
      const a = AREA[r.getString('tipo')]
      if (a && (gestao || areas.indexOf(a) !== -1)) n++
    }
    return e.json(200, { abertos: n })
  },
  $apis.requireAuth(),
)
