// pocketbase/hooks/pcp_loop2_estado.js — SPEC-3-017 CA-3-45/46
// GET /backend/v1/pcp/assistente/loop — LOOP-02: a configuração (desligado até as condições), as perguntas
// prioritárias vigentes, as perguntas ao assistente do ciclo com a ligação e a decisão do validador, a
// medição do ciclo ATUAL calculada na hora (sem gravar) e os ciclos com veredito.
// Medida = prioritárias respondidas com fonte E período e aceitas pelo validador ÷ prioritárias feitas
// (perguntas LIGADAS a uma prioritária) no ciclo; sem nenhuma = "não aplicável", nunca 100%. Ciclo = a janela
// do cliente alinhada pelo calendário; sem janela, o mês corrente (provisório).
// Quem vê tudo: a gestão (as três áreas) ou o validador (validar_loop). Quem só tem consultar_assistente
// recebe apenas as próprias perguntas recentes e as prioritárias, para poder ligar sua pergunta. Os demais
// recebem 403 sem pistas. Só leitura.
routerAdd(
  'GET',
  '/backend/v1/pcp/assistente/loop',
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
    const consulta = acoes.indexOf('consultar_assistente') !== -1
    if (!perfil || !perfil.getBool('ativo') || !(gestao || validar || consulta))
      return e.forbiddenError('sem_permissao')
    const quem = String(auth.getString('email') || '').toLowerCase()

    const vig = {}
    for (const p of $app.findRecordsByFilter(
      'pcp_perguntas_prioritarias',
      '',
      'codigo,-versao',
      2000,
      0,
    )) {
      const c = p.getString('codigo')
      if (!vig[c] || Number(p.get('versao')) > vig[c].versao)
        vig[c] = {
          codigo: c,
          texto: p.getString('texto'),
          area: p.getString('area'),
          ativa: p.getBool('ativa'),
          versao: Number(p.get('versao')),
        }
    }
    const prioritarias = Object.keys(vig).map((k) => vig[k])
    const temFonte = (r) => {
      if (r.getString('resultado') !== 'respondida') return false
      try {
        return (JSON.parse(r.getString('fontes') || '[]') || []).some(
          (f) => f && f.nome && f.periodo,
        )
      } catch (_) {
        return false
      }
    }

    if (!(gestao || validar)) {
      const minhas = $app
        .findRecordsByFilter('pcp_assistente_perguntas', 'usuario = {:u}', '-created', 20, 0, {
          u: quem,
        })
        .map((r) => ({
          id: r.id,
          pergunta: r.getString('pergunta'),
          criada_em: r.getString('created'),
          resultado: r.getString('resultado'),
          tem_fonte: temFonte(r),
        }))
      return e.json(200, {
        somente_minhas: true,
        prioritarias: prioritarias.filter((p) => p.ativa),
        minhas: minhas,
      })
    }

    let cfg = {
      ativo: false,
      baseline_pct: null,
      alvo_pct: null,
      janela_dias: null,
      validador: null,
    }
    try {
      const c = $app.findFirstRecordByFilter('pcp_loop_config', "loop = 'LOOP-02'")
      cfg = {
        ativo: c.getBool('ativo'),
        baseline_pct: c.getBool('baseline_definida') ? Number(c.get('baseline_pct')) : null,
        alvo_pct: Number(c.get('alvo_pct')) > 0 ? Number(c.get('alvo_pct')) : null,
        janela_dias: Number(c.get('janela_dias')) > 0 ? Number(c.get('janela_dias')) : null,
        validador: c.getString('validador') || null,
      }
    } catch (_) {}
    const faltam = []
    if (prioritarias.filter((p) => p.ativa).length < 1) faltam.push('perguntas prioritárias')
    if (cfg.baseline_pct === null) faltam.push('linha de base')
    if (cfg.alvo_pct === null) faltam.push('alvo')
    if (cfg.janela_dias === null) faltam.push('janela')
    if (!cfg.validador) faltam.push('validador')

    const DIA = 86400000
    const hojeMs = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z').getTime()
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
    const revs = {}
    for (const r of $app.findRecordsByFilter('pcp_assistente_revisoes', '', '-created', 5000, 0)) {
      revs[r.getString('pergunta_id')] = {
        prioritaria: r.getString('prioritaria'),
        ligada_por: r.getString('ligada_por'),
        decisao: r.getString('decisao') || null,
        motivo: r.getString('motivo') || null,
        validador: r.getString('validador') || null,
        revisado_em: r.getString('revisado_em') || null,
      }
    }
    const perguntas = []
    let feitas = 0
    let aceitas = 0
    for (const r of $app.findRecordsByFilter('pcp_assistente_perguntas', '', '-created', 500, 0)) {
      const t = new Date(r.getString('created')).getTime()
      if (!(t >= inicioMs && t <= fimMs)) continue
      const rev = revs[r.id] || null
      const tf = temFonte(r)
      perguntas.push({
        id: r.id,
        usuario: r.getString('usuario'),
        pergunta: r.getString('pergunta'),
        criada_em: r.getString('created'),
        resultado: r.getString('resultado'),
        tem_fonte: tf,
        revisao: rev,
      })
      if (rev && rev.prioritaria) {
        feitas++
        if (rev.decisao === 'aceita' && tf) aceitas++
      }
    }
    const atual = {
      ciclo_inicio: new Date(inicioMs).toISOString().slice(0, 10),
      ciclo_fim: new Date(fimMs).toISOString().slice(0, 10),
      provisorio: provisorio,
      gerados: feitas,
      tratados: aceitas,
      proporcao_pct: feitas > 0 ? Math.round((aceitas / feitas) * 10000) / 100 : null,
      nao_aplicavel: feitas === 0,
    }
    const medicoes = $app
      .findRecordsByFilter('pcp_loop_medicoes', "loop = 'LOOP-02'", '-ciclo_inicio', 60, 0)
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
        veredito: m.getString('veredito') || null,
        veredito_por: m.getString('veredito_por') || null,
        veredito_texto: m.getString('veredito_texto') || null,
        congelada: m.getBool('congelada'),
      }))
    return e.json(200, {
      loop: 'LOOP-02',
      config: cfg,
      faltam_para_ligar: faltam,
      prioritarias: prioritarias,
      perguntas: perguntas,
      atual: atual,
      medicoes: medicoes,
      pode_cadastrar: gestao,
      pode_validar: validar && quem === cfg.validador,
      pode_configurar: acoes.indexOf('editar_parametros') !== -1,
      aviso: 'O loop só mede, lembra e registra o veredito: não responde no lugar do assistente.',
    })
  },
  $apis.requireAuth(),
)
