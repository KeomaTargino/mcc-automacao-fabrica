// pocketbase/hooks/pcp_pedidos_visao.js — SPEC-1-003 tasks 0641975b (CA-N1/N2) + b0502049 (CA-N3)
// Visão complementar dos pedidos Nuvemshop a partir do lote ativo (mecânica SPEC-1-002):
// classificação na PRECEDÊNCIA da SPEC, sem escrever nos canais e sem inventar vínculo:
// (1) cancelado confirmado → cancelado; (2) conflito de referência → conflito;
// (3) vínculo único comprovado (Omie codigo_pedido_integracao) → vinculado_omie;
// (4) paid sem vínculo → pago_sem_vinculo; (5) pending/authorized → pendente_pagamento;
// (6) qualquer outro (voided, refunded, ...) → status_nao_mapeado (estado bruto preservado).
// CA-N3: vínculo SOMENTE por referência comprovada (codigo_pedido_integracao do Omie
// = pedido_origem_id do canal). Mesma pessoa/valor/data NUNCA mescla (sem suposição).
// Duplicação no Omie: 1 pedido oficial por codigo_pedido — verificação embutida na visão
// (duplicados_oficiais) para provar que a contagem consolidada não infla o total oficial.
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
    const regs = $app.findRecordsByFilter('pcp_dados', 'lote = {:l}', 'id', 10000, 0, {
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
    // CA-N3: índice de vínculo por referência comprovada — construído do lote Omie ativo
    // (codigo_pedido_integracao → codigo_pedido). Sem referência no canal, vínculo fica 0.
    let vinculados = {} // pedido_origem_id → {omie_id, referencias: N}
    let conflitos = {} // pedido_origem_id → N referências (2+ = conflito)
    let duplicadosOficiais = [] // codigo_pedido Omie repetido no lote oficial (não deve acontecer)
    try {
      let fonteOmie = null
      try {
        fonteOmie = $app.findFirstRecordByFilter(
          'pcp_fontes',
          "fonte = 'omie' && recurso = 'pedidos' && aplicativo_ref = 'app1'",
          {},
        )
      } catch (_) {}
      if (fonteOmie && fonteOmie.getString('lote_ativo')) {
        const loteOmie = fonteOmie.getString('lote_ativo')
        const regsOmie = $app.findRecordsByFilter('pcp_dados', 'lote = {:l}', 'id', 10000, 0, {
          l: loteOmie,
        })
        const vistosOmie = {}
        for (const ro of regsOmie) {
          let it = {}
          try {
            it = JSON.parse(ro.getString('conteudo') || '{}') || {}
          } catch (_) {}
          const cab = it.cabecalho || {}
          const codPedido = String(cab.codigo_pedido || '')
          const refInt = String(cab.codigo_pedido_integracao || '')
          if (codPedido) {
            if (vistosOmie[codPedido]) {
              duplicadosOficiais.push(codPedido) // pedido oficial repetido no lote — sinaliza
            }
            vistosOmie[codPedido] = true
          }
          if (refInt) {
            // referência comprovada: canal → oficial
            if (!vinculados[refInt]) vinculados[refInt] = { omie_id: codPedido, referencias: 0 }
            vinculados[refInt].referencias++
            if (vinculados[refInt].referencias > 1) conflitos[refInt] = true
          }
        }
      }
    } catch (_) {}
    for (const r of regs) {
      let it = {}
      try {
        it = JSON.parse(r.getString('conteudo') || '{}') || {}
      } catch (_) {}
      const status = String(it.status || '')
      const pagamento = String(it.pagamento || '')
      const pedidoId = String(it.pedido_id || '')
      // (1) cancelado confirmado — precedência máxima
      if (status === 'cancelled') {
        contagem.cancelado++
        continue
      }
      // (2)/(3) vínculo: SOMENTE referência comprovada no índice Omie
      if (vinculados[pedidoId]) {
        if (conflitos[pedidoId]) {
          contagem.conflito++ // referência múltipla: originais preservados, sem merge
        } else {
          contagem.vinculado_omie++ // vínculo único comprovado: conta UMA vez no oficial
        }
        continue
      }
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
      // CA-N3: prova de não-duplicação no consolidado
      vinculados_com_referencia: Object.keys(vinculados).length,
      duplicados_oficiais: duplicadosOficiais.slice(0, 10),
      duplicados_oficiais_total: duplicadosOficiais.length,
      ultimo_sucesso: fonte.getString('ultimo_sucesso') || null,
      aviso:
        'totais Nuvemshop são complementares e NÃO somados aos oficiais do Omie (vínculo desconhecido)',
    })
  },
  $apis.requireAuth(),
)
