// pocketbase/hooks/pcp_requisicao_enviar.js — SPEC-3-005 CA-3-16
// POST /backend/v1/pcp/compras/requisicao/enviar { id, versao } — envia a requisição para aprovação.
// Exige editar_requisicao E a área compras, uma cotação escolhida por item e a versão esperada
// (409 se outra alteração chegou antes). Regras de src/lib/pcp/requisicao.ts.
routerAdd(
  'POST',
  '/backend/v1/pcp/compras/requisicao/enviar',
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
    const body = e.requestInfo().body || {}
    let req = null
    try {
      req = $app.findRecordById('pcp_requisicoes', String(body.id || ''))
    } catch (_) {}
    if (!req) return e.json(422, { erro: 'requisicao_inexistente' })
    if (Number(req.get('versao') || 1) !== Number(body.versao))
      return e.json(409, { erro: 'conflito_de_versao' })
    const estado = req.getString('estado')
    if (estado !== 'rascunho' && estado !== 'em_cotacao')
      return e.json(409, { erro: 'estado_nao_permite' })
    let itens = []
    try {
      itens = JSON.parse(req.getString('itens') || '[]') || []
    } catch (_) {
      itens = []
    }
    const cots = $app.findRecordsByFilter(
      'pcp_cotacoes',
      'requisicao = {:r} && escolhida = true',
      'created',
      500,
      0,
      {
        r: req.id,
      },
    )
    for (const it of itens) {
      if (!cots.some((c) => c.getString('item') === it.item)) {
        return e.json(422, { erro: 'sem_cotacao_escolhida', item: it.item })
      }
    }
    req.set('estado', 'em_aprovacao')
    req.set('versao', Number(req.get('versao') || 1) + 1)
    $app.save(req)
    return e.json(200, { ok: true, estado: 'em_aprovacao', versao: Number(req.get('versao')) })
  },
  $apis.requireAuth(),
)
