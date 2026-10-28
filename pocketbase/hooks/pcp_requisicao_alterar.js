// pocketbase/hooks/pcp_requisicao_alterar.js — SPEC-3-005 CA-3-16 (RN-04)
// POST /backend/v1/pcp/compras/requisicao/alterar { id, versao, item, quantidade_estoque }
// Altera a quantidade de um item. Exige editar_requisicao E a área compras e a versão esperada (409
// se outra alteração chegou antes). Se a requisição estava aprovada, a aprovação é invalidada e ela
// volta para aprovação.
routerAdd(
  'POST',
  '/backend/v1/pcp/compras/requisicao/alterar',
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
    if (estado === 'cancelada' || estado === 'recusada')
      return e.json(409, { erro: 'estado_nao_permite' })
    const qtd = Number(body.quantidade_estoque)
    if (!isFinite(qtd) || qtd <= 0)
      return e.json(422, {
        erro: 'dados_invalidos',
        motivos: ['quantidade precisa ser maior que zero'],
      })
    const item = String(body.item || '')
      .trim()
      .toUpperCase()
    let itens = []
    try {
      itens = JSON.parse(req.getString('itens') || '[]') || []
    } catch (_) {
      itens = []
    }
    const alvo = itens.find((i) => i.item === item)
    if (!alvo)
      return e.json(422, { erro: 'dados_invalidos', motivos: ['item não está na requisição'] })
    alvo.quantidadeEstoque = qtd
    alvo.quantidadeCompra = alvo.fatorUsado ? Math.round((qtd / alvo.fatorUsado) * 1e6) / 1e6 : null
    let invalidada = false
    $app.runInTransaction((tx) => {
      req.set('itens', JSON.stringify(itens))
      req.set('versao', Number(req.get('versao') || 1) + 1)
      if (estado === 'aprovada') {
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
        invalidada = true
      }
      tx.save(req)
    })
    return e.json(200, {
      ok: true,
      versao: Number(req.get('versao')),
      aprovacao_invalidada: invalidada,
    })
  },
  $apis.requireAuth(),
)
