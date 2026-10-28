// pocketbase/hooks/pcp_excecao_autorizar.js — SPEC-3-003 CA-3-10 (RN-02)
// POST /backend/v1/pcp/compras/excecao — autoriza a compra de um item que NÃO está no catálogo do
// Omie, para UM documento (requisição, cotação ou recebimento). Exige autorizar_excecao_compra E a
// área compras (403 sem pistas) e um motivo (422). Uma exceção por item e documento: repetir devolve
// a mesma. Autor e hora vêm do servidor. A exceção fica "aberta" (pendente de regularização) até o
// item aparecer no catálogo. Regras de src/lib/pcp/bloqueio-item.ts.
routerAdd(
  'POST',
  '/backend/v1/pcp/compras/excecao',
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
      acoes.indexOf('autorizar_excecao_compra') === -1 ||
      perfil.getStringSlice('areas').indexOf('compras') === -1
    ) {
      return e.forbiddenError('sem_permissao')
    }
    const body = e.requestInfo().body || {}
    const item = String(body.item || '')
      .trim()
      .toUpperCase()
    const documento = String(body.documento || '')
    const documentoId = String(body.documento_id || '').trim()
    const motivo = String(body.motivo || '').trim()
    if (
      !item ||
      !documentoId ||
      ['requisicao', 'cotacao', 'recebimento'].indexOf(documento) === -1
    ) {
      return e.json(422, {
        erro: 'dados_invalidos',
        motivo: 'informe o item, o tipo e o número do documento',
      })
    }
    if (motivo.length < 3)
      return e.json(422, { erro: 'sem_motivo', motivo: 'informe o motivo da exceção' })

    let resposta = null
    $app.runInTransaction((tx) => {
      let ja = null
      try {
        ja = tx.findFirstRecordByFilter(
          'pcp_excecoes_compra',
          'item = {:i} && documento = {:d} && documento_id = {:n}',
          { i: item, d: documento, n: documentoId },
        )
      } catch (_) {}
      if (ja) {
        resposta = { ok: true, criada: false, estado: ja.getString('estado') }
        return
      }
      const col = tx.findCollectionByNameOrId('pcp_excecoes_compra')
      const r = new Record(col)
      r.set('item', item)
      r.set('documento', documento)
      r.set('documento_id', documentoId)
      r.set('motivo', motivo)
      r.set('autorizado_por', auth.getString('email') || auth.id)
      r.set('autorizado_em', new Date().toISOString())
      r.set('estado', 'aberta')
      tx.save(r)
      resposta = { ok: true, criada: true, estado: 'aberta' }
    })
    return e.json(200, resposta)
  },
  $apis.requireAuth(),
)
