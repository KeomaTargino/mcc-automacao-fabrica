// pocketbase/hooks/pcp_recebimento_registrar.js — SPEC-3-007 CA-3-19 e CA-3-21 (RN-01 a RN-04)
// POST /backend/v1/pcp/compras/recebimento { chave, fornecedor, data, linhas: [{ item, quantidade_estoque |
//   (quantidade_compra, apresentacao, unidade_compra), ligacoes: [{ pedido_id, quantidade }] }] }
// O almoxarifado registra o que chegou e LIGA cada linha a um ou mais pedidos aprovados. Exige
// conferir_recebimento E a área recebimento. A soma das ligações precisa bater com a linha (422);
// pedido que não é aprovado/ligado/do fornecedor/com o item, ou linha sem pedido, é bloqueado
// (exceção autorizada com motivo libera); item fora do catálogo real só entra por exceção e fica
// pendente. Repetir a mesma chave devolve o mesmo recebimento. NADA ajusta estoque, classifica nota,
// lança no financeiro ou grava no Omie. Regras de src/lib/pcp/recebimento.ts.
routerAdd(
  'POST',
  '/backend/v1/pcp/compras/recebimento',
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
      acoes.indexOf('conferir_recebimento') === -1 ||
      perfil.getStringSlice('areas').indexOf('recebimento') === -1
    ) {
      return e.forbiddenError('sem_permissao')
    }
    const norm = (c) =>
      String(c || '')
        .trim()
        .toUpperCase()
    const arred = (n) => Math.round(n * 1e6) / 1e6
    const EPS = 1e-6
    const body = e.requestInfo().body || {}
    const chave = String(body.chave || '').trim()
    const fornecedor = String(body.fornecedor || '').trim()
    const data = String(body.data || '').trim()
    const linhasIn = Array.isArray(body.linhas) ? body.linhas : []
    const motivos = []
    if (!chave) motivos.push('identificação do recebimento obrigatória')
    if (!fornecedor) motivos.push('fornecedor obrigatório')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) motivos.push('data da chegada inválida')
    if (linhasIn.length === 0) motivos.push('nenhuma linha recebida')
    if (motivos.length > 0) return e.json(422, { erro: 'dados_invalidos', motivos: motivos })

    try {
      const ja = $app.findFirstRecordByFilter('pcp_recebimentos', 'chave = {:c}', { c: chave })
      return e.json(200, { ok: true, criado: false, chave: ja.getString('chave') })
    } catch (_) {}

    // catálogo real: código → unidade
    const catalogo = {}
    let catalogoLido = false
    try {
      const fonte = $app.findFirstRecordByFilter(
        'pcp_fontes',
        "fonte = 'omie' && recurso = 'produtos' && aplicativo_ref = 'app1'",
        {},
      )
      const lote = fonte.getString('lote_ativo')
      if (lote) {
        catalogoLido = true
        const cat = $app.findRecordsByFilter('pcp_dados', 'lote = {:l}', 'id', 20000, 0, {
          l: lote,
        })
        for (const r of cat) {
          try {
            const c = JSON.parse(r.getString('conteudo') || '{}') || {}
            if (c.codigo) catalogo[norm(c.codigo)] = String(c.unidade || '').trim()
          } catch (_) {}
        }
      }
    } catch (_) {}
    if (!catalogoLido) {
      return e.json(423, {
        erro: 'catalogo_indisponivel',
        motivo: 'não foi possível conferir o cadastro do Omie agora; tente de novo mais tarde',
      })
    }

    // pedidos aprovados e ligados, deste fornecedor
    const pedidos = {}
    const aprovadas = $app.findRecordsByFilter(
      'pcp_requisicoes',
      "estado = 'aprovada'",
      '-created',
      2000,
      0,
    )
    for (const r of aprovadas) {
      let v = null
      try {
        v = $app.findFirstRecordByFilter(
          'pcp_pedidos_compra_vinculo',
          "requisicao = {:r} && estado = 'ligado'",
          { r: r.id },
        )
      } catch (_) {}
      if (!v) continue
      let itens = []
      try {
        itens = JSON.parse(r.getString('itens') || '[]') || []
      } catch (_) {}
      pedidos[v.getString('numero_omie') || r.id] = {
        fornecedor: r.getString('fornecedor'),
        itens: itens,
      }
    }

    const abertas = $app
      .findRecordsByFilter(
        'pcp_excecoes_compra',
        "documento = 'recebimento' && documento_id = {:d} && estado = 'aberta'",
        'created',
        200,
        0,
        { d: chave },
      )
      .map((x) => norm(x.getString('item')))

    const registradas = []
    const invalidos = []
    const semCadastro = []
    const semPedido = []
    const soma = []
    for (const l of linhasIn) {
      const item = norm(l.item)
      let q =
        l.quantidade_estoque === undefined ||
        l.quantidade_estoque === null ||
        l.quantidade_estoque === ''
          ? undefined
          : Number(l.quantidade_estoque)
      let fator = null
      const pend = []
      if (
        q === undefined &&
        l.quantidade_compra !== undefined &&
        l.quantidade_compra !== null &&
        l.quantidade_compra !== ''
      ) {
        const apr = String(l.apresentacao || '').trim()
        const uc = String(l.unidade_compra || '').trim()
        let achado = null
        const lista = $app.findRecordsByFilter(
          'pcp_conversoes',
          'item = {:i} && apresentacao = {:a}',
          '-versao',
          20,
          0,
          { i: item, a: apr },
        )
        for (const c of lista) {
          if (
            c.getString('unidade_compra') === uc &&
            c.getString('unidade_estoque') &&
            (c.getString('fornecedor') === fornecedor || c.getString('fornecedor') === '')
          ) {
            if (
              !achado ||
              (c.getString('fornecedor') === fornecedor &&
                achado.getString('fornecedor') !== fornecedor)
            )
              achado = c
          }
        }
        if (!achado) {
          invalidos.push(
            item + ': sem fator confirmado; informe a quantidade na unidade de estoque',
          )
          continue
        }
        fator = Number(achado.get('fator'))
        q = arred(Number(l.quantidade_compra) * fator)
      }
      if (q === undefined || !isFinite(q) || q <= 0) {
        invalidos.push(item + ': quantidade precisa ser maior que zero')
        continue
      }
      const noCatalogo = catalogo[item] !== undefined
      let porExcecao = false
      if (!noCatalogo) {
        if (abertas.indexOf(item) === -1) {
          semCadastro.push(item + ': cadastrar no Omie antes de comprar')
          continue
        }
        porExcecao = true
        pend.push(
          'item fora do catálogo: exceção autorizada, pendente de cadastro no Omie e ligação ao pedido',
        )
      }
      const ligs = (Array.isArray(l.ligacoes) ? l.ligacoes : [])
        .map((g) => ({ pedidoId: String(g.pedido_id || ''), quantidade: Number(g.quantidade) }))
        .filter((g) => g.quantidade > 0)
      let ruim = false
      for (const g of ligs) {
        const p = pedidos[g.pedidoId]
        if (
          !p ||
          norm(p.fornecedor) !== norm(fornecedor) ||
          !p.itens.some((x) => norm(x.item) === item)
        ) {
          semPedido.push(
            item +
              ': pedido ' +
              g.pedidoId +
              ' não é um pedido aprovado deste fornecedor com este item',
          )
          ruim = true
        }
      }
      if (ruim) continue
      if (ligs.length === 0) {
        if (abertas.indexOf(item) === -1) {
          semPedido.push(
            item + ': sem pedido aprovado; só entra como exceção autorizada com motivo',
          )
          continue
        }
        porExcecao = true
        pend.push('item não pedido: exceção autorizada')
      } else {
        const s = ligs.reduce((t, g) => t + g.quantidade, 0)
        if (Math.abs(s - q) > EPS) {
          soma.push(item + ': a soma das ligações (' + arred(s) + ') difere da linha (' + q + ')')
          continue
        }
      }
      registradas.push({
        item: item,
        quantidadeEstoque: arred(q),
        unidadeEstoque: catalogo[item] || null,
        fatorUsado: fator,
        ligacoes: ligs,
        porExcecao: porExcecao,
        pendencias: pend,
      })
    }
    if (invalidos.length) return e.json(422, { erro: 'dados_invalidos', motivos: invalidos })
    if (semCadastro.length) return e.json(422, { erro: 'item_sem_cadastro', motivos: semCadastro })
    if (semPedido.length) return e.json(422, { erro: 'sem_pedido_aprovado', motivos: semPedido })
    if (soma.length) return e.json(422, { erro: 'soma_diferente', motivos: soma })

    // diferenças: tudo o que já foi recebido contra cada pedido, somado com este recebimento
    const recebido = {}
    const anteriores = $app.findRecordsByFilter('pcp_recebimentos', '', 'created', 5000, 0)
    const soma1 = (linhas) => {
      for (const l of linhas) {
        for (const g of l.ligacoes || []) {
          const k = g.pedidoId + '|' + norm(l.item)
          recebido[k] = arred((recebido[k] || 0) + g.quantidade)
        }
      }
    }
    for (const r of anteriores) {
      try {
        soma1(JSON.parse(r.getString('linhas') || '[]') || [])
      } catch (_) {}
    }
    soma1(registradas)
    const tocados = {}
    for (const l of registradas) for (const g of l.ligacoes) tocados[g.pedidoId] = true
    const diferencas = []
    for (const pid of Object.keys(tocados)) {
      for (const it of pedidos[pid].itens) {
        const rec = recebido[pid + '|' + norm(it.item)]
        if (rec === undefined) continue
        const dif = arred(rec - it.quantidadeEstoque)
        if (Math.abs(dif) > EPS) {
          diferencas.push({
            pedidoId: pid,
            item: norm(it.item),
            pedido: it.quantidadeEstoque,
            recebido: rec,
            tipo: dif < 0 ? 'falta' : 'sobra',
            diferenca: Math.abs(dif),
          })
        }
      }
    }
    // compra já paga antes: aviso, nunca conta a pagar nem parcela
    const avisos = []
    for (const pid of Object.keys(tocados)) {
      const ps = $app.findRecordsByFilter(
        'pcp_parcelas_compra',
        'pedido = {:p}',
        'numero',
        200,
        0,
        { p: pid },
      )
      if (ps.length > 0 && ps.every((p) => p.getBool('pago_antecipado'))) {
        avisos.push('pedido ' + pid + ' — já paga: não lançar nova conta a pagar')
      }
    }
    try {
      const rec = new Record($app.findCollectionByNameOrId('pcp_recebimentos'))
      rec.set('chave', chave)
      rec.set('fornecedor', fornecedor)
      rec.set('data', data)
      rec.set('linhas', JSON.stringify(registradas))
      rec.set('diferencas', JSON.stringify(diferencas))
      rec.set('avisos_ja_paga', JSON.stringify(avisos))
      rec.set('registrado_por', auth.getString('email') || auth.id)
      rec.set('registrado_em', new Date().toISOString())
      $app.save(rec)
    } catch (_) {
      return e.json(409, {
        erro: 'conflito',
        motivo: 'outro registro com a mesma identificação chegou ao mesmo tempo; recarregue',
      })
    }
    return e.json(200, {
      ok: true,
      criado: true,
      chave: chave,
      diferencas: diferencas,
      avisos_ja_paga: avisos,
    })
  },
  $apis.requireAuth(),
)
