// pocketbase/hooks/pcp_parcela_pagar.js — SPEC-3-007 CA-3-20 (RN-03)
// POST /backend/v1/pcp/compras/parcelas/pago { pedido, referencia }
// O financeiro MARCA que o pedido foi pago antecipadamente (todas as parcelas), com a referência do
// pagamento. Só marca: não paga, não lança conta a pagar e não grava no Omie. Depois da marca, o
// recebimento desse pedido mostra "já paga: não lançar nova conta a pagar". Exige
// conferir_financeiro_recebimento E a área recebimento.
routerAdd(
  'POST',
  '/backend/v1/pcp/compras/parcelas/pago',
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
      acoes.indexOf('conferir_financeiro_recebimento') === -1 ||
      perfil.getStringSlice('areas').indexOf('recebimento') === -1
    ) {
      return e.forbiddenError('sem_permissao')
    }
    const body = e.requestInfo().body || {}
    const pedido = String(body.pedido || '').trim()
    const referencia = String(body.referencia || '').trim()
    if (!referencia)
      return e.json(422, {
        erro: 'dados_invalidos',
        motivos: ['referência do pagamento obrigatória'],
      })
    const ps = $app.findRecordsByFilter('pcp_parcelas_compra', 'pedido = {:p}', 'numero', 200, 0, {
      p: pedido,
    })
    if (ps.length === 0)
      return e.json(422, { erro: 'dados_invalidos', motivos: ['pedido sem parcelas registradas'] })
    $app.runInTransaction((tx) => {
      for (const p of ps) {
        p.set('pago_antecipado', true)
        p.set('referencia_pagamento', referencia)
        tx.save(p)
      }
    })
    return e.json(200, { ok: true, pedido: pedido, parcelas_marcadas: ps.length })
  },
  $apis.requireAuth(),
)
