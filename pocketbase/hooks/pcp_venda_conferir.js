// pocketbase/hooks/pcp_venda_conferir.js — SPEC-3-009 CA-3-29
// POST /backend/v1/pcp/faturamento/venda/conferir { pedido_id, operacao }
// Confere uma gravação "confirmada" ou em "resultado_incerto" CONSULTANDO o Omie (ConsultarPedido pelo
// código de integração). NUNCA grava de novo. Volumes e frete da consulta precisam bater com o liberado;
// no pedido manual, a quantidade de itens. Bloqueio por consumo (HTTP 425 / "consumo redundante") mantém o
// estado e a hora da próxima tentativa fica com quem chamou (sem laço). Exige liberar_faturamento OU
// preparar_pedido, com a área faturamento.
routerAdd(
  'POST',
  '/backend/v1/pcp/faturamento/venda/conferir',
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
      (acoes.indexOf('liberar_faturamento') === -1 && acoes.indexOf('preparar_pedido') === -1) ||
      perfil.getStringSlice('areas').indexOf('faturamento') === -1
    ) {
      return e.forbiddenError('sem_permissao')
    }
    const b = e.requestInfo().body || {}
    let g = null
    try {
      g = $app.findFirstRecordByFilter(
        'pcp_gravacoes_venda',
        'pedido_id = {:p} && operacao = {:o}',
        {
          p: String(b.pedido_id || ''),
          o: String(b.operacao || ''),
        },
      )
    } catch (_) {}
    if (!g) return e.json(409, { erro: 'sem_gravacao' })
    if (['confirmada', 'resultado_incerto'].indexOf(g.getString('estado')) === -1) {
      return e.json(409, { erro: 'estado_nao_confere', estado: g.getString('estado') })
    }
    const appKey = $secrets.get('OMIE_APP_KEY')
    const appSecret = $secrets.get('OMIE_APP_SECRET')
    if (!appKey || !appSecret) return e.badRequestError('credencial_ausente')
    let payload = {}
    try {
      payload = JSON.parse(g.getString('payload_hash') || '{}') || {}
    } catch (_) {}
    let status = 0
    let j = null
    try {
      const res = $http.send({
        url: 'https://app.omie.com.br/api/v1/produtos/pedido/',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          call: 'ConsultarPedido',
          app_key: appKey,
          app_secret: appSecret,
          param: [{ codigo_pedido_integracao: g.getString('codigo_integracao') }],
        }),
        timeout: 30,
      })
      status = res.statusCode
      j = res.json
    } catch (_) {
      return e.json(200, {
        ok: true,
        estado: g.getString('estado'),
        inconclusivo: true,
        motivo: 'consulta sem resposta',
      })
    }
    const fault = String((j && j.faultstring) || '').toLowerCase()
    if (status === 425 || fault.indexOf('consumo redundante') !== -1) {
      return e.json(200, {
        ok: true,
        estado: g.getString('estado'),
        inconclusivo: true,
        motivo: 'Omie pediu para esperar; tente mais tarde',
      })
    }
    const ped = (j && j.pedido_venda_produto) || null
    let confere = false
    if (ped) {
      if (g.getString('operacao') === 'incluir_manual') {
        confere = (ped.det || []).length === (payload.det || []).length
      } else {
        const fr = ped.frete || {}
        confere =
          Number(fr.quantidade_volumes) === Number((payload.frete || {}).quantidade_volumes) &&
          String(fr.modalidade) === String((payload.frete || {}).modalidade)
      }
    }
    const novo = confere ? 'gravado_e_conferido' : 'resultado_incerto'
    g.set('estado', novo)
    $app.save(g)
    return e.json(200, { ok: true, estado: novo, conferido: confere })
  },
  $apis.requireAuth(),
)
