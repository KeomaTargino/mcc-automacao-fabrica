// pocketbase/hooks/pcp_vendas_historico.js — SPEC-3-012 CA-3-35/36 (RN-01 a RN-05)
// GET /backend/v1/pcp/vendas/historico?produto=<codigo>&periodo=AAAA-MM&data_necessaria=AAAA-MM-DD
// Comparação do mês de referência com o MESMO MÊS dos anos anteriores, para um produto: quantidade,
// cobertura de cada ciclo (meses lidos nos 12 meses até o mês do ciclo), índice sobre a média do ano e a
// variação sobre os anos anteriores. Só fala em sazonalidade se a regra de suficiência aprovada pelo PCP
// for cumprida; senão "histórico insuficiente" e nenhuma sazonalidade. Mês não lido nunca vira zero.
// Para o insumo, com data necessária e prazo do fornecedor (parâmetros de alerta), devolve a sugestão
// explicada de antecipar a compra (data necessária − prazo). Só sugestão: não cria requisição (isso é a
// SPEC-3-005) e não toca o baseline90-v1. Variação de consumo é "diferença", nunca "perda". Só leitura.
routerAdd(
  'GET',
  '/backend/v1/pcp/vendas/historico',
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
    const q = e.request.url.query()
    const produto = String(q.get('produto') || '')
      .trim()
      .toUpperCase()
    const hoje = new Date().toISOString().slice(0, 7)
    const periodo = /^\d{4}-\d{2}$/.test(String(q.get('periodo') || ''))
      ? String(q.get('periodo'))
      : hoje
    const dataNec = /^\d{4}-\d{2}-\d{2}$/.test(String(q.get('data_necessaria') || ''))
      ? String(q.get('data_necessaria'))
      : periodo + '-01'
    if (!produto) return e.json(422, { erro: 'dados_invalidos', motivos: ['informe o produto'] })

    let regra = null
    const lr = $app.findRecordsByFilter('pcp_regra_sazonalidade', '', '-versao', 1, 0)
    if (lr.length > 0) {
      regra = {
        versao: Number(lr[0].get('versao') || 0),
        aprovador: lr[0].getString('aprovador'),
        ciclosMinimos: Number(lr[0].get('ciclos_minimos') || 0),
        coberturaMinimaPct: Number(lr[0].get('cobertura_minima_pct') || 0),
      }
    }
    const lidos = {}
    for (const c of $app.findRecordsByFilter(
      'pcp_historico_vendas_cobertura',
      'completo = true',
      'periodo',
      5000,
      0,
    )) {
      lidos[c.getString('periodo')] = true
    }
    const serie = {}
    for (const r of $app.findRecordsByFilter(
      'pcp_historico_vendas_periodo',
      'produto = {:p}',
      'periodo',
      20000,
      0,
      { p: produto },
    )) {
      const per = r.getString('periodo')
      serie[per] = Math.round(((serie[per] || 0) + Number(r.get('quantidade') || 0)) * 1e6) / 1e6
    }
    const mesAnterior = (per, n) => {
      const a = Number(per.slice(0, 4))
      const m = Number(per.slice(5, 7))
      const t = a * 12 + (m - 1) - n
      return Math.floor(t / 12) + '-' + String((t % 12) + 1).padStart(2, '0')
    }
    const cobertura = (per) => {
      let n = 0
      for (let k = 0; k < 12; k++) if (lidos[mesAnterior(per, k)]) n++
      return Math.round((n / 12) * 10000) / 100
    }
    const anoRef = Number(periodo.slice(0, 4))
    const atualLido = !!lidos[periodo]
    const atual = { quantidade: atualLido ? serie[periodo] || 0 : null, lido: atualLido }
    const ciclos = []
    for (let k = 1; k <= 5; k++) {
      const per = String(anoRef - k) + periodo.slice(4)
      const lido = !!lidos[per]
      let indice = null
      if (lido) {
        const meses = []
        for (let j = 0; j < 12; j++) if (lidos[mesAnterior(per, j)]) meses.push(mesAnterior(per, j))
        let soma = 0
        for (const m of meses) soma += serie[m] || 0
        const media = soma / Math.max(1, meses.length)
        indice = media > 0 ? Math.round((((serie[per] || 0) - media) / media) * 10000) / 100 : null
      }
      ciclos.push({
        periodo: per,
        ano: anoRef - k,
        quantidade: lido ? serie[per] || 0 : null,
        cobertura_pct: cobertura(per),
        lido: lido,
        indice_sobre_media_pct: indice,
      })
    }
    const bons = regra
      ? ciclos.filter((c) => c.lido && c.cobertura_pct >= regra.coberturaMinimaPct)
      : []
    const suficiente = !!regra && regra.ciclosMinimos > 0 && bons.length >= regra.ciclosMinimos
    let mediaAnos = null
    if (bons.length > 0) {
      let s = 0
      for (const c of bons) s += c.quantidade || 0
      mediaAnos = s / bons.length
    }
    const variacao =
      suficiente && mediaAnos && mediaAnos > 0 && atual.quantidade !== null
        ? Math.round(((atual.quantidade - mediaAnos) / mediaAnos) * 10000) / 100
        : null
    const indices = bons.map((c) => c.indice_sobre_media_pct).filter((x) => x !== null)
    let saz = null
    if (suficiente && indices.length > 0) {
      let s = 0
      for (const x of indices) s += x
      saz = Math.round((s / indices.length) * 100) / 100
    }
    let mensagem = 'histórico suficiente (' + bons.length + ' ciclos)'
    if (!regra)
      mensagem = 'histórico insuficiente: a regra de suficiência ainda não foi aprovada pelo PCP'
    else if (!suficiente)
      mensagem =
        'histórico insuficiente: ' +
        bons.length +
        ' de ' +
        regra.ciclosMinimos +
        ' ciclos com cobertura de ' +
        regra.coberturaMinimaPct +
        '% ou mais'

    // prazo do fornecedor: parâmetro de alerta efetivo do produto (produto > família), sem padrão
    let prazo = null
    const lp = $app.findRecordsByFilter('pcp_parametros_alerta', '', '-versao', 1, 0)
    if (lp.length > 0) {
      try {
        const doc = JSON.parse(lp[0].getString('parametros') || '{}') || {}
        let fam = null
        try {
          fam = $app
            .findFirstRecordByFilter('pcp_familias', 'produto = {:p}', { p: produto })
            .getString('familia')
        } catch (_) {}
        const nm = (x) =>
          String(x || '')
            .trim()
            .toUpperCase()
        const dp = (doc.itens || []).find((i) => i.escopo === 'produto' && nm(i.chave) === produto)
        const df = fam
          ? (doc.itens || []).find((i) => i.escopo === 'familia' && nm(i.chave) === nm(fam))
          : null
        const v =
          dp && typeof dp.prazoFornecedorDias === 'number'
            ? dp.prazoFornecedorDias
            : df && typeof df.prazoFornecedorDias === 'number'
              ? df.prazoFornecedorDias
              : null
        prazo = v !== null && isFinite(v) && v >= 0 ? v : null
      } catch (_) {}
    }
    let antecipacao = { sugerir: false, data_sugerida_de_compra: null, texto: mensagem }
    if (suficiente && saz !== null) {
      if (saz <= 0) {
        antecipacao = {
          sugerir: false,
          data_sugerida_de_compra: null,
          texto:
            'nos anos anteriores este mês vendeu ' +
            Math.abs(saz) +
            '% abaixo da média do ano; não há o que antecipar',
        }
      } else {
        const base =
          'no mesmo mês dos anos anteriores as vendas ficaram ' + saz + '% acima da média do ano'
        if (prazo === null) {
          antecipacao = {
            sugerir: true,
            data_sugerida_de_compra: null,
            texto: base + '; sem o prazo do fornecedor cadastrado, não há data sugerida',
          }
        } else {
          const d = new Date(new Date(dataNec + 'T00:00:00Z').getTime() - prazo * 86400000)
            .toISOString()
            .slice(0, 10)
          antecipacao = {
            sugerir: true,
            data_sugerida_de_compra: d,
            texto:
              base +
              '; com prazo do fornecedor de ' +
              prazo +
              ' dias, considerar comprar até ' +
              d.split('-').reverse().join('/'),
          }
        }
      }
    }
    let meses_lidos = 0
    for (const k of Object.keys(lidos)) if (lidos[k]) meses_lidos++
    return e.json(200, {
      produto: produto,
      periodo_atual: periodo,
      atual: atual,
      ciclos: ciclos,
      variacao_sobre_anos_anteriores_pct: variacao,
      sazonalidade_pct: saz,
      suficiente: suficiente,
      mensagem: mensagem,
      regra: regra,
      prazo_fornecedor_dias: prazo,
      antecipacao: antecipacao,
      meses_lidos: meses_lidos,
      pode_editar_regra: (() => {
        try {
          return (
            (JSON.parse(perfil.getString('acoes') || '[]') || []).indexOf('editar_parametros') !==
            -1
          )
        } catch (_) {
          return false
        }
      })(),
    })
  },
  $apis.requireAuth(),
)
