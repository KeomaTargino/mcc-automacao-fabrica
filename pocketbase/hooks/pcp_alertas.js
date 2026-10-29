// pocketbase/hooks/pcp_alertas.js — SPEC-3-010 CA-3-31/32 e SPEC-3-011 CA-3-33/34
// GET /backend/v1/pcp/alertas — os alertas não tratados DA ÁREA de quem pergunta (e os tratados dos
// últimos 30 dias), com tipo, item, gravidade, regra, números usados, estado do ciclo, responsável e a
// ligação ao alerta anterior; mais as lacunas, as regras desligadas e a hora da última rodada.
// Destinatário por tipo: estoque, produção e divergência → PCP (área planejamento); compra e preço →
// Compras; pedido → faturamento. Quem tem as três áreas (gestão) vê todos. Alerta de outra área não
// aparece (e as rotas de ação o negam com a mesma recusa de quem não tem a ação). Só leitura.
routerAdd(
  'GET',
  '/backend/v1/pcp/alertas',
  (e) => {
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Sessão ausente ou expirada.')
    let perfil = null
    try {
      perfil = $app.findFirstRecordByFilter('pcp_perfis', 'usuario = {:u}', { u: auth.id })
    } catch (_) {}
    if (!perfil || !perfil.getBool('ativo') || perfil.getStringSlice('areas').length === 0) {
      return e.forbiddenError('sem_permissao')
    }
    let acoes = []
    try {
      acoes = JSON.parse(perfil.getString('acoes') || '[]') || []
    } catch (_) {}
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
    const ve = (tipo) => !!AREA[tipo] && (gestao || areas.indexOf(AREA[tipo]) !== -1)
    const podeTratar = acoes.indexOf('tratar_alerta') !== -1
    const corte = new Date(Date.now() - 30 * 86400000).toISOString()
    const alertas = []
    for (const r of $app.findRecordsByFilter(
      'pcp_alertas',
      "estado != 'tratado' || tratado_em >= {:c}",
      '-atualizado_em',
      800,
      0,
      { c: corte },
    )) {
      if (!ve(r.getString('tipo'))) continue
      let valores = {}
      try {
        valores = JSON.parse(r.getString('valores') || '{}') || {}
      } catch (_) {}
      alertas.push({
        id: r.id,
        chave: r.getString('chave'),
        tipo: r.getString('tipo'),
        item: r.getString('item'),
        referencia: r.getString('referencia'),
        gravidade: r.getString('gravidade'),
        regra: r.getString('regra'),
        valores: valores,
        versao_parametros: Number(r.get('versao_parametros') || 0),
        estado: r.getString('estado') || 'aberto',
        versao: Number(r.get('versao') || 1),
        responsavel: r.getString('responsavel') || null,
        anterior_id: r.getString('anterior_id') || null,
        acao: r.getString('acao') || null,
        acao_texto: r.getString('acao_texto') || null,
        tratado_por: r.getString('tratado_por') || null,
        tratado_em: r.getString('tratado_em') || null,
        aberto_em: r.getString('aberto_em'),
        atualizado_em: r.getString('atualizado_em'),
        dado_em: r.getString('dado_em'),
        fonte_desatualizada: r.getBool('fonte_desatualizada'),
        atualizacoes: Number(r.get('atualizacoes') || 0),
        pode_tratar: podeTratar,
      })
    }
    const lacunas = $app
      .findRecordsByFilter('pcp_alertas_lacunas', '', 'regra,item', 5000, 0)
      .filter((l) => ve(l.getString('regra')))
      .map((r) => ({
        regra: r.getString('regra'),
        item: r.getString('item'),
        campo: r.getString('campo'),
        motivo: r.getString('motivo'),
      }))
    const desligadas = []
    for (const r of $app.findRecordsByFilter('pcp_alertas_regras', 'ativa = false', 'tipo', 100, 0))
      desligadas.push(r.getString('tipo'))
    let ultima = null
    for (const a of alertas) if (!ultima || a.atualizado_em > ultima) ultima = a.atualizado_em
    return e.json(200, {
      alertas: alertas,
      lacunas: lacunas,
      regras_desligadas: desligadas,
      ultima_rodada: ultima,
      pode_rodar: acoes.indexOf('editar_parametros') !== -1,
      pode_tratar: podeTratar,
      pode_mudar_regra: acoes.indexOf('editar_parametros') !== -1,
    })
  },
  $apis.requireAuth(),
)
