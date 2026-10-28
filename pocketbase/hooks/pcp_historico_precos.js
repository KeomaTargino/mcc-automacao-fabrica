// pocketbase/hooks/pcp_historico_precos.js — SPEC-3-004 CA-3-12/13
// GET /backend/v1/pcp/compras/historico?item=CODIGO&de=AAAA-MM-DD&ate=AAAA-MM-DD
// Histórico DERIVADO do insumo, por fornecedor, na unidade de estoque (fator confirmado, SPEC-3-003).
// Sem item: só as contagens de monitoramento e a lista "a classificar". Exige consultar_compras E a
// área compras. Só leitura. Regras de src/lib/pcp/historico-precos.ts (duplicadas aqui porque hooks
// não importam módulos).
routerAdd(
  'GET',
  '/backend/v1/pcp/compras/historico',
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
      acoes.indexOf('consultar_compras') === -1 ||
      perfil.getStringSlice('areas').indexOf('compras') === -1
    ) {
      return e.forbiddenError('sem_permissao')
    }
    const q = e.requestInfo().query || {}
    const item = String(q.item || '')
      .trim()
      .toUpperCase()
    const de = String(q.de || '').trim()
    const ate = String(q.ate || '').trim()
    const norm = (c) =>
      String(c || '')
        .trim()
        .toUpperCase()
    const numOuNull = (v) => (v === null || v === undefined || v === '' ? null : Number(v))

    const regs = $app.findRecordsByFilter('pcp_precos_compra', '', 'pedido_id', 20000, 0)
    const linhas = regs.map((r) => ({
      aplicativo: r.getString('aplicativo'),
      pedido_id: r.getString('pedido_id'),
      linha_id: r.getString('linha_id'),
      produto_id: r.getString('produto_id'),
      fornecedor: r.getString('fornecedor') || null,
      unidade_compra: r.getString('unidade_compra') || null,
      quantidade: numOuNull(r.get('quantidade')),
      preco_unitario: numOuNull(r.get('preco_unitario')),
      valor_total: numOuNull(r.get('valor_total')),
      cancelado: r.getBool('cancelado'),
      data: r.getString('data') || null,
      classificacao: r.getString('classificacao_compras') || 'a_classificar',
      atualizado: r.getString('updated'),
    }))
    // O tipo do Omie ainda não classifica sozinho: os códigos de tipo não foram conferidos numa
    // amostra real (leitura bloqueada, CL-PEND-006). Vale a classificação de Compras.
    const precoDe = (l) => {
      const ok = (n) => n !== null && isFinite(n) && n > 0
      if (ok(l.preco_unitario)) return l.preco_unitario
      if (ok(l.valor_total) && ok(l.quantidade))
        return Math.round((l.valor_total / l.quantidade) * 1e6) / 1e6
      return null
    }
    const aClassificar = linhas.filter((l) => l.classificacao === 'a_classificar')
    let semPreco = 0
    let semFator = 0
    for (const l of linhas) if (l.classificacao === 'insumo' && precoDe(l) === null) semPreco++

    const resposta = {
      item: item || null,
      registros: [],
      resumo: { por_fornecedor: [], geral: null },
      documentos: [],
      unidade_estoque: null,
      a_classificar: aClassificar.slice(0, 200).map((l) => ({
        chave: l.aplicativo + '|' + l.pedido_id + '|' + l.linha_id,
        pedido_id: l.pedido_id,
        produto_id: l.produto_id,
        fornecedor: l.fornecedor,
        quantidade: l.quantidade,
        unidade_compra: l.unidade_compra,
        preco_unitario: precoDe(l),
      })),
      pendencias: { a_classificar: aClassificar.length, sem_preco: 0, sem_fator: 0 },
      ultima_atualizacao:
        linhas.reduce((m, l) => (l.atualizado > m ? l.atualizado : m), '') || null,
      pode_classificar: acoes.indexOf('editar_requisicao') !== -1,
    }

    if (item) {
      // unidade de estoque oficial do item (catálogo ativo)
      let unidadeEstoque = ''
      try {
        const fonte = $app.findFirstRecordByFilter(
          'pcp_fontes',
          "fonte = 'omie' && recurso = 'produtos' && aplicativo_ref = 'app1'",
          {},
        )
        const lote = fonte.getString('lote_ativo')
        if (lote) {
          const cat = $app.findRecordsByFilter('pcp_dados', 'lote = {:l}', 'id', 20000, 0, {
            l: lote,
          })
          for (const r of cat) {
            try {
              const c = JSON.parse(r.getString('conteudo') || '{}') || {}
              if (norm(c.codigo) === item) {
                unidadeEstoque = String(c.unidade || '').trim()
                break
              }
            } catch (_) {}
          }
        }
      } catch (_) {}
      resposta.unidade_estoque = unidadeEstoque || null

      const fatores = $app
        .findRecordsByFilter('pcp_conversoes', 'item = {:i}', '-versao', 500, 0, { i: item })
        .map((r) => ({
          fornecedor: r.getString('fornecedor') || null,
          apresentacao: r.getString('apresentacao'),
          unidade_compra: r.getString('unidade_compra'),
          fator: Number(r.get('fator') || 0),
          unidade_estoque: r.getString('unidade_estoque'),
          versao: Number(r.get('versao') || 0),
        }))
      const vigente = (forn, apr) => {
        let m = null
        for (const f of fatores) {
          if (
            f.fornecedor === forn &&
            f.apresentacao === apr &&
            (m === null || f.versao > m.versao)
          )
            m = f
        }
        return m
      }
      const fatorDaLinha = (l) => {
        if (l.unidade_compra && unidadeEstoque && norm(l.unidade_compra) === norm(unidadeEstoque)) {
          return { fator: 1, unidade: unidadeEstoque }
        }
        const apr = {}
        for (const f of fatores)
          if (f.unidade_compra === l.unidade_compra) apr[f.apresentacao] = true
        const vig = []
        for (const a of Object.keys(apr)) {
          const v = (l.fornecedor !== null ? vigente(l.fornecedor, a) : null) || vigente(null, a)
          if (v && v.unidade_estoque) vig.push(v)
        }
        const distintos = {}
        for (const v of vig) distintos[String(v.fator)] = true
        // várias apresentações com fatores diferentes: ambíguo, não escolhe sozinho
        if (vig.length === 0 || Object.keys(distintos).length !== 1) return null
        return { fator: vig[0].fator, unidade: vig[0].unidade_estoque }
      }

      const doItem = linhas.filter(
        (l) => norm(l.produto_id) === item && l.classificacao === 'insumo',
      )
      for (const l of doItem) {
        const preco = precoDe(l)
        const base = {
          chave: l.aplicativo + '|' + l.pedido_id + '|' + l.linha_id,
          pedido_id: l.pedido_id,
          linha_id: l.linha_id,
          fornecedor: l.fornecedor,
          data: l.data,
        }
        if (preco === null) {
          resposta.registros.push(
            Object.assign(base, {
              quantidade: l.quantidade,
              unidade: l.unidade_compra,
              preco: null,
              fator: null,
              estado: l.cancelado ? 'cancelado' : 'preco_pendente',
            }),
          )
          continue
        }
        const f = fatorDaLinha(l)
        if (f === null) {
          if (!l.cancelado) semFator++
          resposta.registros.push(
            Object.assign(base, {
              quantidade: l.quantidade,
              unidade: l.unidade_compra,
              preco: preco,
              fator: null,
              estado: l.cancelado ? 'cancelado' : 'sem_fator',
            }),
          )
          continue
        }
        resposta.registros.push(
          Object.assign(base, {
            quantidade:
              l.quantidade === null ? null : Math.round(l.quantidade * f.fator * 1e6) / 1e6,
            unidade: f.unidade,
            preco: Math.round((preco / f.fator) * 1e6) / 1e6,
            fator: f.fator,
            estado: l.cancelado ? 'cancelado' : 'comparavel',
          }),
        )
      }
      resposta.registros.sort((a, b) => String(b.data).localeCompare(String(a.data)))

      // resumo: só comparáveis (cancelado fora), dentro do período
      const dentro = resposta.registros.filter(
        (r) =>
          r.estado === 'comparavel' &&
          r.preco !== null &&
          (!de || (r.data && r.data >= de)) &&
          (!ate || (r.data && r.data <= ate)),
      )
      const agrupar = (rs) => {
        const precos = rs.map((r) => r.preco)
        const ord = rs.slice().sort((a, b) => String(a.data).localeCompare(String(b.data)))
        return {
          menor: Math.min.apply(null, precos),
          maior: Math.max.apply(null, precos),
          media: Math.round((precos.reduce((s, p) => s + p, 0) / precos.length) * 1e4) / 1e4,
          ultimo: ord[ord.length - 1].preco,
          registros: rs.length,
        }
      }
      const nomes = {}
      for (const r of dentro) nomes[String(r.fornecedor)] = r.fornecedor
      for (const k of Object.keys(nomes)) {
        resposta.resumo.por_fornecedor.push(
          Object.assign(
            { fornecedor: nomes[k] },
            agrupar(dentro.filter((r) => String(r.fornecedor) === k)),
          ),
        )
      }
      resposta.resumo.geral = dentro.length ? agrupar(dentro) : null

      // documentos dos pedidos do item: frete, serviço e N-D continuam visíveis, fora do histórico
      const pedidos = {}
      for (const l of doItem) pedidos[l.pedido_id] = true
      for (const l of linhas) {
        if (pedidos[l.pedido_id] && l.classificacao !== 'insumo') {
          resposta.documentos.push({
            pedido_id: l.pedido_id,
            linha_id: l.linha_id,
            produto_id: l.produto_id,
            classificacao: l.classificacao,
            quantidade: l.quantidade,
            unidade_compra: l.unidade_compra,
            preco_unitario: precoDe(l),
          })
        }
      }
    }
    resposta.pendencias.sem_preco = semPreco
    resposta.pendencias.sem_fator = semFator
    return e.json(200, resposta)
  },
  $apis.requireAuth(),
)
