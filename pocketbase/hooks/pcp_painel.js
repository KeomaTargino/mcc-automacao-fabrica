// pocketbase/hooks/pcp_painel.js — SPEC-1-005 (CA-P1–P4)
// Painel diário por área: consome os LOTES ATIVOS publicados pelas SPECs anteriores
// (pcp_fontes/pcp_lotes/pcp_dados) — sem nova integração, sem acesso do navegador a
// coleção bruta ou segredo. Área 'painel' autoriza abrir a tela; CADA BLOCO exige
// separadamente a sua área (gestão não obtém tudo por padrão — CA-P4).
// Por bloco devolve: autorizado, indisponível (motivo), fonte/recurso/lote/ultimo_sucesso/
// estado_tecnico, resumo e itens (com filtros) e pendências — distinguindo ZERO VÁLIDO de
// INDISPONÍVEL de LOTE ANTIGO (CA-P3). Nenhuma soma entre unidades distintas; saldo
// indisponível não é zero; produção/compras sem fonte na Fase 1 → bloqueado explícito
// (nunca "integrado"). Filtros validados no servidor (intervalo invertido = erro de campo).
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

    const temArea = (a) => areas.indexOf(a) !== -1

    // helper: metadados de um fonte/recurso (lote ativo, último sucesso, estado técnico)
    const fonteMeta = (fonteNome, recurso) => {
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

    // helper: carrega itens do lote ativo de um recurso (array de JSON) — vazio se sem lote
    const itensDoLote = (meta) => {
      if (!meta || !meta.lote_ativo) return null
      try {
        const regs = $app.findRecordsByFilter('pcp_dados', 'lote = {:l}', 'id', 20000, 0, {
          l: meta.lote_ativo,
        })
        const arr = []
        for (const r of regs) {
          let it = {}
          try {
            it = JSON.parse(r.getString('conteudo') || '{}') || {}
          } catch (_) {}
          arr.push(it)
        }
        return arr
      } catch (_) {
        return null
      }
    }

    // === BLOCO ESTOQUE (área estoque) — posição atual do último lote; nunca soma unidades ===
    let estoque = { autorizado: temArea('estoque') }
    if (estoque.autorizado) {
      const meta = fonteMeta('omie', 'estoque')
      if (!meta || !meta.lote_ativo) {
        estoque = {
          ...estoque,
          disponivel: false,
          motivo: 'sem_lote_ativo',
          fonte: 'omie',
          recurso: 'estoque',
          pendencias: ['Estoque sem lote ativo — execute a sincronização (permissão técnica).'],
        }
      } else {
        const arr = itensDoLote(meta) || []
        const filtrados = arr.filter((it) => {
          if (
            filtroItem &&
            String(it.codigo || '')
              .toLowerCase()
              .indexOf(filtroItem) === -1 &&
            String(it.descricao || '')
              .toLowerCase()
              .indexOf(filtroItem) === -1
          )
            return false
          if (
            filtroLocal &&
            String(it.local_id || '')
              .toLowerCase()
              .indexOf(filtroLocal) === -1
          )
            return false
          return true
        })
        // resumo por UNIDADE (nunca soma KG com UN)
        const porUnidade = {}
        for (const it of filtrados) {
          const u = String(it.unidade || 'sem_unidade')
          porUnidade[u] = (porUnidade[u] || 0) + 1
        }
        estoque = {
          ...estoque,
          disponivel: true,
          fonte: 'omie',
          recurso: 'estoque',
          lote: meta.lote_ativo,
          ultimo_sucesso: meta.ultimo_sucesso,
          estado_tecnico: meta.estado_tecnico,
          total: filtrados.length,
          resumo_por_unidade: porUnidade,
          pendencias:
            filtrados.filter((it) => it.saldo === null || it.saldo === undefined).length > 0
              ? [
                  filtrados.filter((it) => it.saldo === null || it.saldo === undefined).length +
                    ' linha(s) com saldo ausente na fonte (null ≠ zero).',
                ]
              : [],
          itens: filtrados.slice(0, 50).map((it) => ({
            produto_id: it.produto_id,
            codigo: it.codigo,
            descricao: it.descricao,
            local_id: it.local_id,
            unidade: it.unidade,
            saldo: it.saldo,
            fisico: it.fisico,
            reservado: it.reservado,
          })),
          nota: 'posição atual do último lote (a fonte não expõe histórico diário)',
        }
      }
    }

    // === BLOCO PRODUÇÃO (área producao) — SEM fonte na Fase 1: bloqueado explícito ===
    let producao = { autorizado: temArea('producao') }
    if (producao.autorizado) {
      producao = {
        ...producao,
        disponivel: false,
        motivo: 'fonte_nao_integrada_na_fase_1',
        pendencias: [
          'Ordens de produção não têm leitura liberada na Fase 1 — bloco fica explicitamente bloqueado (não declarado integrado).',
        ],
      }
    }

    // === BLOCO COMPRAS (área compras) — SEM fonte na Fase 1: bloqueado explícito ===
    let compras = { autorizado: temArea('compras') }
    if (compras.autorizado) {
      compras = {
        ...compras,
        disponivel: false,
        motivo: 'fonte_nao_integrada_na_fase_1',
        pendencias: [
          'Documentos de compra não têm leitura liberada na Fase 1 — bloco fica explicitamente bloqueado (não declarado integrado).',
        ],
      }
    }

    // === BLOCO PEDIDOS (área pedidos) — oficiais elegíveis Omie + complementares separados ===
    let pedidos = { autorizado: temArea('pedidos') }
    if (pedidos.autorizado) {
      const metaOmie = fonteMeta('omie', 'pedidos')
      const metaNs = fonteMeta('nuvemshop', 'pedidos')
      const oficiaisArr = itensDoLote(metaOmie) || []
      const canalArr = itensDoLote(metaNs) || []
      // oficiais: contagem por ID único (codigo_pedido), etapa original preservada
      const vistos = {}
      let oficiaisUnicos = 0
      const etapas = {}
      for (const it of oficiaisArr) {
        const cab = it.cabecalho || {}
        const id = String(cab.codigo_pedido || '')
        if (!id || vistos[id]) continue
        vistos[id] = true
        oficiaisUnicos++
        const et = String(cab.etapa || 'sem_etapa')
        etapas[et] = (etapas[et] || 0) + 1
      }
      // canal: classificação na precedência da SPEC-1-003 (com vínculo por referência comprovada)
      const vinculadosId = {}
      for (const it of oficiaisArr) {
        const cab = it.cabecalho || {}
        const refInt = String(cab.codigo_pedido_integracao || '').trim()
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
      const canalFiltrado = canalArr.filter((it) => {
        if (
          filtroItem &&
          String(it.numero || '')
            .toLowerCase()
            .indexOf(filtroItem) === -1 &&
          String(it.pedido_id || '')
            .toLowerCase()
            .indexOf(filtroItem) === -1
        )
          return false
        if (filtroStatus) {
          const p = String(it.pagamento || '').toLowerCase()
          const s = String(it.status || '').toLowerCase()
          const classe =
            s === 'cancelled'
              ? 'cancelado'
              : String(vinculadosId[it.pedido_id || ''])
                ? 'vinculado'
                : p
          if (classe.indexOf(filtroStatus) === -1) return false
        }
        return true
      })
      for (const it of canalFiltrado) {
        const status = String(it.status || '')
        const pagamento = String(it.pagamento || '')
        if (status === 'cancelled') {
          classes.cancelado++
          continue
        }
        if (vinculadosId[String(it.pedido_id || '')]) {
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
      pedidos = {
        ...pedidos,
        oficiais: {
          disponivel: Boolean(metaOmie && metaOmie.lote_ativo),
          motivo: metaOmie && metaOmie.lote_ativo ? undefined : 'sem_lote_ativo',
          fonte: 'omie',
          recurso: 'pedidos',
          lote: metaOmie ? metaOmie.lote_ativo : '',
          ultimo_sucesso: metaOmie ? metaOmie.ultimo_sucesso : null,
          estado_tecnico: metaOmie ? metaOmie.estado_tecnico : '',
          total_por_id_unico: oficiaisUnicos,
          por_etapa: etapas,
          nota: 'contagem por ID único (código do pedido), não por linhas de item',
        },
        complementares: {
          disponivel: Boolean(metaNs && metaNs.lote_ativo),
          motivo: metaNs && metaNs.lote_ativo ? undefined : 'sem_lote_ativo',
          fonte: 'nuvemshop',
          recurso: 'pedidos',
          lote: metaNs ? metaNs.lote_ativo : '',
          ultimo_sucesso: metaNs ? metaNs.ultimo_sucesso : null,
          estado_tecnico: metaNs ? metaNs.estado_tecnico : '',
          contagem: classes,
          aviso: 'intenção de compra NÃO soma ao oficial; vínculo comprovado conta UMA vez',
        },
        pendencias: [
          ...(!metaOmie || !metaOmie.lote_ativo
            ? ['Lote oficial de pedidos do Omie ausente.']
            : []),
          ...(!metaNs || !metaNs.lote_ativo ? ['Lote do canal Nuvemshop ausente.'] : []),
        ],
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
      blocos: { estoque, producao, compras, pedidos },
    })
  },
  $apis.requireAuth(),
)
