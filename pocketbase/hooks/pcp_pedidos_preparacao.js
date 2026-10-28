// pocketbase/hooks/pcp_pedidos_preparacao.js — SPEC-3-008 CA-3-25 (RN-02 a RN-05)
// GET /backend/v1/pcp/faturamento/pedidos — cada pedido do lote ativo do Omie com a unidade, a tabela
// de preço vigente, o subtotal RECALCULADO ao lado do subtotal do pedido e a origem. Só leitura; nada é
// trocado no pedido, no preço ou no cliente. Exige consultar_faturamento E a área faturamento.
// Campos do pedido do Omie que esta rota lê e que ainda NÃO foram conferidos numa amostra real
// (chave bloqueada, CL-PEND-006): cabecalho.codigo_cliente, det[].produto.valor_unitario,
// total_pedido.valor_total_pedido. Campo ausente vira "pendente" (null), nunca zero nem palpite; sem
// codigo_cliente o pedido fica "Unidade não cadastrada". Origem: pedido sem referência de integração é
// Omie; com referência igual a um pedido da Nuvemshop do lote é Nuvemshop; o marcador do Lunet ainda
// não foi identificado (pendência) e nada é ligado por cliente e valor. Regras de src/lib/pcp/unidades.ts.
routerAdd(
  'GET',
  '/backend/v1/pcp/faturamento/pedidos',
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
      acoes.indexOf('consultar_faturamento') === -1 ||
      perfil.getStringSlice('areas').indexOf('faturamento') === -1
    ) {
      return e.forbiddenError('sem_permissao')
    }
    const lote = (fonteNome) => {
      try {
        const f = $app.findFirstRecordByFilter(
          'pcp_fontes',
          "fonte = {:f} && recurso = 'pedidos' && aplicativo_ref = 'app1'",
          { f: fonteNome },
        )
        return { id: f.getString('lote_ativo'), ultimo: f.getString('ultimo_sucesso') || null }
      } catch (_) {
        return { id: '', ultimo: null }
      }
    }
    const omie = lote('omie')
    if (!omie.id) {
      return e.json(200, {
        disponivel: false,
        motivo:
          'pedidos do Omie ainda sem leitura ativa; a lista aparece quando a leitura estiver liberada',
      })
    }
    // pedidos da Nuvemshop do lote: id e número → pago?
    const nuvem = {}
    const nl = lote('nuvemshop')
    if (nl.id) {
      for (const r of $app.findRecordsByFilter('pcp_dados', 'lote = {:l}', 'id', 10000, 0, {
        l: nl.id,
      })) {
        try {
          const it = JSON.parse(r.getString('conteudo') || '{}') || {}
          const pago = String(it.pagamento || '').toLowerCase() === 'paid'
          if (it.pedido_id) nuvem[String(it.pedido_id)] = pago
          if (it.numero) nuvem[String(it.numero)] = pago
        } catch (_) {}
      }
    }
    // unidades vigentes e tabela
    const maior = {}
    const un = {}
    for (const r of $app.findRecordsByFilter('pcp_unidades', '', '-versao', 20000, 0)) {
      const c = r.getString('cliente_omie')
      const v = Number(r.get('versao') || 0)
      if (!maior[c] || v > maior[c]) {
        maior[c] = v
        un[c] = {
          unidade: r.getString('unidade'),
          nome: r.getString('nome_fantasia_operacional'),
          ativo: r.getBool('ativo'),
        }
      }
    }
    const tabela = $app
      .findRecordsByFilter('pcp_tabelas_preco', '', 'chave', 20000, 0)
      .map((r) => ({
        chave: r.getString('chave'),
        item: r.getString('item'),
        preco: Number(r.get('preco') || 0),
        vig: r.getString('vigencia_inicio'),
        versao: Number(r.get('versao') || 0),
      }))
    const precoVig = (chave, item, data) => {
      const pega = (c) => {
        let m = null
        for (const p of tabela) {
          if (
            p.chave === c &&
            p.item === item &&
            p.vig <= data &&
            (m === null || p.vig > m.vig || (p.vig === m.vig && p.versao > m.versao))
          )
            m = p
        }
        return m
      }
      return pega(chave) || pega('*')
    }
    const num = (v) =>
      v === null || v === undefined || v === '' || !isFinite(Number(v)) ? null : Number(v)
    const dataIso = (v) => {
      const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(v || ''))
      return m ? m[3] + '-' + m[2] + '-' + m[1] : new Date().toISOString().slice(0, 10)
    }
    const pedidos = []
    let semUnidade = 0
    let aRevisar = 0
    const regs = $app.findRecordsByFilter('pcp_dados', 'lote = {:l}', '-id', 300, 0, { l: omie.id })
    for (const r of regs) {
      let it = {}
      try {
        it = JSON.parse(r.getString('conteudo') || '{}') || {}
      } catch (_) {
        continue
      }
      const cab = it.cabecalho || {}
      const pedidoId = String(cab.codigo_pedido || '')
      if (!pedidoId) continue
      const cliente =
        cab.codigo_cliente === undefined || cab.codigo_cliente === null
          ? ''
          : String(cab.codigo_cliente)
      const data = dataIso(cab.data_previsao || (it.infoCadastro || {}).dInc)
      const ref = String(cab.codigo_pedido_integracao || '').trim()
      let origem = 'omie'
      let situacao = null
      if (ref) {
        if (nuvem[ref] !== undefined) {
          origem = 'nuvemshop'
          situacao = nuvem[ref] ? 'confirmado' : 'intencao'
        } else {
          origem = 'a_confirmar'
        }
      }
      const u = cliente ? un[cliente] : null
      const itens = []
      const semPreco = []
      let total = 0
      for (const d of it.det || []) {
        const p = d.produto || {}
        const cod = String(p.codigo || p.codigo_produto || '').toUpperCase()
        const q = num(p.quantidade)
        if (!cod || q === null) continue
        const pt = u ? precoVig(cliente, cod, data) : null
        const precoPedido = num(p.valor_unitario)
        if (!pt) semPreco.push(cod)
        else total += q * pt.preco
        itens.push({
          item: cod,
          quantidade: q,
          preco_pedido: precoPedido,
          preco_tabela: pt ? pt.preco : null,
          diferente_da_tabela:
            !!pt && precoPedido !== null && Math.abs(precoPedido - pt.preco) > 0.005,
          sem_preco: !pt,
        })
      }
      const recal =
        u && itens.length > 0 && semPreco.length === 0 ? Math.round(total * 100) / 100 : null
      const subPedido = num((it.total_pedido || {}).valor_total_pedido)
      const motivos = []
      if (!u || !u.ativo) {
        motivos.push('Unidade não cadastrada')
        semUnidade++
      }
      if (origem === 'a_confirmar') motivos.push('Origem a confirmar')
      if (situacao === 'intencao') motivos.push('Pedido ainda não pago (intenção)')
      pedidos.push({
        pedido_id: pedidoId,
        cliente_omie: cliente || null,
        unidade: u ? u.unidade : null,
        nome_fantasia_operacional: u ? u.nome : null,
        data: data,
        origem: origem,
        situacao_canal: situacao,
        apto_para_preparar: motivos.length === 0,
        motivos: motivos,
        itens: itens,
        subtotal_recalculado: recal,
        subtotal_pedido: subPedido,
        diferenca:
          recal !== null && subPedido !== null ? Math.round((subPedido - recal) * 100) / 100 : null,
        subtotal_pendente: semPreco,
      })
    }
    for (const n of $app.findRecordsByFilter(
      'pcp_nomes_canal',
      "estado = 'a_revisar'",
      'created',
      5000,
      0,
    ))
      aRevisar++
    return e.json(200, {
      disponivel: true,
      ultimo_sucesso: omie.ultimo,
      pedidos: pedidos,
      totais: { pedidos: pedidos.length, sem_unidade: semUnidade, nomes_a_revisar: aRevisar },
      aviso:
        'campos do pedido ainda não conferidos numa amostra real; campo ausente aparece como pendente. Marcador do Lunet ainda não identificado.',
    })
  },
  $apis.requireAuth(),
)
