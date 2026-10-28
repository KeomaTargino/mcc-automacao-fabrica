// pocketbase/hooks/pcp_pedido_ligar.js — SPEC-3-006 CA-3-18 (RN-02, RN-03)
// POST /backend/v1/pcp/compras/pedido/ligar { requisicao, numero }
// Ligação MANUAL: o comprador lançou o pedido à mão no Omie e informa o número. O servidor confere na
// leitura do Omie (pcp_entregas_compra): o pedido precisa existir lá, ser do mesmo fornecedor e ter os
// mesmos itens da compra; nunca liga só por valor. Só compra aprovada (aprovação válida, conteúdo igual
// ao aprovado). Exige editar_requisicao E a área compras. Não grava no Omie.
routerAdd(
  'POST',
  '/backend/v1/pcp/compras/pedido/ligar',
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
    const numero = String(body.numero || '').trim()
    let req = null
    try {
      req = $app.findRecordById('pcp_requisicoes', String(body.requisicao || ''))
    } catch (_) {}
    if (!req) return e.json(422, { erro: 'requisicao_inexistente' })

    // compra aprovada e ainda igual ao aprovado
    let itens = []
    try {
      itens = JSON.parse(req.getString('itens') || '[]') || []
    } catch (_) {
      itens = []
    }
    const cots = $app.findRecordsByFilter(
      'pcp_cotacoes',
      'requisicao = {:r} && escolhida = true',
      'created',
      500,
      0,
      { r: req.id },
    )
    const escolhidas = []
    for (const it of itens) {
      const c = cots.find((x) => x.getString('item') === it.item)
      if (c) {
        escolhidas.push({
          item: c.getString('item'),
          p: Number(c.get('preco_compra') || 0),
          u: c.getString('unidade_compra'),
          prazo: Number(c.get('prazo_dias') || 0),
        })
      }
    }
    const ordena = (a, b) => (a.item < b.item ? -1 : 1)
    const hashAtual = JSON.stringify({
      fornecedor: req.getString('fornecedor'),
      data: req.getString('data_necessaria'),
      emergencial: req.getBool('emergencial'),
      itens: itens
        .map((i) => ({
          item: i.item,
          q: i.quantidadeEstoque,
          qc: i.quantidadeCompra,
          f: i.fatorUsado,
        }))
        .sort(ordena),
      cotacoes: escolhidas.sort(ordena),
    })
    let aprovada = false
    if (req.getString('estado') === 'aprovada') {
      const apr = $app.findRecordsByFilter(
        'pcp_aprovacoes_compra',
        "requisicao = {:r} && valida = true && decisao = 'aprovada'",
        '-created',
        1,
        0,
        { r: req.id },
      )
      aprovada = apr.length > 0 && apr[0].getString('hash') === hashAtual
    }
    if (!aprovada) return e.json(409, { erro: 'compra_nao_aprovada' })

    try {
      $app.findFirstRecordByFilter('pcp_pedidos_compra_vinculo', 'requisicao = {:r}', { r: req.id })
      return e.json(409, { erro: 'ja_ligada' })
    } catch (_) {}
    if (numero) {
      try {
        $app.findFirstRecordByFilter('pcp_pedidos_compra_vinculo', 'numero_omie = {:n}', {
          n: numero,
        })
        return e.json(409, { erro: 'pedido_ja_ligado' })
      } catch (_) {}
    }

    const linhas = numero
      ? $app.findRecordsByFilter('pcp_entregas_compra', 'numero = {:n}', 'created', 500, 0, {
          n: numero,
        })
      : []
    if (linhas.length === 0) {
      return e.json(422, {
        erro: 'pedido_nao_lido',
        motivo:
          'o pedido ainda não aparece na leitura do Omie; confira o número ou aguarde a próxima leitura',
      })
    }
    const norm = (c) =>
      String(c || '')
        .trim()
        .toUpperCase()
    const diferencas = []
    const fornPedido = linhas[0].getString('fornecedor')
    if (norm(fornPedido) !== norm(req.getString('fornecedor'))) {
      diferencas.push(
        'fornecedor: a compra é de ' +
          req.getString('fornecedor') +
          ' e o pedido é de ' +
          fornPedido,
      )
    }
    const dela = {}
    for (const i of itens) dela[norm(i.item)] = true
    const dele = {}
    for (const l of linhas) dele[norm(l.getString('produto_id'))] = true
    for (const k of Object.keys(dela))
      if (!dele[k]) diferencas.push('item ' + k + ' está na compra e não está no pedido')
    for (const k of Object.keys(dele))
      if (!dela[k]) diferencas.push('item ' + k + ' está no pedido e não está na compra')
    if (diferencas.length > 0)
      return e.json(422, { erro: 'pedido_diferente', diferencas: diferencas })

    const col = $app.findCollectionByNameOrId('pcp_pedidos_compra_vinculo')
    const v = new Record(col)
    v.set('requisicao', req.id)
    v.set('codigo_integracao', req.id)
    v.set('numero_omie', numero)
    v.set('origem', 'manual')
    v.set('estado', 'ligado')
    v.set('ligado_por', auth.getString('email') || auth.id)
    v.set('hora', new Date().toISOString())
    try {
      $app.save(v)
    } catch (_) {
      return e.json(409, { erro: 'ja_ligada' })
    }
    return e.json(200, { ok: true, estado: 'ligado', numero_omie: numero })
  },
  $apis.requireAuth(),
)
