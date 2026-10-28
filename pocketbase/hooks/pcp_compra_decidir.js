// pocketbase/hooks/pcp_compra_decidir.js — SPEC-3-005 CA-3-16 (RN-02, RN-04, RN-06)
// POST /backend/v1/pcp/compras/aprovacao { id, decisao: 'aprovada'|'recusada', motivo }
// Exige aprovar_compra E a área compras. Aprovar exige alçada cadastrada para o aprovador cobrindo o
// valor: sem NENHUMA alçada, 423 "alçada não cadastrada" (a aprovação real fica parada, CL-PEND-008);
// valor acima do limite, 403 com a alçada maior que cobre. Recusa exige motivo. Guarda autor, hora,
// valor, alçada usada e o hash do conteúdo aprovado. Não grava no Omie nem cria pedido.
routerAdd(
  'POST',
  '/backend/v1/pcp/compras/aprovacao',
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
      acoes.indexOf('aprovar_compra') === -1 ||
      perfil.getStringSlice('areas').indexOf('compras') === -1
    ) {
      return e.forbiddenError('sem_permissao')
    }
    const body = e.requestInfo().body || {}
    const decisao = String(body.decisao || '')
    const motivo = String(body.motivo || '').trim()
    if (decisao !== 'aprovada' && decisao !== 'recusada')
      return e.json(422, { erro: 'dados_invalidos' })
    let req = null
    try {
      req = $app.findRecordById('pcp_requisicoes', String(body.id || ''))
    } catch (_) {}
    if (!req) return e.json(422, { erro: 'requisicao_inexistente' })
    if (req.getString('estado') !== 'em_aprovacao')
      return e.json(409, { erro: 'estado_nao_permite' })
    if (decisao === 'recusada' && motivo.length < 3) return e.json(422, { erro: 'sem_motivo' })

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
      {
        r: req.id,
      },
    )
    let valor = 0
    const escolhidas = []
    for (const it of itens) {
      const c = cots.find((x) => x.getString('item') === it.item)
      if (!c) return e.json(422, { erro: 'sem_cotacao_escolhida' })
      const uc = c.getString('unidade_compra')
      const q =
        it.quantidadeCompra !== null && it.quantidadeCompra !== undefined
          ? it.quantidadeCompra
          : uc === it.unidadeEstoque
            ? it.quantidadeEstoque
            : null
      if (q === null) return e.json(422, { erro: 'sem_cotacao_escolhida' })
      const preco = Number(c.get('preco_compra') || 0)
      valor += q * preco
      escolhidas.push({
        item: c.getString('item'),
        p: preco,
        u: uc,
        prazo: Number(c.get('prazo_dias') || 0),
      })
    }
    valor = Math.round(valor * 100) / 100

    let alcadaUsada = null
    if (decisao === 'aprovada') {
      const alcadas = $app.findRecordsByFilter('pcp_alcadas', '', 'limite', 500, 0)
      if (alcadas.length === 0) {
        return e.json(423, {
          erro: 'alcada_nao_cadastrada',
          motivo: 'alçada não cadastrada: a aprovação real fica parada',
        })
      }
      const quem = auth.getString('email') || auth.id
      const minha = alcadas.find((a) => a.getString('aprovador') === quem)
      const limite = minha ? Number(minha.get('limite') || 0) : 0
      if (!minha || valor > limite) {
        const maior = alcadas.find((a) => Number(a.get('limite') || 0) >= valor)
        return e.json(403, {
          erro: 'acima_da_alcada',
          valor: valor,
          limite: limite,
          proxima_alcada: maior ? maior.getString('aprovador') : null,
        })
      }
      alcadaUsada = limite
    }

    const ordena = (a, b) => (a.item < b.item ? -1 : 1)
    const hash = JSON.stringify({
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
    $app.runInTransaction((tx) => {
      const antigas = tx.findRecordsByFilter(
        'pcp_aprovacoes_compra',
        'requisicao = {:r} && valida = true',
        '-created',
        50,
        0,
        { r: req.id },
      )
      for (const a of antigas) {
        a.set('valida', false)
        tx.save(a)
      }
      const col = tx.findCollectionByNameOrId('pcp_aprovacoes_compra')
      const a = new Record(col)
      a.set('requisicao', req.id)
      a.set('aprovador', auth.getString('email') || auth.id)
      a.set('decisao', decisao)
      a.set('valor', valor)
      if (alcadaUsada !== null) a.set('alcada_usada', alcadaUsada)
      a.set('motivo', motivo)
      a.set('hora', new Date().toISOString())
      a.set('hash', hash)
      a.set('valida', true)
      tx.save(a)
      req.set('estado', decisao)
      req.set('versao', Number(req.get('versao') || 1) + 1)
      tx.save(req)
    })
    return e.json(200, { ok: true, estado: decisao, valor: valor, alcada_usada: alcadaUsada })
  },
  $apis.requireAuth(),
)
