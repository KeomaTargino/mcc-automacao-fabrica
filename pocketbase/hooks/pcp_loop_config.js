// pocketbase/hooks/pcp_loop_config.js — SPEC-3-013 CA-3-38 (RN-03; CL-PEND-005)
// POST /backend/v1/pcp/alertas/loop/config { baseline_pct?, alvo_pct?, janela_dias?, validador?, ligar? }
// Grava o que o cliente definiu para o LOOP-01. O loop nasce DESLIGADO. Pedir para ligar sem linha de base,
// alvo, janela E validador é recusado (422, e o loop continua desligado); apagar uma das quatro desliga de
// novo. O validador é o e-mail de uma conta ativa que tenha a ação validar_loop. Exige editar_parametros
// (403 sem pistas). Nada aqui trata alerta, compra ou reprograma.
routerAdd(
  'POST',
  '/backend/v1/pcp/alertas/loop/config',
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
    let c = null
    try {
      c = $app.findFirstRecordByFilter('pcp_loop_config', "loop = 'LOOP-01'")
    } catch (_) {}
    const atual = {
      baseline: c && c.getBool('baseline_definida') ? Number(c.get('baseline_pct')) : null,
      alvo: c && Number(c.get('alvo_pct')) > 0 ? Number(c.get('alvo_pct')) : null,
      janela: c && Number(c.get('janela_dias')) > 0 ? Number(c.get('janela_dias')) : null,
      validador: c && c.getString('validador') ? c.getString('validador') : null,
    }
    const tem = (k) => Object.prototype.hasOwnProperty.call(b, k)
    const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v))
    const novo = {
      baseline: tem('baseline_pct') ? num(b.baseline_pct) : atual.baseline,
      alvo: tem('alvo_pct') ? num(b.alvo_pct) : atual.alvo,
      janela: tem('janela_dias') ? num(b.janela_dias) : atual.janela,
      validador: tem('validador')
        ? String(b.validador || '')
            .trim()
            .toLowerCase() || null
        : atual.validador,
    }
    const erros = []
    if (
      novo.baseline !== null &&
      (!isFinite(novo.baseline) || novo.baseline < 0 || novo.baseline > 100)
    )
      erros.push('linha de base deve ficar entre 0 e 100')
    if (novo.alvo !== null && (!isFinite(novo.alvo) || novo.alvo <= 0 || novo.alvo > 100))
      erros.push('alvo deve ficar entre 0 e 100')
    if (
      novo.janela !== null &&
      (!isFinite(novo.janela) ||
        Math.floor(novo.janela) !== novo.janela ||
        novo.janela < 1 ||
        novo.janela > 366)
    )
      erros.push('janela deve ser um número inteiro de dias, de 1 a 366')
    if (novo.validador) {
      let ok = false
      try {
        const u = $app.findAuthRecordByEmail('users', novo.validador)
        const p = $app.findFirstRecordByFilter('pcp_perfis', 'usuario = {:u}', { u: u.id })
        ok =
          p.getBool('ativo') &&
          (JSON.parse(p.getString('acoes') || '[]') || []).indexOf('validar_loop') !== -1
      } catch (_) {}
      if (!ok) erros.push('o validador precisa ser uma conta ativa com a ação validar_loop')
    }
    if (erros.length > 0) return e.json(422, { erro: 'dados_invalidos', motivos: erros })
    const faltam = []
    if (novo.baseline === null) faltam.push('linha de base')
    if (novo.alvo === null) faltam.push('alvo')
    if (novo.janela === null) faltam.push('janela')
    if (!novo.validador) faltam.push('validador')
    if (b.ligar === true && faltam.length > 0) {
      return e.json(422, {
        erro: 'condicoes_nao_cumpridas',
        faltam: faltam,
        motivo: 'o loop continua desligado',
      })
    }
    let ativo = c ? c.getBool('ativo') : false
    if (b.ligar === true) ativo = true
    if (b.ligar === false || faltam.length > 0) ativo = false
    if (!c) {
      c = new Record($app.findCollectionByNameOrId('pcp_loop_config'))
      c.set('loop', 'LOOP-01')
    }
    c.set('ativo', ativo)
    c.set('baseline_definida', novo.baseline !== null)
    c.set('baseline_pct', novo.baseline === null ? 0 : novo.baseline)
    c.set('alvo_pct', novo.alvo === null ? 0 : novo.alvo)
    c.set('janela_dias', novo.janela === null ? 0 : novo.janela)
    c.set('validador', novo.validador || '')
    c.set('definido_por', auth.getString('email') || auth.id)
    c.set('definido_em', new Date().toISOString())
    $app.save(c)
    return e.json(200, { ok: true, ativo: ativo, faltam_para_ligar: faltam })
  },
  $apis.requireAuth(),
)
