// pocketbase/hooks/pcp_relatorios.js — SPEC-3-014 CA-3-39/40 (RN-01 a RN-05)
// GET /backend/v1/pcp/relatorios?bloco=producao|consumo|compras|pedidos&de=AAAA-MM-DD&ate=AAAA-MM-DD
// Relatório de UM bloco por chamada, só leitura. Cada bloco exige a sua área (producao/consumo:
// planejamento ou apontar_producao; compras: compras; pedidos: faturamento); sem ela a resposta é a mesma
// recusa 403 de quem não tem perfil (sem pistas). Todo bloco devolve período, fonte, hora da atualização,
// lacunas e "sem_dados" quando o período não tem registro (nunca zero). Unidades diferentes ficam em
// linhas separadas; intenção da Nuvemshop não entra no confirmado. Regras de src/lib/pcp/relatorios.ts.
// PRODUÇÃO e CONSUMO: não encontrei no banco coleção de apontamentos/ordens para ler (as telas de
// apontamento da fase 2 não gravam no servidor), então esses dois blocos respondem "fonte não ligada",
// sem inventar número. COMPRAS usa requisições aprovadas, cotações escolhidas e recebimentos do sistema
// (a ligação do recebimento ao pedido é pelo id da requisição); as entregas lidas do Omie ainda não
// foram carregadas (CL-PEND-006). PEDIDOS usa as linhas de preparação com origem já registrada.
routerAdd(
  'GET',
  '/backend/v1/pcp/relatorios',
  (e) => {
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Sessão ausente ou expirada.')
    let perfil = null
    try {
      perfil = $app.findFirstRecordByFilter('pcp_perfis', 'usuario = {:u}', { u: auth.id })
    } catch (_) {}
    const q = e.request.url.query()
    const bloco = String(q.get('bloco') || '')
    const AREAS = {
      producao: ['planejamento', 'apontar_producao'],
      consumo: ['planejamento', 'apontar_producao'],
      compras: ['compras'],
      pedidos: ['faturamento'],
    }
    const areas = perfil ? perfil.getStringSlice('areas') : []
    if (
      !perfil ||
      !perfil.getBool('ativo') ||
      !AREAS[bloco] ||
      !AREAS[bloco].some((a) => areas.indexOf(a) !== -1)
    ) {
      return e.forbiddenError('sem_permissao')
    }
    const iso = /^\d{4}-\d{2}-\d{2}$/
    const hoje = new Date().toISOString().slice(0, 10)
    const de = iso.test(String(q.get('de') || '')) ? String(q.get('de')) : hoje.slice(0, 8) + '01'
    const ate = iso.test(String(q.get('ate') || '')) ? String(q.get('ate')) : hoje
    if (de > ate)
      return e.json(422, { erro: 'dados_invalidos', motivos: ['o período está invertido'] })
    const produto = String(q.get('produto') || '')
      .trim()
      .toUpperCase()
    const rodape = (fonte, atualizado, lacunas, semDados) => ({
      periodo: { de: de, ate: ate },
      fonte: fonte,
      atualizado_em: atualizado,
      lacunas: lacunas,
      sem_dados: semDados,
    })
    const arred = (n, c) => Math.round(n * (c || 1e6)) / (c || 1e6)
    const norm = (c) =>
      String(c || '')
        .trim()
        .toUpperCase()

    if (bloco === 'producao' || bloco === 'consumo') {
      return e.json(200, {
        bloco: bloco,
        linhas: [],
        rodape: rodape(
          'apontamentos e ordens de produção',
          null,
          [
            'fonte não ligada: os apontamentos de produção e as ordens ainda não são guardados no servidor, então não há como somar planejado, produzido, conferido, consumo ou perdas do período',
          ],
          true,
        ),
      })
    }

    if (bloco === 'compras') {
      const reqs = $app.findRecordsByFilter(
        'pcp_requisicoes',
        "estado = 'aprovada' && data_necessaria >= {:d} && data_necessaria <= {:a}",
        'data_necessaria',
        5000,
        0,
        { d: de, a: ate },
      )
      const recebimentos = $app.findRecordsByFilter('pcp_recebimentos', '', 'data', 5000, 0)
      const recebido = {}
      const dataRec = {}
      for (const r of recebimentos) {
        let linhas = []
        try {
          linhas = JSON.parse(r.getString('linhas') || '[]') || []
        } catch (_) {}
        for (const l of linhas) {
          for (const lig of l.ligacoes || []) {
            const k = lig.pedidoId + '|' + norm(l.item)
            recebido[k] = arred((recebido[k] || 0) + Number(lig.quantidade || 0))
            const d = r.getString('data')
            if (!dataRec[k] || d > dataRec[k]) dataRec[k] = d
          }
        }
      }
      const linhas = []
      let atualizado = null
      for (const req of reqs) {
        let itens = []
        try {
          itens = JSON.parse(req.getString('itens') || '[]') || []
        } catch (_) {}
        const cots = $app.findRecordsByFilter(
          'pcp_cotacoes',
          'requisicao = {:r} && escolhida = true',
          'created',
          500,
          0,
          { r: req.id },
        )
        for (const it of itens) {
          if (produto && norm(it.item) !== produto) continue
          const k = req.id + '|' + norm(it.item)
          const c = cots.find((x) => norm(x.getString('item')) === norm(it.item))
          const preco =
            c && Number(c.get('preco_estoque')) > 0 ? Number(c.get('preco_estoque')) : null
          linhas.push({
            fornecedor: req.getString('fornecedor'),
            item: norm(it.item),
            unidade: norm(it.unidadeEstoque),
            comprado: Number(it.quantidadeEstoque),
            recebido: recebido[k] || 0,
            dataNecessaria: req.getString('data_necessaria'),
            dataRecebimento: dataRec[k] || null,
            preco: preco,
          })
        }
        if (!atualizado || req.getString('updated') > atualizado)
          atualizado = req.getString('updated')
      }
      const un = {}
      const pm = {}
      let comRec = 0
      let noPrazo = 0
      let semPreco = 0
      for (const l of linhas) {
        const u =
          un[l.unidade] || (un[l.unidade] = { unidade: l.unidade, comprado: 0, recebido: 0 })
        u.comprado = arred(u.comprado + l.comprado)
        u.recebido = arred(u.recebido + l.recebido)
        if (l.dataRecebimento && l.dataNecessaria) {
          comRec++
          if (l.dataRecebimento <= l.dataNecessaria) noPrazo++
        }
        if (l.preco === null || !(l.comprado > 0)) {
          semPreco++
          continue
        }
        const k = l.fornecedor + '|' + l.unidade
        const p =
          pm[k] || (pm[k] = { fornecedor: l.fornecedor, unidade: l.unidade, valor: 0, qtd: 0 })
        p.valor += l.preco * l.comprado
        p.qtd += l.comprado
      }
      const lacunas = [
        'entregas lidas do Omie ainda não carregadas (CL-PEND-006): a conta de entregas no prazo usa só os recebimentos registrados aqui',
      ]
      if (semPreco > 0) lacunas.push(semPreco + ' linhas sem preço ficaram fora do preço médio')
      return e.json(200, {
        bloco: bloco,
        por_unidade: Object.keys(un).map((k) => un[k]),
        entregas: {
          com_recebimento: comRec,
          no_prazo: noPrazo,
          atrasadas: comRec - noPrazo,
          pct_no_prazo: comRec > 0 ? arred((noPrazo / comRec) * 100, 100) : null,
        },
        preco_medio: Object.keys(pm).map((k) => ({
          fornecedor: pm[k].fornecedor,
          unidade: pm[k].unidade,
          preco_medio: arred(pm[k].valor / pm[k].qtd, 1e4),
          quantidade_base: arred(pm[k].qtd),
        })),
        rodape: rodape(
          'requisições aprovadas, cotações escolhidas e recebimentos do sistema',
          atualizado,
          lacunas,
          linhas.length === 0,
        ),
      })
    }

    // pedidos
    const prep = $app.findRecordsByFilter(
      'pcp_preparacao_pedido',
      "origem != '' && created >= {:d} && created <= {:a}",
      'created',
      20000,
      0,
      { d: de + ' 00:00:00.000Z', a: ate + ' 23:59:59.999Z' },
    )
    const grupos = {}
    let intencoes = 0
    const horas = []
    let atualizado = null
    for (const p of prep) {
      if (p.getString('situacao_canal') === 'intencao') {
        intencoes++
        continue
      }
      const liberado = p.getString('liberacao_hash') !== ''
      const estado = liberado
        ? 'liberado'
        : p.getString('estado_fila') === 'apto'
          ? 'apto'
          : 'bloqueado'
      const k = p.getString('origem') + '|' + (p.getString('unidade') || 'sem unidade')
      const g =
        grupos[k] ||
        (grupos[k] = {
          origem: p.getString('origem'),
          unidade: p.getString('unidade') || 'sem unidade',
          total: 0,
          aptos: 0,
          bloqueados: 0,
          liberados: 0,
        })
      g.total++
      if (estado === 'apto') g.aptos++
      else if (estado === 'bloqueado') g.bloqueados++
      else g.liberados++
      if (liberado && p.getString('liberado_em'))
        horas.push(
          (new Date(p.getString('liberado_em')).getTime() -
            new Date(p.getString('created')).getTime()) /
            3600000,
        )
      if (!atualizado || p.getString('updated') > atualizado) atualizado = p.getString('updated')
    }
    let soma = 0
    for (const h of horas) soma += h
    return e.json(200, {
      bloco: bloco,
      confirmados: Object.keys(grupos).map((k) => grupos[k]),
      intencoes: intencoes,
      horas_ate_liberar: {
        media: horas.length > 0 ? arred(soma / horas.length, 100) : null,
        pedidos: horas.length,
      },
      rodape: rodape(
        'linhas de preparação do faturamento (frete, volumes, liberação)',
        atualizado,
        [
          'só entram pedidos que já tiveram frete, volumes ou liberação registrados; pedidos do Omie ainda sem preparação não aparecem aqui',
          'a intenção da Nuvemshop aparece só como contagem e não soma ao confirmado',
        ],
        prep.length === 0,
      ),
    })
  },
  $apis.requireAuth(),
)
