// pocketbase/hooks/pcp_loop_alertas.js — SPEC-3-013 CA-3-37/38
// GET /backend/v1/pcp/alertas/loop — LOOP-01: a configuração (desligado até as quatro condições), a
// medição do ciclo ATUAL calculada na hora (sem gravar) e as medições guardadas, com veredito.
// Medida = alertas críticos tratados COM ação registrada ÷ críticos gerados no ciclo; sem crítico no
// ciclo = "não aplicável", nunca 100%. Ciclo = janela definida pelo cliente, alinhada pelo calendário; sem
// janela, o mês corrente como ciclo provisório. Quem consulta: gestão (as três áreas) ou o validador
// (ação validar_loop); os demais recebem 403 sem pistas. Só leitura.
routerAdd(
  'GET',
  '/backend/v1/pcp/alertas/loop',
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
    const areas = perfil ? perfil.getStringSlice('areas') : []
    const gestao =
      areas.indexOf('planejamento') !== -1 &&
      areas.indexOf('compras') !== -1 &&
      areas.indexOf('faturamento') !== -1
    const validar = acoes.indexOf('validar_loop') !== -1
    if (!perfil || !perfil.getBool('ativo') || !(gestao || validar))
      return e.forbiddenError('sem_permissao')

    let cfg = {
      ativo: false,
      baseline_pct: null,
      alvo_pct: null,
      janela_dias: null,
      validador: null,
    }
    try {
      const c = $app.findFirstRecordByFilter('pcp_loop_config', "loop = 'LOOP-01'")
      const n = (k) =>
        c.get(k) === null || c.get(k) === undefined || c.get(k) === 0 ? null : Number(c.get(k))
      cfg = {
        ativo: c.getBool('ativo'),
        baseline_pct: c.getBool('baseline_definida') ? Number(c.get('baseline_pct')) : null,
        alvo_pct: n('alvo_pct'),
        janela_dias: n('janela_dias'),
        validador: c.getString('validador') || null,
      }
    } catch (_) {}
    const faltam = []
    if (cfg.baseline_pct === null) faltam.push('linha de base')
    if (cfg.alvo_pct === null) faltam.push('alvo')
    if (cfg.janela_dias === null) faltam.push('janela')
    if (!cfg.validador) faltam.push('validador')

    const agora = new Date()
    const DIA = 86400000
    const hojeMs = new Date(agora.toISOString().slice(0, 10) + 'T00:00:00Z').getTime()
    let inicioMs
    let fimMs
    let provisorio = false
    if (cfg.janela_dias) {
      const n = Math.floor(hojeMs / DIA / cfg.janela_dias)
      inicioMs = n * cfg.janela_dias * DIA
      fimMs = inicioMs + cfg.janela_dias * DIA - 1
    } else {
      provisorio = true
      const d = new Date(hojeMs)
      inicioMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)
      fimMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) - 1
    }
    const ACOES = [
      'compra_solicitada',
      'ordem_reprogramada',
      'fornecedor_contatado',
      'pedido_liberado',
      'risco_aceito',
      'alerta_indevido',
      'outra',
    ]
    let gerados = 0
    let tratados = 0
    for (const a of $app.findRecordsByFilter(
      'pcp_alertas',
      "gravidade = 'critico'",
      'created',
      20000,
      0,
    )) {
      const t = new Date(a.getString('aberto_em')).getTime()
      if (!(t >= inicioMs && t <= fimMs)) continue
      gerados++
      const tt = a.getString('tratado_em') ? new Date(a.getString('tratado_em')).getTime() : null
      if (
        a.getString('estado') === 'tratado' &&
        ACOES.indexOf(a.getString('acao')) !== -1 &&
        tt !== null &&
        tt <= fimMs
      )
        tratados++
    }
    const atual = {
      ciclo_inicio: new Date(inicioMs).toISOString().slice(0, 10),
      ciclo_fim: new Date(fimMs).toISOString().slice(0, 10),
      provisorio: provisorio,
      gerados: gerados,
      tratados: tratados,
      proporcao_pct: gerados > 0 ? Math.round((tratados / gerados) * 10000) / 100 : null,
      nao_aplicavel: gerados === 0,
    }
    const medicoes = $app
      .findRecordsByFilter('pcp_loop_medicoes', "loop = 'LOOP-01'", '-ciclo_inicio', 60, 0)
      .map((m) => ({
        ciclo_inicio: m.getString('ciclo_inicio'),
        ciclo_fim: m.getString('ciclo_fim'),
        gerados: Number(m.get('gerados') || 0),
        tratados: Number(m.get('tratados') || 0),
        proporcao_pct:
          m.getBool('nao_aplicavel') || m.getBool('pendente')
            ? null
            : Number(m.get('proporcao_pct') || 0),
        nao_aplicavel: m.getBool('nao_aplicavel'),
        pendente: m.getBool('pendente'),
        veredito: m.getString('veredito') || null,
        veredito_por: m.getString('veredito_por') || null,
        veredito_em: m.getString('veredito_em') || null,
        veredito_texto: m.getString('veredito_texto') || null,
        congelada: m.getBool('congelada'),
      }))
    return e.json(200, {
      loop: 'LOOP-01',
      config: cfg,
      faltam_para_ligar: faltam,
      atual: atual,
      medicoes: medicoes,
      pode_validar: validar,
      pode_configurar: acoes.indexOf('editar_parametros') !== -1,
      aviso:
        'O loop só mede, lembra e registra o veredito: não trata alerta, não compra e não reprograma.',
    })
  },
  $apis.requireAuth(),
)
