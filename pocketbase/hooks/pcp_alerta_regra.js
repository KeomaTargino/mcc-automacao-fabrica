// pocketbase/hooks/pcp_alerta_regra.js — SPEC-3-011 CA-3-34 (RN-04)
// POST /backend/v1/pcp/alertas/regra { tipo, ativa }
// Liga ou desliga a regra de um tipo de alerta (estoque, producao, compra, preco, pedido, divergencia).
// Exige editar_parametros (403 sem pistas). Desligada, a rodada para de gerar alertas do tipo; os alertas
// que já existem e o histórico NÃO são apagados. A mudança fica no histórico com autor e hora.
routerAdd(
  'POST',
  '/backend/v1/pcp/alertas/regra',
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
      acoes.indexOf('editar_parametros') === -1
    ) {
      return e.forbiddenError('sem_permissao')
    }
    const b = e.requestInfo().body || {}
    const tipo = String(b.tipo || '')
    if (
      ['estoque', 'producao', 'compra', 'preco', 'pedido', 'divergencia'].indexOf(tipo) === -1 ||
      typeof b.ativa !== 'boolean'
    ) {
      return e.json(422, {
        erro: 'dados_invalidos',
        motivos: ['informe o tipo de alerta e se a regra fica ativa'],
      })
    }
    const quem = auth.getString('email') || auth.id
    const agora = new Date().toISOString()
    $app.runInTransaction((tx) => {
      let r = null
      try {
        r = tx.findFirstRecordByFilter('pcp_alertas_regras', 'tipo = {:t}', { t: tipo })
      } catch (_) {}
      if (!r) {
        r = new Record(tx.findCollectionByNameOrId('pcp_alertas_regras'))
        r.set('tipo', tipo)
      }
      r.set('ativa', b.ativa)
      r.set('alterada_por', quem)
      r.set('alterada_em', agora)
      tx.save(r)
      const h = new Record(tx.findCollectionByNameOrId('pcp_alertas_historico'))
      h.set('alerta_id', '')
      h.set('evento', b.ativa ? 'regra_ligada' : 'regra_desligada')
      h.set('autor', quem)
      h.set('em', agora)
      h.set('detalhe', tipo)
      tx.save(h)
    })
    return e.json(200, { ok: true, tipo: tipo, ativa: b.ativa })
  },
  $apis.requireAuth(),
)
