// pocketbase/hooks/pcp_venda_autorizar.js — SPEC-3-009 CA-3-29 (RN-06; checklist CL-PEND-011)
// POST /backend/v1/pcp/faturamento/venda/autorizar { pedido_id, operacao: 'incluir_manual'|'volumes_frete', hash_visto }
// O DONO liga a chave omie_pedido_venda_escrita para UM pedido e UMA operação. Só a ação
// autorizar_escrita_omie passa. Condições (no servidor): volumes_frete = pedido LIBERADO, sem gravação já
// feita; incluir_manual = pedido manual registrado (ou a revisar decidido como não duplicata), cliente com
// código do Omie e todos os itens com preço na tabela; nenhuma outra autorização ativa (uma por vez); o
// conteúdo igual ao que o dono viu (hash_visto = payload). Autorizar não envia nada: o envio é
// /venda/gravar. Sem autorização, a chave fica desligada e o faturamento lança à mão com os dados da tela.
routerAdd(
  'POST',
  '/backend/v1/pcp/faturamento/venda/autorizar',
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
    const b = e.requestInfo().body || {}
    const pedido = String(b.pedido_id || '').trim()
    const operacao = String(b.operacao || '')
    const visto = String(b.hash_visto || '')
    if (!pedido || !visto || ['incluir_manual', 'volumes_frete'].indexOf(operacao) === -1) {
      return e.json(422, { erro: 'pedido_operacao_e_hash_visto_obrigatorios' })
    }
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
      let cod = pedido
      try {
        cod = $app
          .findFirstRecordByFilter('pcp_pedidos_manuais', 'pedido_id = {:p}', { p: pedido })
          .getString('codigo_integracao')
      } catch (_) {}
      const peso = Number(prep.get('peso_bruto') || 0)
      payload = {
        operacao: 'alterar_volumes_frete',
        cabecalho: { codigo_pedido_integracao: cod },
        frete: {
          modalidade: prep.getString('frete_modalidade'),
          quantidade_volumes: Number(prep.get('volumes_quantidade') || 0),
          peso_bruto: peso > 0 ? peso : null,
        },
      }
    } else {
      let m = null
      try {
        m = $app.findFirstRecordByFilter('pcp_pedidos_manuais', 'pedido_id = {:p}', { p: pedido })
      } catch (_) {}
      if (!m) return e.json(422, { erro: 'payload_invalido', motivo: 'pedido manual inexistente' })
      const est = m.getString('estado')
      if (
        !(
          est === 'registrado' ||
          (est === 'a_revisar' && m.getString('decisao') === 'nao_e_duplicata')
        )
      ) {
        return e.json(422, {
          erro: 'payload_invalido',
          motivo: 'pedido manual bloqueado ou a revisar',
        })
      }
      if (!/^\d+$/.test(m.getString('cliente_omie'))) {
        return e.json(422, { erro: 'payload_invalido', motivo: 'cliente sem código do Omie' })
      }
      const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(m.getString('data'))
      if (!dm) return e.json(422, { erro: 'payload_invalido', motivo: 'data inválida' })
      let itens = []
      try {
        itens = JSON.parse(m.getString('itens') || '[]') || []
      } catch (_) {}
      const precoDe = (item) => {
        let melhor = null
        for (const chave of [m.getString('cliente_omie'), '*']) {
          const l = $app.findRecordsByFilter(
            'pcp_tabelas_preco',
            'chave = {:c} && item = {:i} && vigencia_inicio <= {:d}',
            '-vigencia_inicio,-versao',
            1,
            0,
            { c: chave, i: item, d: m.getString('data') },
          )
          if (l.length > 0) {
            melhor = Number(l[0].get('preco'))
            break
          }
        }
        return melhor
      }
      const det = []
      for (const i of itens) {
        const p = precoDe(String(i.item))
        if (p === null)
          return e.json(422, {
            erro: 'payload_invalido',
            motivo: 'item ' + i.item + ' sem preço na tabela',
          })
        det.push({
          ide: { codigo_item_integracao: m.getString('codigo_integracao') + '-' + i.item },
          produto: { codigo: i.item, quantidade: Number(i.quantidade), valor_unitario: p },
        })
      }
      payload = {
        operacao: 'incluir_pedido_venda',
        cabecalho: {
          codigo_pedido_integracao: m.getString('codigo_integracao'),
          codigo_cliente: Number(m.getString('cliente_omie')),
          data_previsao: dm[3] + '/' + dm[2] + '/' + dm[1],
          quantidade_itens: det.length,
        },
        det: det,
        informacoes_adicionais: { numero_pedido_cliente: m.getString('referencia') },
      }
    }
    if (JSON.stringify(payload) !== visto) {
      return e.json(422, {
        erro: 'conteudo_diferente_do_visto',
        motivo: 'o conteúdo mudou depois que você conferiu; confira de novo',
        payload: payload,
      })
    }
    let resultado = null
    $app.runInTransaction((tx) => {
      let chave = null
      try {
        chave = tx.findFirstRecordByFilter('pcp_chaves_escrita', 'chave = {:c}', {
          c: 'omie_pedido_venda_escrita',
        })
      } catch (_) {}
      if (!chave) {
        resultado = { http: 409, corpo: { erro: 'chave_inexistente' } }
        return
      }
      const escopo = pedido + ':' + operacao
      if (chave.getBool('ligada') && chave.getString('escopo') !== escopo) {
        resultado = {
          http: 409,
          corpo: {
            erro: 'outra_gravacao_autorizada',
            motivo: 'já existe outra gravação autorizada: uma por vez',
          },
        }
        return
      }
      try {
        const g = tx.findFirstRecordByFilter(
          'pcp_gravacoes_venda',
          'pedido_id = {:p} && operacao = {:o}',
          { p: pedido, o: operacao },
        )
        if (g.getString('estado') !== 'falhou_sem_efeito') {
          resultado = { http: 409, corpo: { erro: 'ja_gravado' } }
          return
        }
      } catch (_) {}
      const agora = new Date().toISOString()
      chave.set('ligada', true)
      chave.set('escopo', escopo)
      chave.set('payload_autorizado', JSON.stringify(payload))
      chave.set('autorizada_por', auth.getString('email') || auth.id)
      chave.set('autorizada_em', agora)
      tx.save(chave)
      resultado = {
        http: 200,
        corpo: { ok: true, pedido_id: pedido, operacao: operacao, autorizada_em: agora },
      }
    })
    return e.json(resultado.http, resultado.corpo)
  },
  $apis.requireAuth(),
)
