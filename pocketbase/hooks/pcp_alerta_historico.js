// pocketbase/hooks/pcp_alerta_historico.js — SPEC-3-011 CA-3-33
// GET /backend/v1/pcp/alertas/historico?id=<alerta> — quem fez o quê e quando com o alerta (assumido,
// tratado), do mais antigo ao mais novo; segue a ligação "alerta anterior" para mostrar o histórico da
// mesma situação. Só quem vê a área do alerta (a mesma recusa 403 para os demais). Só leitura.
routerAdd(
  'GET',
  '/backend/v1/pcp/alertas/historico',
  (e) => {
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Sessão ausente ou expirada.')
    let perfil = null
    try {
      perfil = $app.findFirstRecordByFilter('pcp_perfis', 'usuario = {:u}', { u: auth.id })
    } catch (_) {}
    let alerta = null
    try {
      alerta = $app.findRecordById('pcp_alertas', String(e.request.url.query().get('id') || ''))
    } catch (_) {}
    const AREA = {
      estoque: 'planejamento',
      producao: 'planejamento',
      divergencia: 'planejamento',
      compra: 'compras',
      preco: 'compras',
      pedido: 'faturamento',
    }
    const areas = perfil ? perfil.getStringSlice('areas') : []
    const gestao =
      areas.indexOf('planejamento') !== -1 &&
      areas.indexOf('compras') !== -1 &&
      areas.indexOf('faturamento') !== -1
    const area = alerta ? AREA[alerta.getString('tipo')] : null
    if (
      !perfil ||
      !perfil.getBool('ativo') ||
      !alerta ||
      !area ||
      !(gestao || areas.indexOf(area) !== -1)
    ) {
      return e.forbiddenError('sem_permissao')
    }
    const eventos = []
    let atual = alerta
    let guarda = 0
    while (atual && guarda < 20) {
      for (const h of $app.findRecordsByFilter(
        'pcp_alertas_historico',
        'alerta_id = {:a}',
        'created',
        200,
        0,
        { a: atual.id },
      )) {
        eventos.push({
          alerta_id: atual.id,
          ocorrencia: Number(atual.get('ocorrencia') || 1),
          evento: h.getString('evento'),
          autor: h.getString('autor'),
          em: h.getString('em'),
          detalhe: h.getString('detalhe'),
        })
      }
      const ant = atual.getString('anterior_id')
      atual = null
      if (ant) {
        try {
          atual = $app.findRecordById('pcp_alertas', ant)
        } catch (_) {}
      }
      guarda++
    }
    eventos.sort((x, y) => (x.em < y.em ? -1 : x.em > y.em ? 1 : 0))
    return e.json(200, { alerta_id: alerta.id, eventos: eventos })
  },
  $apis.requireAuth(),
)
