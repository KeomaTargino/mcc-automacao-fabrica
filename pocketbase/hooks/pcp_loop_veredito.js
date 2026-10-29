// pocketbase/hooks/pcp_loop_veredito.js — SPEC-3-013 CA-3-38 (RN-03, RN-04)
// POST /backend/v1/pcp/alertas/loop/veredito { ciclo_inicio: 'AAAA-MM-DD', veredito: 'atingido'|'nao_atingido', texto }
// Duas coisas, nesta ordem: (1) mede o ciclo pedido (alertas críticos tratados COM ação ÷ críticos gerados
// no ciclo; "não aplicável" sem crítico) e guarda a medição, se ainda não estiver congelada; (2) registra o
// veredito do validador, que CONGELA a medição. Só o validador indicado na configuração, com a ação
// validar_loop (403 sem pistas), e só com o loop LIGADO (as quatro condições do cliente cumpridas, senão
// 409 loop_desligado). Medição pendente ou não aplicável não recebe veredito. O ciclo precisa já ter
// terminado. O loop não trata alerta, não compra e não reprograma.
routerAdd(
  'POST',
  '/backend/v1/pcp/alertas/loop/veredito',
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
    const quem = String(auth.getString('email') || '').toLowerCase()
    let cfg = null
    try {
      cfg = $app.findFirstRecordByFilter('pcp_loop_config', "loop = 'LOOP-01'")
    } catch (_) {}
    if (
      !perfil ||
      !perfil.getBool('ativo') ||
      acoes.indexOf('validar_loop') === -1 ||
      !cfg ||
      !cfg.getString('validador') ||
      cfg.getString('validador') !== quem
    ) {
      return e.forbiddenError('sem_permissao')
    }
    if (!cfg.getBool('ativo')) return e.json(409, { erro: 'loop_desligado' })
    const b = e.requestInfo().body || {}
    if (b.veredito !== 'atingido' && b.veredito !== 'nao_atingido') {
      return e.json(422, {
        erro: 'dados_invalidos',
        motivos: ['o veredito é "atingido" ou "não atingido"'],
      })
    }
    const mi = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(b.ciclo_inicio || ''))
    const janela = Number(cfg.get('janela_dias') || 0)
    if (!mi || janela < 1)
      return e.json(422, {
        erro: 'dados_invalidos',
        motivos: ['informe o início do ciclo (AAAA-MM-DD)'],
      })
    const DIA = 86400000
    const inicioMs = new Date(b.ciclo_inicio + 'T00:00:00Z').getTime()
    const fimMs = inicioMs + janela * DIA - 1
    if (Math.floor(inicioMs / DIA) % janela !== 0)
      return e.json(422, {
        erro: 'dados_invalidos',
        motivos: ['esse dia não é o início de um ciclo da janela definida'],
      })
    if (fimMs >= Date.now())
      return e.json(409, { erro: 'ciclo_em_andamento', motivo: 'o ciclo ainda não terminou' })
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
    if (gerados === 0)
      return e.json(409, {
        erro: 'nao_aplicavel',
        motivo: 'nenhum alerta crítico no ciclo: não há o que validar',
      })
    let resposta = null
    try {
      $app.runInTransaction((tx) => {
        let m = null
        try {
          m = tx.findFirstRecordByFilter(
            'pcp_loop_medicoes',
            "loop = 'LOOP-01' && ciclo_inicio = {:i}",
            { i: b.ciclo_inicio },
          )
        } catch (_) {}
        if (m && m.getBool('congelada')) {
          resposta = { http: 409, corpo: { erro: 'ja_congelada' } }
          return
        }
        if (!m) {
          m = new Record(tx.findCollectionByNameOrId('pcp_loop_medicoes'))
          m.set('loop', 'LOOP-01')
          m.set('ciclo_inicio', b.ciclo_inicio)
        }
        const agora = new Date().toISOString()
        m.set('ciclo_fim', new Date(fimMs).toISOString().slice(0, 10))
        m.set('gerados', gerados)
        m.set('tratados', tratados)
        m.set('proporcao_pct', Math.round((tratados / gerados) * 10000) / 100)
        m.set('nao_aplicavel', false)
        m.set('pendente', false)
        m.set('calculado_em', agora)
        m.set('veredito', b.veredito)
        m.set('veredito_por', quem)
        m.set('veredito_em', agora)
        m.set('veredito_texto', String(b.texto || '').trim())
        m.set('congelada', true)
        tx.save(m)
        resposta = {
          http: 200,
          corpo: {
            ok: true,
            ciclo_inicio: b.ciclo_inicio,
            gerados: gerados,
            tratados: tratados,
            proporcao_pct: Math.round((tratados / gerados) * 10000) / 100,
            veredito: b.veredito,
            congelada: true,
          },
        }
      })
    } catch (_) {
      return e.json(409, {
        erro: 'conflito',
        motivo: 'outra gravação chegou ao mesmo tempo; recarregue',
      })
    }
    return e.json(resposta.http, resposta.corpo)
  },
  $apis.requireAuth(),
)
