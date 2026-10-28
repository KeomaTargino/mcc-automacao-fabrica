// pocketbase/hooks/pcp_venda_gravar.js — SPEC-3-009 CA-3-29 (RN-06)
// POST /backend/v1/pcp/faturamento/venda/gravar { pedido_id, operacao: 'incluir_manual'|'volumes_frete' }
// Grava no Omie UMA vez: incluir o pedido manual (IncluirPedido) ou os volumes e o frete do pedido
// liberado (AlterarPedidoVenda). Contrato: 07-sistemas/pcp/contratos-fase-3.md. Ordem (qualquer falha
// antes da chamada = zero chamadas):
//   1. ação: incluir_manual = preparar_pedido; volumes_frete = liberar_faturamento; ambas com a área
//      faturamento (403 sem pistas);
//   2. volumes_frete exige pedido liberado (409); incluir_manual exige pedido manual registrado;
//   3. chave omie_pedido_venda_escrita LIGADA com o escopo "pedido:operação" (senão 423, e a resposta traz
//      o que lançar à mão);
//   4. aquisição atômica pelo índice único (pedido, operação): só quem cria a linha envia;
//   5. a chave desliga ANTES da chamada;
//   6. uma única chamada. Resposta perdida/ambígua/425 = resultado_incerto: nunca repete, só consulta
//      (/venda/conferir). O código de integração é persistido antes.
// Segredos só no servidor. Não emite nota fiscal nem lança no financeiro.
routerAdd(
  'POST',
  '/backend/v1/pcp/faturamento/venda/gravar',
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
    const b = e.requestInfo().body || {}
    const pedido = String(b.pedido_id || '').trim()
    const operacao = String(b.operacao || '')
    const acaoNecessaria = operacao === 'incluir_manual' ? 'preparar_pedido' : 'liberar_faturamento'
    if (
      !perfil ||
      !perfil.getBool('ativo') ||
      !Array.isArray(acoes) ||
      ['incluir_manual', 'volumes_frete'].indexOf(operacao) === -1 ||
      acoes.indexOf(acaoNecessaria) === -1 ||
      perfil.getStringSlice('areas').indexOf('faturamento') === -1
    ) {
      return e.forbiddenError('sem_permissao')
    }
    if (!pedido) return e.json(422, { erro: 'pedido_obrigatorio' })

    let manual = null
    try {
      manual = $app.findFirstRecordByFilter('pcp_pedidos_manuais', 'pedido_id = {:p}', {
        p: pedido,
      })
    } catch (_) {}
    let payload = null
    if (operacao === 'volumes_frete') {
      let prep = null
      try {
        prep = $app.findFirstRecordByFilter('pcp_preparacao_pedido', 'pedido_id = {:p}', {
          p: pedido,
        })
      } catch (_) {}
      if (!prep || prep.getString('liberacao_hash') === '')
        return e.json(409, { erro: 'nao_esta_liberado' })
      const peso = Number(prep.get('peso_bruto') || 0)
      payload = {
        operacao: 'alterar_volumes_frete',
        cabecalho: {
          codigo_pedido_integracao: manual ? manual.getString('codigo_integracao') : pedido,
        },
        frete: {
          modalidade: prep.getString('frete_modalidade'),
          quantidade_volumes: Number(prep.get('volumes_quantidade') || 0),
          peso_bruto: peso > 0 ? peso : null,
        },
      }
    } else {
      if (!manual)
        return e.json(422, { erro: 'payload_invalido', motivo: 'pedido manual inexistente' })
      const est = manual.getString('estado')
      if (
        !(
          est === 'registrado' ||
          (est === 'a_revisar' && manual.getString('decisao') === 'nao_e_duplicata')
        )
      ) {
        return e.json(422, {
          erro: 'payload_invalido',
          motivo: 'pedido manual bloqueado ou a revisar',
        })
      }
      if (!/^\d+$/.test(manual.getString('cliente_omie'))) {
        return e.json(422, { erro: 'payload_invalido', motivo: 'cliente sem código do Omie' })
      }
      const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(manual.getString('data'))
      if (!dm) return e.json(422, { erro: 'payload_invalido', motivo: 'data inválida' })
      let itens = []
      try {
        itens = JSON.parse(manual.getString('itens') || '[]') || []
      } catch (_) {}
      const det = []
      for (const i of itens) {
        let preco = null
        for (const chaveT of [manual.getString('cliente_omie'), '*']) {
          const l = $app.findRecordsByFilter(
            'pcp_tabelas_preco',
            'chave = {:c} && item = {:i} && vigencia_inicio <= {:d}',
            '-vigencia_inicio,-versao',
            1,
            0,
            { c: chaveT, i: String(i.item), d: manual.getString('data') },
          )
          if (l.length > 0) {
            preco = Number(l[0].get('preco'))
            break
          }
        }
        if (preco === null)
          return e.json(422, {
            erro: 'payload_invalido',
            motivo: 'item ' + i.item + ' sem preço na tabela',
          })
        det.push({
          ide: { codigo_item_integracao: manual.getString('codigo_integracao') + '-' + i.item },
          produto: { codigo: i.item, quantidade: Number(i.quantidade), valor_unitario: preco },
        })
      }
      payload = {
        operacao: 'incluir_pedido_venda',
        cabecalho: {
          codigo_pedido_integracao: manual.getString('codigo_integracao'),
          codigo_cliente: Number(manual.getString('cliente_omie')),
          data_previsao: dm[3] + '/' + dm[2] + '/' + dm[1],
          quantidade_itens: det.length,
        },
        det: det,
        informacoes_adicionais: { numero_pedido_cliente: manual.getString('referencia') },
      }
    }

    // 3. Chave
    let chave = null
    try {
      chave = $app.findFirstRecordByFilter('pcp_chaves_escrita', 'chave = {:c}', {
        c: 'omie_pedido_venda_escrita',
      })
    } catch (_) {}
    if (
      !chave ||
      !chave.getBool('ligada') ||
      chave.getString('escopo') !== pedido + ':' + operacao
    ) {
      return e.json(423, {
        erro: 'escrita_desligada',
        mensagem:
          'gravação no Omie desligada: aguarda autorização do dono; lance à mão com os dados da tela',
        para_lancar_a_mao: payload,
      })
    }
    const appKey = $secrets.get('OMIE_APP_KEY')
    const appSecret = $secrets.get('OMIE_APP_SECRET')
    if (!appKey || !appSecret) return e.badRequestError('credencial_ausente')

    // 4. Aquisição atômica (uma linha por pedido e operação).
    let g = null
    try {
      g = $app.findFirstRecordByFilter(
        'pcp_gravacoes_venda',
        'pedido_id = {:p} && operacao = {:o}',
        { p: pedido, o: operacao },
      )
    } catch (_) {}
    if (g && g.getString('estado') !== 'falhou_sem_efeito')
      return e.json(409, { erro: 'ja_gravado' })
    try {
      if (!g) {
        g = new Record($app.findCollectionByNameOrId('pcp_gravacoes_venda'))
        g.set('pedido_id', pedido)
        g.set('operacao', operacao)
      }
      g.set('codigo_integracao', payload.cabecalho.codigo_pedido_integracao)
      g.set('estado', 'enviando')
      g.set('gravado_por', auth.getString('email') || auth.id)
      g.set('hora', new Date().toISOString())
      g.set('payload_hash', JSON.stringify(payload))
      $app.save(g)
    } catch (_) {
      return e.json(409, {
        erro: 'sem_lease',
        motivo: 'outro trabalhador já está gravando este pedido',
      })
    }

    // 5. A chave desliga antes da chamada.
    chave.set('ligada', false)
    chave.set('escopo', '')
    $app.save(chave)

    // 6. Uma única chamada que grava.
    const chamada =
      operacao === 'incluir_manual'
        ? {
            call: 'IncluirPedido',
            param: [
              {
                cabecalho: payload.cabecalho,
                det: payload.det,
                informacoes_adicionais: payload.informacoes_adicionais,
              },
            ],
          }
        : {
            call: 'AlterarPedidoVenda',
            param: [{ cabecalho: payload.cabecalho, frete: payload.frete }],
          }
    let chegou = false
    let status = 0
    let j = null
    try {
      const res = $http.send({
        url: 'https://app.omie.com.br/api/v1/produtos/pedido/',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          call: chamada.call,
          app_key: appKey,
          app_secret: appSecret,
          param: chamada.param,
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
    if (chegou && status >= 200 && status < 300 && j && String(j.codigo_status) === '0') {
      estado = 'confirmada'
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
      codigo_status: j && j.codigo_status !== undefined ? String(j.codigo_status) : null,
      descricao_status: j && j.descricao_status ? String(j.descricao_status).slice(0, 200) : null,
      codigo_pedido: j && j.codigo_pedido ? String(j.codigo_pedido) : null,
      numero_pedido: j && j.numero_pedido ? String(j.numero_pedido) : null,
      faultcode: faultcode || null,
      faultstring: faultstring || null,
    }
    const final = $app.findRecordById('pcp_gravacoes_venda', g.id)
    final.set('estado', estado)
    final.set('resultado', JSON.stringify(resultado))
    $app.save(final)
    return e.json(200, { ok: true, estado: estado, resultado: resultado })
  },
  $apis.requireAuth(),
)
