// pocketbase/hooks/pcp_parcelas_salvar.js — SPEC-3-007 CA-3-20
// POST /backend/v1/pcp/compras/parcelas { pedido, parcelas: [{ numero, vencimento, valor }] }
// O financeiro registra as parcelas PREVISTAS de um pedido (uma por pedido e número; refazer atualiza
// as mesmas e mantém a marca de pago). Exige conferir_financeiro_recebimento E a área recebimento.
// O pedido precisa ser um pedido aprovado e ligado. Não lança nada no financeiro nem no Omie.
routerAdd(
  'POST',
  '/backend/v1/pcp/compras/parcelas',
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
    const parcelas = Array.isArray(body.parcelas) ? body.parcelas : []
    const motivos = []
    if (!pedido) motivos.push('pedido obrigatório')
    if (parcelas.length === 0) motivos.push('nenhuma parcela informada')
    const vistos = {}
    for (const p of parcelas) {
      const n = Number(p.numero)
      if (!Number.isInteger(n) || n < 1) motivos.push('número de parcela inválido')
      if (vistos[n]) motivos.push('parcela ' + n + ' repetida')
      vistos[n] = true
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(p.vencimento || '')))
        motivos.push('parcela ' + n + ': vencimento inválido')
      if (!isFinite(Number(p.valor)) || Number(p.valor) <= 0)
        motivos.push('parcela ' + n + ': valor precisa ser maior que zero')
    }
    if (motivos.length > 0) return e.json(422, { erro: 'dados_invalidos', motivos: motivos })

    // o pedido precisa existir entre os aprovados e ligados
    let existe = false
    const aprovadas = $app.findRecordsByFilter(
      'pcp_requisicoes',
      "estado = 'aprovada'",
      '-created',
      2000,
      0,
    )
    for (const r of aprovadas) {
      try {
        const v = $app.findFirstRecordByFilter(
          'pcp_pedidos_compra_vinculo',
          "requisicao = {:r} && estado = 'ligado'",
          { r: r.id },
        )
        if ((v.getString('numero_omie') || r.id) === pedido) {
          existe = true
          break
        }
      } catch (_) {}
    }
    if (!existe)
      return e.json(422, {
        erro: 'dados_invalidos',
        motivos: ['pedido não é um pedido aprovado e ligado'],
      })

    $app.runInTransaction((tx) => {
      const col = tx.findCollectionByNameOrId('pcp_parcelas_compra')
      const antigas = tx.findRecordsByFilter(
        'pcp_parcelas_compra',
        'pedido = {:p}',
        'numero',
        200,
        0,
        { p: pedido },
      )
      const novos = {}
      for (const p of parcelas) novos[Number(p.numero)] = p
      for (const a of antigas) {
        const n = Number(a.get('numero'))
        if (!novos[n]) tx.delete(a)
      }
      for (const k of Object.keys(novos)) {
        const p = novos[k]
        let rec = antigas.find((a) => Number(a.get('numero')) === Number(k))
        if (!rec) {
          rec = new Record(col)
          rec.set('pedido', pedido)
          rec.set('numero', Number(k))
          rec.set('pago_antecipado', false)
        }
        rec.set('vencimento', String(p.vencimento))
        rec.set('valor', Math.round(Number(p.valor) * 1e6) / 1e6)
        rec.set('registrado_por', auth.getString('email') || auth.id)
        tx.save(rec)
      }
    })
    return e.json(200, { ok: true, pedido: pedido, parcelas: parcelas.length })
  },
  $apis.requireAuth(),
)
