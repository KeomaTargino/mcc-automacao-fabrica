// pocketbase/hooks/pcp_pedidos_visao.js — SPEC-1-003 task 0641975b (CA-N1/N2)
// Visão complementar dos pedidos Nuvemshop a partir do lote ativo (SPEC-1-002 mecânica):
// classificação na PRECEDÊNCIA da SPEC, sem escrever nos canais e sem inventar vínculo:
// (1) cancelado confirmado → cancelado; (2) conflito de referência → conflito;
// (3) vínculo único comprovado (Omie codigo_pedido_integracao) → vinculado_omie;
// (4) paid sem vínculo → pago_sem_vinculo; (5) pending/authorized → pendente_pagamento;
// (6) qualquer outro (voided, refunded, ...) → status_nao_mapeado (estado bruto preservado).
// Área 'pedidos' obrigatória; sem dado pessoal excessivo (sem endereço/contato).
routerAdd(
  'GET',
  '/backend/v1/pcp/pedidos/visao',
  (e) => {
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Sessão ausente ou expirada.')
    let perfil = null
    try {
      perfil = $app.findFirstRecordByFilter('pcp_perfis', 'usuario = {:u}', { u: auth.id })
    } catch (_) {}
    if (!perfil || !perfil.getBool('ativo')) return e.forbiddenError('perfil_invalido')
    const areas = perfil.getStringSlice('areas')
    if (areas.indexOf('pedidos') === -1) return e.forbiddenError('area_nao_autorizada')

    // lote ativo de nuvemshop:pedidos
    let fonte = null
    try {
      fonte = $app.findFirstRecordByFilter(
        'pcp_fontes',
        "fonte = 'nuvemshop' && recurso = 'pedidos' && aplicativo_ref = 'app1'",
        {},
      )
    } catch (_) {}
    const loteAtivo = fonte ? fonte.getString('lote_ativo') : ''
    if (!loteAtivo || !fonte) {
      return e.json(200, { disponivel: false, motivo: 'canal_sem_lote_ativo' })
    }
    if (fonte.getString('estado_tecnico') !== 'ok') {
      // canal com falha: pode mostrar lote antigo com aviso, nunca pedido presumido
    }
    const regs = $app.findRecordsByFilter('pcp_dados', 'lote = {:l}', 'id', 5000, 0, {
      l: loteAtivo,
    })
    const contagem = {
      pendente_pagamento: 0,
      pago_sem_vinculo: 0,
      vinculado_omie: 0,
      cancelado: 0,
      conflito: 0,
      status_nao_mapeado: 0,
    }
    const naoMapeados = {}
    let amostraPendente = null
    let amostraPago = null
    for (const r of regs) {
      let it = {}
      try {
        it = JSON.parse(r.getString('conteudo') || '{}')
      } catch (_) {}
      const status = String(it.status || '')
      const pagamento = String(it.pagamento || '')
      // (1) cancelado confirmado — precedência máxima
      if (status === 'cancelled') {
        contagem.cancelado++
        continue
      }
      // (2)/(3) vínculo: F1 usa codigo_pedido_integracao do Omie (amostra real: vazio) —
      // sem referência comprovada não há vínculo nem conflito a declarar (sem suposição)
      // (4) paid sem vínculo
      if (pagamento === 'paid') {
        contagem.pago_sem_vinculo++
        if (!amostraPago)
          amostraPago = { pedido_id: it.pedido_id, numero: it.numero, status, pagamento }
        continue
      }
      // (5) pending/authorized
      if (pagamento === 'pending' || pagamento === 'authorized') {
        contagem.pendente_pagamento++
        if (!amostraPendente)
          amostraPendente = { pedido_id: it.pedido_id, numero: it.numero, status, pagamento }
        continue
      }
      // (6) voided/refunded/partially_paid/desconhecido → não mapeado (estado bruto preservado)
      contagem.status_nao_mapeado++
      const k = pagamento || 'vazio'
      naoMapeados[k] = (naoMapeados[k] || 0) + 1
    }
    return e.json(200, {
      disponivel: true,
      fonte: 'nuvemshop',
      lote_ativo: loteAtivo,
      total_pedidos: regs.length,
      contagem,
      nao_mapeados_por_estado: naoMapeados,
      amostra_pendente: amostraPendente,
      amostra_pago_sem_vinculo: amostraPago,
      ultimo_sucesso: fonte.getString('ultimo_sucesso') || null,
      aviso:
        'totais Nuvemshop são complementares e NÃO somados aos oficiais do Omie (vínculo desconhecido)',
    })
  },
  $apis.requireAuth(),
)
