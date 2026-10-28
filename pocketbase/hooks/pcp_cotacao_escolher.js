// pocketbase/hooks/pcp_cotacao_escolher.js — SPEC-3-005 CA-3-15
// POST /backend/v1/pcp/compras/cotacao/escolher { id } — marca a cotação como a escolhida do item
// (desmarca as outras do mesmo item e requisição). Exige editar_requisicao E a área compras. Se a
// requisição já foi aprovada, a escolha muda o conteúdo e a aprovação cai (volta para aprovação).
routerAdd(
  'POST',
  '/backend/v1/pcp/compras/cotacao/escolher',
  (e) => {
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Sessão ausente ou expirada.')
    let perfil = null
    try {
      perfil = $app.findFirstRecordByFilter('pcp_perfis', 'usuario = {:u}', { u: auth.id })
    } catch (_) {}
    let acoes = []
    try {
      acoes = JSON.parse((perfil && perfil.getString('acoes')) || '[]') || []
    } catch (_) {
      acoes = []
    }
    if (
      !perfil ||
      !perfil.getBool('ativo') ||
      !Array.isArray(acoes) ||
      acoes.indexOf('editar_requisicao') === -1 ||
      perfil.getStringSlice('areas').indexOf('compras') === -1
    ) {
      return e.forbiddenError('sem_permissao')
    }
    const id = String((e.requestInfo().body || {}).id || '')
    let c = null
    try {
      c = $app.findRecordById('pcp_cotacoes', id)
    } catch (_) {}
    if (!c) return e.json(422, { erro: 'cotacao_inexistente' })
    let req = null
    try {
      req = $app.findRecordById('pcp_requisicoes', c.getString('requisicao'))
    } catch (_) {}
    if (!req) return e.json(422, { erro: 'cotacao_inexistente' })
    const estado = req.getString('estado')
    if (estado === 'cancelada' || estado === 'recusada')
      return e.json(409, { erro: 'estado_nao_permite' })
    $app.runInTransaction((tx) => {
      const mesmas = tx.findRecordsByFilter(
        'pcp_cotacoes',
        'requisicao = {:r} && item = {:i}',
        'created',
        200,
        0,
        { r: req.id, i: c.getString('item') },
      )
      for (const o of mesmas) {
        const marca = o.id === c.id
        if (o.getBool('escolhida') !== marca) {
          o.set('escolhida', marca)
          tx.save(o)
        }
      }
      if (estado === 'aprovada') {
        // mudou o conteúdo aprovado: a aprovação cai e a requisição volta para aprovação
        const apr = tx.findRecordsByFilter(
          'pcp_aprovacoes_compra',
          'requisicao = {:r} && valida = true',
          '-created',
          50,
          0,
          { r: req.id },
        )
        for (const a of apr) {
          a.set('valida', false)
          tx.save(a)
        }
        req.set('estado', 'em_aprovacao')
        req.set('versao', Number(req.get('versao') || 1) + 1)
        tx.save(req)
      }
    })
    return e.json(200, { ok: true, id: c.id, aprovacao_invalidada: estado === 'aprovada' })
  },
  $apis.requireAuth(),
)
