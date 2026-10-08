// pocketbase/hooks/pcp_painel.js — SPEC-1-005 (CA-P1–P4)
// Painel diário por área: consome os LOTES ATIVOS publicados pelas SPECs anteriores
// (pcp_fontes/pcp_lotes/pcp_dados) — sem nova integração, sem acesso do navegador a
// coleção bruta ou segredo. Área 'painel' autoriza abrir a tela; CADA BLOCO exige
// separadamente a sua área (gestão não obtém tudo por padrão — CA-P4).
// Por bloco devolve: autorizado, disponível/motivo, fonte/recurso/lote/ultimo_sucesso/
// estado_tecnico, resumo e itens (com filtros) e pendências — distinguindo ZERO VÁLIDO de
// INDISPONÍVEL de LOTE ANTIGO (CA-P3). Nenhuma soma entre unidades distintas; saldo
// indisponível não é zero; produção/compras sem fonte na Fase 1 → bloqueado explícito
// (nunca "integrado"). Filtros validados no servidor (intervalo invertido = erro de campo).
// BUG-3 (log 20:52): goja NÃO suporta object spread ({...x, campo}) — ReferenceError
// __spreadValues; objetos construídos explicitamente em cada ramo (AP-2026-10-08-2052).
routerAdd(
  'GET',
  '/backend/v1/pcp/painel',
  (e) => {
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Sessão ausente ou expirada.')
    let perfil = null
    try {
      perfil = $app.findFirstRecordByFilter('pcp_perfis', 'usuario = {:u}', { u: auth.id })
    } catch (_) {}
    if (!perfil || !perfil.getBool('ativo')) return e.forbiddenError('perfil_invalido')
    const areas = perfil.getStringSlice('areas')
    if (areas.indexOf('painel') === -1) return e.forbiddenError('area_nao_autorizada')

    const q = e.requestInfo().query
    const dataIni = String(q.data_ini || '').trim()
    const dataFim = String(q.data_fim || '').trim()
    const filtroItem = String(q.item || '')
      .trim()
      .toLowerCase()
    const filtroStatus = String(q.status || '')
      .trim()
      .toLowerCase()
    const filtroLocal = String(q.local || '')
      .trim()
      .toLowerCase()
    if (
      (dataIni && !/^\d{4}-\d{2}-\d{2}$/.test(dataIni)) ||
      (dataFim && !/^\d{4}-\d{2}-\d{2}$/.test(dataFim))
    ) {
      return e.badRequestError('filtro_invalido: use AAAA-MM-DD')
    }
    if (dataIni && dataFim && dataIni > dataFim) {
      return e.badRequestError('filtro_invalido: intervalo invertido')
    }

    const temArea = function (a) {
      return areas.indexOf(a) !== -1
    }

    // helper: metadados de um fonte/recurso (lote ativo, último sucesso, estado técnico)
    const fonteMeta = function (fonteNome, recurso) {
      let f = null
      try {
        f = $app.findFirstRecordByFilter(
          'pcp_fontes',
          "fonte = {:f} && recurso = {:r} && aplicativo_ref = 'app1'",
          { f: fonteNome, r: recurso },
        )
      } catch (_) {}
      if (!f) return null
      return {
        lote_ativo: f.getString('lote_ativo') || '',
        ultimo_sucesso: f.getString('ultimo_sucesso') || null,
        ultima_tentativa: f.getString('ultima_tentativa') || null,
        estado_tecnico: f.getString('estado_tecnico') || '',
      }
    }

    // helper: carrega itens do lote ativo de um recurso (array de JSON) — null se sem lote
    const itensDoLote = function (meta) {
      if (!meta || !meta.lote_ativo) return null
      try {
        const regs = $app.findRecordsByFilter('pcp_dados', 'lote = {:l}', 'id', 20000, 0, {
          l: meta.lote_ativo,
        })
        const arr = []
        for (var i = 0; i < regs.length; i++) {
          let it = {}
          try {
            it = JSON.parse(regs[i].getString('conteudo') || '{}') || {}
          } catch (_) {}
          arr.push(it)
        }
        return arr
      } catch (_) {
        return null
      }
    }

    // === BLOCO ESTOQUE (área estoque) — posição atual do último lote; nunca soma unidades ===
    let estoque = null
    if (!temArea('estoque')) {
      estoque = { autorizado: false }
    } else {
      const meta = fonteMeta('omie', 'estoque')
      if (!meta || !meta.lote_ativo) {
        estoque = {
          autorizado: true,
          disponivel: false,
          motivo: 'sem_lote_ativo',
          fonte: 'omie',
          recurso: 'estoque',
          pendencias: ['Estoque sem lote ativo — execute a sincronização (permissão técnica).'],
        }
      } else {
        const arr = itensDoLote(meta) || []
        const filtrados = []
        for (var ie = 0; ie < arr.length; ie++) {
          const it = arr[ie]
          if (
            filtroItem &&
            String(it.codigo || '')
              .toLowerCase()
              .indexOf(filtroItem) === -1 &&
            String(it.descricao || '')
              .toLowerCase()
              .indexOf(filtroItem) === -1
          )
            continue
          if (
            filtroLocal &&
            String(it.local_id || '')
              .toLowerCase()
              .indexOf(filtroLocal) === -1
          )
            continue
          filtrados.push(it)
        }
        // resumo por UNIDADE (nunca soma KG com UN)
        const porUnidade = {}
        let saldoAusente = 0
        for (var iu = 0; iu < filtrados.length; iu++) {
          const it2 = filtrados[iu]
          const u = String(it2.unidade || 'sem_unidade')
          porUnidade[u] = (porUnidade[u] || 0) + 1
          if (it2.saldo === null || it2.saldo === undefined) saldoAusente++
        }
        const itens = []
        for (var ii = 0; ii < filtrados.length && ii < 50; ii++) {
          const it3 = filtrados[ii]
          itens.push({
            produto_id: it3.produto_id,
            codigo: it3.codigo,
            descricao: it3.descricao,
            local_id: it3.local_id,
            unidade: it3.unidade,
            saldo: it3.saldo,
            fisico: it3.fisico,
            reservado: it3.reservado,
          })
        }
        const pend = []
        if (saldoAusente > 0)
          pend.push(saldoAusente + ' linha(s) com saldo ausente na fonte (null ≠ zero).')
        estoque = {
          autorizado: true,
          disponivel: true,
          fonte: 'omie',
          recurso: 'estoque',
          lote: meta.lote_ativo,
          ultimo_sucesso: meta.ultimo_sucesso,
          estado_tecnico: meta.estado_tecnico,
          total: filtrados.length,
          resumo_por_unidade: porUnidade,
          pendencias: pend,
          itens: itens,
          nota: 'posição atual do último lote (a fonte não expõe histórico diário)',
        }
      }
    }

    // === BLOCO PRODUÇÃO (área producao) — SEM fonte na Fase 1: bloqueado explícito ===
    let producao = null
    if (!temArea('producao')) {
      producao = { autorizado: false }
    } else {
      producao = {
        autorizado: true,
        disponivel: false,
        motivo: 'fonte_nao_integrada_na_fase_1',
        pendencias: [
          'Ordens de produção não têm leitura liberada na Fase 1 — bloco fica explicitamente bloqueado (não declarado integrado).',
        ],
      }
    }

    // === BLOCO COMPRAS (área compras) — SEM fonte na Fase 1: bloqueado explícito ===
    let compras = null
    if (!temArea('compras')) {
      compras = { autorizado: false }
    } else {
      compras = {
        autorizado: true,
        disponivel: false,
        motivo: 'fonte_nao_integrada_na_fase_1',
        pendencias: [
          'Documentos de compra não têm leitura liberada na Fase 1 — bloco fica explicitamente bloqueado (não declarado integrado).',
        ],
      }
    }

    // === BLOCO PEDIDOS (área pedidos) — oficiais elegíveis Omie + complementares separados ===
    let pedidos = null
    if (!temArea('pedidos')) {
      pedidos = { autorizado: false }
    } else {
      const metaOmie = fonteMeta('omie', 'pedidos')
      const metaNs = fonteMeta('nuvemshop', 'pedidos')
      const oficiaisArr = itensDoLote(metaOmie) || []
      const canalArr = itensDoLote(metaNs) || []
      // oficiais: contagem por ID único (codigo_pedido), etapa original preservada
      const vistos = {}
      let oficiaisUnicos = 0
      const etapas = {}
      const pendFiltrados = []
      for (var io = 0; io < oficiaisArr.length; io++) {
        const itO = oficiaisArr[io]
        const cab = itO.cabecalho || {}
        const id = String(cab.codigo_pedido || '')
        if (id && !vistos[id]) {
          vistos[id] = true
          oficiaisUnicos++
          const et = String(cab.etapa || 'sem_etapa')
          etapas[et] = (etapas[et] || 0) + 1
        }
      }
      // canal: índice de vínculo por referência comprovada (SPEC-1-003)
      const vinculadosId = {}
      for (var iv = 0; iv < oficiaisArr.length; iv++) {
        const cabV = oficiaisArr[iv].cabecalho || {}
        const refInt = String(cabV.codigo_pedido_integracao || '').trim()
        if (refInt) vinculadosId[refInt] = (vinculadosId[refInt] || 0) + 1
      }
      const classes = {
        vinculado_omie: 0,
        pendente_pagamento: 0,
        pago_sem_vinculo: 0,
        cancelado: 0,
        conflito: 0,
        status_nao_mapeado: 0,
      }
      for (var ic = 0; ic < canalArr.length; ic++) {
        const itC = canalArr[ic]
        if (
          filtroItem &&
          String(itC.numero || '')
            .toLowerCase()
            .indexOf(filtroItem) === -1 &&
          String(itC.pedido_id || '')
            .toLowerCase()
            .indexOf(filtroItem) === -1
        )
          continue
        const status = String(itC.status || '')
        const pagamento = String(itC.pagamento || '')
        if (filtroStatus) {
          let classe = ''
          if (status === 'cancelled') classe = 'cancelado'
          else if (vinculadosId[String(itC.pedido_id || '')]) classe = 'vinculado'
          else classe = pagamento
          if (classe.toLowerCase().indexOf(filtroStatus) === -1) continue
        }
        if (status === 'cancelled') {
          classes.cancelado++
          continue
        }
        if (vinculadosId[String(itC.pedido_id || '')]) {
          classes.vinculado_omie++
          continue
        }
        if (pagamento === 'paid') {
          classes.pago_sem_vinculo++
          continue
        }
        if (pagamento === 'pending' || pagamento === 'authorized') {
          classes.pendente_pagamento++
          continue
        }
        classes.status_nao_mapeado++
      }
      const pendPed = []
      if (!metaOmie || !metaOmie.lote_ativo)
        pendPed.push('Lote oficial de pedidos do Omie ausente.')
      if (!metaNs || !metaNs.lote_ativo) pendPed.push('Lote do canal Nuvemshop ausente.')
      let oficiaisBloco = null
      if (metaOmie && metaOmie.lote_ativo) {
        oficiaisBloco = {
          disponivel: true,
          fonte: 'omie',
          recurso: 'pedidos',
          lote: metaOmie.lote_ativo,
          ultimo_sucesso: metaOmie.ultimo_sucesso,
          estado_tecnico: metaOmie.estado_tecnico,
          total_por_id_unico: oficiaisUnicos,
          por_etapa: etapas,
          nota: 'contagem por ID único (código do pedido), não por linhas de item',
        }
      } else {
        oficiaisBloco = {
          disponivel: false,
          motivo: 'sem_lote_ativo',
          fonte: 'omie',
          recurso: 'pedidos',
        }
      }
      let complementaresBloco = null
      if (metaNs && metaNs.lote_ativo) {
        complementaresBloco = {
          disponivel: true,
          fonte: 'nuvemshop',
          recurso: 'pedidos',
          lote: metaNs.lote_ativo,
          ultimo_sucesso: metaNs.ultimo_sucesso,
          estado_tecnico: metaNs.estado_tecnico,
          contagem: classes,
          aviso: 'intenção de compra NÃO soma ao oficial; vínculo comprovado conta UMA vez',
        }
      } else {
        complementaresBloco = {
          disponivel: false,
          motivo: 'sem_lote_ativo',
          fonte: 'nuvemshop',
          recurso: 'pedidos',
        }
      }
      pedidos = {
        autorizado: true,
        oficiais: oficiaisBloco,
        complementares: complementaresBloco,
        pendencias: pendPed,
      }
    }

    return e.json(200, {
      disponivel: true,
      gerado_em: new Date().toISOString(),
      filtros: {
        data_ini: dataIni,
        data_fim: dataFim,
        item: filtroItem,
        status: filtroStatus,
        local: filtroLocal,
      },
      blocos: { estoque: estoque, producao: producao, compras: compras, pedidos: pedidos },
    })
  },
  $apis.requireAuth(),
)
