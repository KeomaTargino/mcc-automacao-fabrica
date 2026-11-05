// pocketbase/hooks/pcp_pedido_lancar.js — SPEC-3-006 CA-3-18 (RN-02, RN-04, RN-05)
// POST /backend/v1/pcp/compras/pedido/lancar { requisicao }
// Lança no Omie (IncluirPedCompra) UMA compra aprovada e autorizada pelo dono. Contrato puro e
// simulador: src/lib/pcp/pedido-compra.ts. Ordem (qualquer falha antes da chamada = zero chamadas):
//   1. editar_requisicao E área compras (403 sem pistas);
//   2. compra aprovada, com aprovação válida e conteúdo igual ao aprovado (409);
//   3. chave omie_pedido_compra_escrita LIGADA com o escopo desta compra (senão 423 "lançamento desligado");
//   4. aquisição atômica pelo índice único do vínculo (uma linha por compra; só quem cria envia);
//   5. a chave desliga ANTES da chamada;
//   6. uma única chamada. Resposta perdida/ambígua = resultado_incerto: nunca repete, só consulta
//      (/compras/pedido/conferir). O código de integração é o id da compra, persistido antes.
// Segredos só no servidor. Não emite nota nem lança no financeiro.
routerAdd(
  'POST',
  '/backend/v1/pcp/compras/pedido/lancar',
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
    if (!req) return e.json(422, { erro: 'requisicao_inexistente' })
    if (req.getBool('demonstracao')) return e.json(422, { erro: 'registro_de_demonstracao' })

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
    let incompleto = ''
    for (const it of itens) {
      const c = cots.find((x) => x.getString('item') === it.item)
      if (!c) {
        incompleto = 'item ' + it.item + ' sem cotação escolhida'
        break
      }
      const uc = c.getString('unidade_compra')
      const q =
        it.quantidadeCompra !== null && it.quantidadeCompra !== undefined
          ? it.quantidadeCompra
          : uc === it.unidadeEstoque
            ? it.quantidadeEstoque
            : null
      if (q === null) {
        incompleto = 'item ' + it.item + ' sem fator confirmado'
        break
      }
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
    if (!incompleto && req.getString('estado') === 'aprovada') {
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

    // 3. Chave
    let chave = null
    try {
      chave = $app.findFirstRecordByFilter('pcp_chaves_escrita', 'chave = {:c}', {
        c: 'omie_pedido_compra_escrita',
      })
    } catch (_) {}
    if (!chave || !chave.getBool('ligada') || chave.getString('escopo') !== req.id) {
      return e.json(423, {
        erro: 'escrita_desligada',
        mensagem: 'lançamento desligado: aguarda autorização do dono',
      })
    }
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
    // Patch 02/11/2026: o que vai ao Omie precisa ser igual ao que o dono viu ao autorizar.
    // Mudou depois da autorização: recusa, zero chamadas, e a autorização cai (o dono autoriza de novo).
    if (chave.getString('payload_autorizado') !== JSON.stringify(payload)) {
      chave.set('ligada', false)
      chave.set('escopo', '')
      chave.set('payload_autorizado', '')
      $app.save(chave)
      return e.json(409, {
        erro: 'pedido_alterado_apos_autorizacao',
        mensagem: 'o pedido mudou depois da autorização do dono; confira e autorize de novo',
      })
    }
    const appKey = $secrets.get('OMIE_APP_KEY')
    const appSecret = $secrets.get('OMIE_APP_SECRET')
    if (!appKey || !appSecret) return e.badRequestError('credencial_ausente')

    // 4. Aquisição atômica: o vínculo é criado antes da chamada; o índice único impede um segundo envio.
    // Um vínculo que falhou sem efeito pode ser retomado (só depois de nova autorização do dono).
    let vinculo = null
    try {
      vinculo = $app.findFirstRecordByFilter('pcp_pedidos_compra_vinculo', 'requisicao = {:r}', {
        r: req.id,
      })
    } catch (_) {}
    if (vinculo && vinculo.getString('estado') !== 'falhou_sem_efeito')
      return e.json(409, { erro: 'ja_ligada' })
    try {
      if (!vinculo) {
        vinculo = new Record($app.findCollectionByNameOrId('pcp_pedidos_compra_vinculo'))
        vinculo.set('requisicao', req.id)
        vinculo.set('codigo_integracao', req.id)
      }
      vinculo.set('origem', 'sistema')
      vinculo.set('estado', 'enviando')
      vinculo.set('ligado_por', auth.getString('email') || auth.id)
      vinculo.set('hora', new Date().toISOString())
      vinculo.set('payload_hash', JSON.stringify(payload))
      $app.save(vinculo)
    } catch (_) {
      return e.json(409, {
        erro: 'sem_lease',
        motivo: 'outro trabalhador já está lançando esta compra',
      })
    }

    // 5. A chave desliga antes da chamada.
    // Se a chave não desligar, nada foi enviado: o vínculo volta a "falhou sem efeito" e a nova
    // tentativa fica liberada (com nova autorização), em vez de travar em "enviando".
    try {
      chave.set('ligada', false)
      chave.set('escopo', '')
      chave.set('payload_autorizado', '')
      $app.save(chave)
    } catch (_) {
      const volta = $app.findRecordById('pcp_pedidos_compra_vinculo', vinculo.id)
      volta.set('estado', 'falhou_sem_efeito')
      $app.save(volta)
      return e.json(500, { erro: 'chave_nao_desligou', estado: 'falhou_sem_efeito' })
    }

    // 6. Uma única chamada que grava.
    let chegou = false
    let status = 0
    let j = null
    try {
      const res = $http.send({
        url: 'https://app.omie.com.br/api/v1/produtos/pedidocompra/',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          call: 'IncluirPedCompra',
          app_key: appKey,
          app_secret: appSecret,
          param: [
            {
              cabecalho_incluir: payload.cabecalho_incluir,
              produtos_incluir: payload.produtos_incluir,
            },
          ],
        }),
        timeout: 30,
      })
      chegou = true
      status = res.statusCode
      j = res.json
    } catch (_) {
      chegou = false
    }
    const faultstring = String((j && j.faultstring) || '').slice(0, 200)
    const faultcode = String((j && j.faultcode) || '')
    let estado = 'resultado_incerto'
    if (chegou && status >= 200 && status < 300 && j && j.nCodPed && String(j.cCodStatus) === '0') {
      estado = 'ligado'
    } else if (
      chegou &&
      status !== 425 &&
      faultcode.indexOf('SOAP-ENV:Client') === 0 &&
      faultstring.toLowerCase().indexOf('consumo redundante') === -1
    ) {
      estado = 'falhou_sem_efeito'
    }
    const resultado = {
      chegou: chegou,
      http: status,
      cCodStatus: j && j.cCodStatus !== undefined ? String(j.cCodStatus) : null,
      cDescStatus: j && j.cDescStatus ? String(j.cDescStatus).slice(0, 200) : null,
      faultcode: faultcode || null,
      faultstring: faultstring || null,
    }
    const final = $app.findRecordById('pcp_pedidos_compra_vinculo', vinculo.id)
    final.set('estado', estado)
    final.set('resultado', JSON.stringify(resultado))
    if (estado === 'ligado') {
      final.set('numero_omie', j && j.cNumero ? String(j.cNumero) : '')
      final.set('cod_pedido_omie', j && j.nCodPed ? String(j.nCodPed) : '')
    }
    $app.save(final)
    return e.json(200, { ok: true, estado: estado, resultado: resultado })
  },
  $apis.requireAuth(),
)
