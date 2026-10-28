// pocketbase/hooks/pcp_cotacao_registrar.js — SPEC-3-005 CA-3-15
// POST /backend/v1/pcp/compras/cotacao { requisicao, item, preco, prazo_dias, condicao_pagamento, validade }
// Registra uma cotação de um item (preço por UNIDADE DE COMPRA). Converte para a unidade de estoque só
// com o fator confirmado da requisição; sem fator o preço fica fora da comparação. Guarda o último preço
// do histórico (SPEC-3-004) para a tela mostrar a diferença. Exige editar_requisicao E a área compras;
// só em requisição em rascunho ou em cotação. Regras de src/lib/pcp/requisicao.ts.
routerAdd(
  'POST',
  '/backend/v1/pcp/compras/cotacao',
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
      acoes.indexOf('editar_requisicao') === -1 ||
      perfil.getStringSlice('areas').indexOf('compras') === -1
    ) {
      return e.forbiddenError('sem_permissao')
    }
    const body = e.requestInfo().body || {}
    let req = null
    try {
      req = $app.findRecordById('pcp_requisicoes', String(body.requisicao || ''))
    } catch (_) {}
    if (!req)
      return e.json(422, { erro: 'dados_invalidos', motivos: ['requisição não encontrada'] })
    const estado = req.getString('estado')
    if (estado !== 'rascunho' && estado !== 'em_cotacao')
      return e.json(409, { erro: 'estado_nao_permite' })
    let itens = []
    try {
      itens = JSON.parse(req.getString('itens') || '[]') || []
    } catch (_) {
      itens = []
    }
    const item = String(body.item || '')
      .trim()
      .toUpperCase()
    const it = itens.find((i) => i.item === item)
    const preco = Number(body.preco)
    const prazo = Number(body.prazo_dias)
    const motivos = []
    if (!it) motivos.push('item não está na requisição')
    if (!isFinite(preco) || preco <= 0) motivos.push('preço precisa ser maior que zero')
    if (!Number.isInteger(prazo) || prazo < 0 || prazo > 365)
      motivos.push('prazo de entrega: inteiro de 0 a 365 dias')
    if (motivos.length > 0 || !it) return e.json(422, { erro: 'dados_invalidos', motivos: motivos })

    const unidadeCompra = it.unidadeCompra || it.unidadeEstoque
    let precoEstoque = null
    if (it.fatorUsado && it.unidadeCompra) {
      precoEstoque = Math.round((preco / it.fatorUsado) * 1e6) / 1e6
    } else if (unidadeCompra === it.unidadeEstoque) {
      precoEstoque = preco
    }

    // último preço comparável do histórico, na unidade de estoque (cancelado fora)
    let ultimo = null
    const hist = $app.findRecordsByFilter(
      'pcp_precos_compra',
      "produto_id = {:p} && classificacao_compras = 'insumo' && cancelado = false",
      '-data',
      200,
      0,
      { p: item },
    )
    for (const h of hist) {
      const unitario = h.get('preco_unitario')
      const total = h.get('valor_total')
      const qtd = h.get('quantidade')
      let p = null
      if (unitario !== null && unitario !== '' && Number(unitario) > 0) p = Number(unitario)
      else if (total && qtd && Number(total) > 0 && Number(qtd) > 0) p = Number(total) / Number(qtd)
      if (p === null) continue
      const uc = h.getString('unidade_compra')
      let f = null
      if (uc && uc.toUpperCase() === String(it.unidadeEstoque).toUpperCase()) f = 1
      else if (uc && it.fatorUsado && uc === it.unidadeCompra) f = it.fatorUsado
      if (f === null) continue
      ultimo = Math.round((p / f) * 1e6) / 1e6
      break
    }

    const col = $app.findCollectionByNameOrId('pcp_cotacoes')
    const c = new Record(col)
    c.set('requisicao', req.id)
    c.set('item', item)
    c.set('fornecedor', req.getString('fornecedor'))
    c.set('preco_compra', preco)
    c.set('unidade_compra', unidadeCompra)
    if (precoEstoque !== null) c.set('preco_estoque', precoEstoque)
    if (ultimo !== null) c.set('ultimo_preco', ultimo)
    c.set('prazo_dias', prazo)
    c.set('condicao_pagamento', String(body.condicao_pagamento || '').trim())
    c.set('validade', String(body.validade || '').trim())
    c.set('escolhida', false)
    $app.save(c)
    if (estado === 'rascunho') {
      req.set('estado', 'em_cotacao')
      req.set('versao', Number(req.get('versao') || 1) + 1)
      $app.save(req)
    }
    return e.json(200, { ok: true, id: c.id, preco_estoque: precoEstoque, ultimo_preco: ultimo })
  },
  $apis.requireAuth(),
)
