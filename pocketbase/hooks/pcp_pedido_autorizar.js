// pocketbase/hooks/pcp_pedido_autorizar.js — SPEC-3-006 CA-3-18 (RN-04)
// POST /backend/v1/pcp/compras/pedido/autorizar { requisicao, hash_visto }
// O DONO autoriza o lançamento de UMA compra aprovada no Omie. Só a ação autorizar_escrita_omie passa.
// Condições (todas no servidor): compra aprovada com aprovação válida e conteúdo igual ao aprovado;
// fornecedor com código do Omie (numérico); itens com cotação escolhida e quantidade na unidade de
// compra; nenhuma outra compra autorizada (uma por vez); ainda sem vínculo. Liga a chave
// omie_pedido_compra_escrita SÓ para esta compra. Autorizar não envia nada: o envio é a rota
// /compras/pedido/lancar. Condição do checklist CL-PEND-011: a decisão de ligar é do dono.
routerAdd(
  'POST',
  '/backend/v1/pcp/compras/pedido/autorizar',
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
      acoes.indexOf('autorizar_escrita_omie') === -1
    ) {
      return e.forbiddenError('sem_permissao')
    }
    const body = e.requestInfo().body || {}
    const hashVisto = String(body.hash_visto || '')
    let req = null
    try {
      req = $app.findRecordById('pcp_requisicoes', String(body.requisicao || ''))
    } catch (_) {}
    if (!req || !hashVisto) return e.json(422, { erro: 'requisicao_e_hash_visto_obrigatorios' })

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
    const produtos = []
    for (const it of itens) {
      const c = cots.find((x) => x.getString('item') === it.item)
      if (!c)
        return e.json(422, {
          erro: 'payload_invalido',
          motivo: 'item ' + it.item + ' sem cotação escolhida',
        })
      const uc = c.getString('unidade_compra')
      const q =
        it.quantidadeCompra !== null && it.quantidadeCompra !== undefined
          ? it.quantidadeCompra
          : uc === it.unidadeEstoque
            ? it.quantidadeEstoque
            : null
      if (q === null)
        return e.json(422, {
          erro: 'payload_invalido',
          motivo: 'item ' + it.item + ' sem fator confirmado',
        })
      const preco = Number(c.get('preco_compra') || 0)
      escolhidas.push({ item: it.item, p: preco, u: uc, prazo: Number(c.get('prazo_dias') || 0) })
      produtos.push({
        cCodIntItem: req.id + '-' + it.item,
        cProduto: it.item,
        cUnidade: uc,
        nQtde: q,
        nValUnit: preco,
      })
    }
    const ordena = (a, b) => (a.item < b.item ? -1 : 1)
    const hashConteudo = JSON.stringify({
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
      cotacoes: escolhidas.slice().sort(ordena),
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
      aprovada = apr.length > 0 && apr[0].getString('hash') === hashConteudo
    }
    if (!aprovada) return e.json(409, { erro: 'compra_nao_aprovada' })
    if (!/^\d+$/.test(req.getString('fornecedor'))) {
      return e.json(422, {
        erro: 'payload_invalido',
        motivo: 'fornecedor sem código do Omie: informe o código antes de lançar',
      })
    }
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(req.getString('data_necessaria'))
    if (!m) return e.json(422, { erro: 'payload_invalido', motivo: 'data prevista inválida' })
    const payload = {
      operacao: 'incluir_pedido_compra',
      cabecalho_incluir: {
        cCodIntPed: req.id,
        dDtPrevisao: m[3] + '/' + m[2] + '/' + m[1],
        nCodFor: Number(req.getString('fornecedor')),
        cObs: req.getBool('emergencial')
          ? 'EMERGENCIAL: ' + req.getString('motivo_emergencia')
          : '',
      },
      produtos_incluir: produtos,
    }
    if (JSON.stringify(payload) !== hashVisto) {
      return e.json(422, {
        erro: 'conteudo_diferente_do_visto',
        motivo: 'o conteúdo mudou depois que você conferiu; confira de novo',
      })
    }

    let resultado = null
    $app.runInTransaction((tx) => {
      let chave = null
      try {
        chave = tx.findFirstRecordByFilter('pcp_chaves_escrita', 'chave = {:c}', {
          c: 'omie_pedido_compra_escrita',
        })
      } catch (_) {}
      if (!chave) {
        resultado = { http: 409, corpo: { erro: 'chave_inexistente' } }
        return
      }
      if (chave.getBool('ligada') && chave.getString('escopo') !== req.id) {
        resultado = {
          http: 409,
          corpo: {
            erro: 'outra_compra_autorizada',
            motivo: 'já existe outra compra autorizada: uma por vez',
          },
        }
        return
      }
      try {
        const v = tx.findFirstRecordByFilter('pcp_pedidos_compra_vinculo', 'requisicao = {:r}', {
          r: req.id,
        })
        if (v.getString('estado') !== 'falhou_sem_efeito') {
          resultado = { http: 409, corpo: { erro: 'ja_ligada' } }
          return
        }
      } catch (_) {}
      const agora = new Date().toISOString()
      chave.set('ligada', true)
      chave.set('escopo', req.id)
      chave.set('payload_autorizado', JSON.stringify(payload))
      chave.set('autorizada_por', auth.getString('email') || auth.id)
      chave.set('autorizada_em', agora)
      tx.save(chave)
      resultado = { http: 200, corpo: { ok: true, requisicao: req.id, autorizada_em: agora } }
    })
    return e.json(resultado.http, resultado.corpo)
  },
  $apis.requireAuth(),
)
