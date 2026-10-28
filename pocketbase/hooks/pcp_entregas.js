// pocketbase/hooks/pcp_entregas.js — SPEC-3-006 CA-3-17
// GET /backend/v1/pcp/compras/entregas — por fornecedor: pedido, item, previsão, pedida, recebida,
// restante, dias de atraso e marca de emergência, a partir das linhas lidas do Omie. Exige
// consultar_compras E a área compras. Só leitura. Mostra a hora da última leitura; leitura bloqueada
// ou ainda não feita aparece como aviso, nunca como zero. Regras de src/lib/pcp/pedido-compra.ts.
routerAdd(
  'GET',
  '/backend/v1/pcp/compras/entregas',
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
      acoes.indexOf('consultar_compras') === -1 ||
      perfil.getStringSlice('areas').indexOf('compras') === -1
    ) {
      return e.forbiddenError('sem_permissao')
    }
    const hoje = new Date().toISOString().slice(0, 10)
    const dia = (iso) =>
      Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000
    // pedidos emergenciais: compra emergencial ligada ao número do pedido
    const emergenciais = {}
    const vinc = $app.findRecordsByFilter('pcp_pedidos_compra_vinculo', '', 'created', 5000, 0)
    for (const v of vinc) {
      try {
        const req = $app.findRecordById('pcp_requisicoes', v.getString('requisicao'))
        if (req.getBool('emergencial') && v.getString('numero_omie'))
          emergenciais[v.getString('numero_omie')] = true
      } catch (_) {}
    }
    const linhas = $app.findRecordsByFilter('pcp_entregas_compra', '', 'data_prevista', 20000, 0)
    let ultima = ''
    const entregas = linhas.map((l) => {
      const pedida = Number(l.get('quantidade_pedida') || 0)
      const recebida = Number(l.get('quantidade_recebida') || 0)
      const restante = Math.max(0, Math.round((pedida - recebida) * 1e6) / 1e6)
      const prevista = l.getString('data_prevista') || null
      const cancelado = l.getBool('cancelado')
      const dias =
        prevista && !cancelado && restante > 0 ? Math.max(0, dia(hoje) - dia(prevista)) : 0
      const lido = l.getString('lido_em')
      if (lido > ultima) ultima = lido
      return {
        pedido_id: l.getString('pedido_id'),
        numero: l.getString('numero') || null,
        linha_id: l.getString('linha_id'),
        fornecedor: l.getString('fornecedor') || null,
        produto_id: l.getString('produto_id'),
        unidade: l.getString('unidade') || null,
        quantidade_pedida: pedida,
        quantidade_recebida: recebida,
        restante: restante,
        data_prevista: prevista,
        dias_atraso: dias,
        atrasado: dias > 0,
        cancelado: cancelado,
        emergencial: !!emergenciais[l.getString('numero')],
      }
    })
    const resumo = {}
    for (const x of entregas) {
      if (x.cancelado || x.restante <= 0) continue
      const k = x.fornecedor || 'não informado'
      if (!resumo[k]) resumo[k] = { fornecedor: k, em_aberto: 0, atrasadas: 0 }
      resumo[k].em_aberto++
      if (x.atrasado) resumo[k].atrasadas++
    }
    return e.json(200, {
      entregas: entregas,
      resumo: Object.keys(resumo).map((k) => resumo[k]),
      ultima_leitura: ultima || null,
      hoje: hoje,
    })
  },
  $apis.requireAuth(),
)
