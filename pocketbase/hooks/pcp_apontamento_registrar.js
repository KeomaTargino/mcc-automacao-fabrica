// pocketbase/hooks/pcp_apontamento_registrar.js — patch de 02/11/2026 (SPEC-2-003, E1/E2/E4)
// POST /backend/v1/pcp/producao/apontamento/registrar
//   { evento_id, op_id, ponto, tipo, item, quantidade, unidade, motivo?, retifica? }
// Guarda um evento imutável de apontamento. Acesso por PONTO: o perfil precisa ter o ponto (403 sem
// pistas). A ordem precisa existir na programação publicada. Mesmo evento_id + mesmo conteúdo = repetição
// (devolve o registro, não duplica); mesmo evento_id + conteúdo diferente = 409. Ordem com envio em curso,
// autorizada, incerta ou confirmada não recebe evento (409). Retificação cria evento novo com motivo e
// referência ao original; o original fica. Registrar evento invalida a aprovação ativa da ordem.
routerAdd(
  'POST',
  '/backend/v1/pcp/producao/apontamento/registrar',
  (e) => {
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Sessão ausente ou expirada.')
    let perfil = null
    try {
      perfil = $app.findFirstRecordByFilter('pcp_perfis', 'usuario = {:u}', { u: auth.id })
    } catch (_) {}
    const b = e.requestInfo().body || {}
    let pontos = []
    if (perfil) {
      pontos = perfil.getStringSlice('pontos')
      if (!pontos || pontos.length === 0) {
        try {
          pontos = JSON.parse(perfil.getString('pontos') || '[]') || []
        } catch (_) {
          pontos = []
        }
      }
    }
    const ponto = String(b.ponto || '')
    if (
      !perfil ||
      !perfil.getBool('ativo') ||
      !ponto ||
      pontos.indexOf(ponto) === -1 ||
      perfil.getStringSlice('areas').indexOf('apontar_producao') === -1
    ) {
      return e.forbiddenError('sem_permissao')
    }
    const eventoId = String(b.evento_id || '').trim()
    const opId = String(b.op_id || '').trim()
    if (!eventoId || !opId) return e.json(422, { erro: 'evento_e_ordem_obrigatorios' })

    // a ordem precisa estar na programação publicada
    let ordemExiste = false
    const progs = $app.findRecordsByFilter('pcp_programacoes', '', '-versao', 200, 0)
    for (const p of progs) {
      let ops = []
      try {
        ops = JSON.parse(p.getString('ops') || '[]') || []
      } catch (_) {}
      if (ops.some((o) => o.op_id === opId)) {
        ordemExiste = true
        break
      }
    }
    if (!ordemExiste) return e.json(422, { erro: 'ordem_inexistente' })

    // ordem com envio em curso, autorizada, incerta ou confirmada não recebe evento
    const trs = $app.findRecordsByFilter('pcp_transacoes_omie', 'op_id = {:o}', '-created', 50, 0, {
      o: opId,
    })
    for (const t of trs) {
      const s = t.getString('estado')
      if (s !== 'preparada' && s !== 'bloqueada' && s !== 'falhou_sem_efeito') {
        return e.json(409, { erro: 'ordem_em_envio', estado: s })
      }
    }

    const TIPOS = ['retirada', 'adicional', 'devolucao', 'perda', 'realizado']
    let tipo = String(b.tipo || '')
    let item = String(b.item || '').trim()
    let unidade = b.unidade === null || b.unidade === undefined ? '' : String(b.unidade).trim()
    let quantidade = Number(b.quantidade)
    const motivo = String(b.motivo || '').trim()
    const retifica = String(b.retifica || '').trim()
    let pontoEv = ponto

    if (retifica) {
      let original = null
      try {
        original = $app.findFirstRecordByFilter('pcp_apontamentos', 'evento_id = {:i}', {
          i: retifica,
        })
      } catch (_) {}
      if (!original || original.getString('op_id') !== opId)
        return e.json(422, { erro: 'original_inexistente' })
      if (!motivo) return e.json(422, { erro: 'motivo_obrigatorio' })
      if (pontos.indexOf(original.getString('ponto')) === -1)
        return e.forbiddenError('sem_permissao')
      tipo = original.getString('tipo')
      item = original.getString('item')
      unidade = original.getString('unidade')
      pontoEv = original.getString('ponto')
      if (!isFinite(quantidade) || quantidade < 0)
        return e.json(422, { erro: 'quantidade_invalida' })
    } else {
      if (TIPOS.indexOf(tipo) === -1) return e.json(422, { erro: 'tipo_invalido' })
      if (!item) return e.json(422, { erro: 'item_obrigatorio' })
      if (!isFinite(quantidade)) return e.json(422, { erro: 'quantidade_invalida' })
      if (tipo !== 'realizado' && quantidade <= 0)
        return e.json(422, { erro: 'quantidade_invalida', motivo: 'precisa ser maior que zero' })
      if (tipo === 'realizado' && quantidade < 0)
        return e.json(422, { erro: 'quantidade_invalida' })
      if (tipo === 'realizado' && quantidade === 0 && !motivo)
        return e.json(422, { erro: 'motivo_obrigatorio', motivo: 'realizado 0 exige motivo' })
    }
    if (!unidade) return e.json(422, { erro: 'unidade_desconhecida' })

    const hash = JSON.stringify([
      opId,
      pontoEv,
      tipo,
      item,
      quantidade,
      unidade,
      motivo || null,
      retifica || null,
    ])
    let existente = null
    try {
      existente = $app.findFirstRecordByFilter('pcp_apontamentos', 'evento_id = {:i}', {
        i: eventoId,
      })
    } catch (_) {}
    if (existente) {
      if (existente.getString('hash_evento') === hash)
        return e.json(200, { ok: true, estado: 'replay', evento_id: eventoId })
      return e.json(409, { erro: 'conflito_hash' })
    }
    try {
      const r = new Record($app.findCollectionByNameOrId('pcp_apontamentos'))
      r.set('evento_id', eventoId)
      r.set('op_id', opId)
      r.set('ponto', pontoEv)
      r.set('tipo', tipo)
      r.set('item', item)
      r.set('quantidade', quantidade)
      r.set('unidade', unidade)
      r.set('motivo', motivo)
      r.set('retifica', retifica)
      r.set('hash_evento', hash)
      r.set('autor', auth.getString('email') || auth.id)
      $app.save(r)
    } catch (_) {
      // corrida com o mesmo evento_id: confere o que ficou gravado
      try {
        const x = $app.findFirstRecordByFilter('pcp_apontamentos', 'evento_id = {:i}', {
          i: eventoId,
        })
        if (x.getString('hash_evento') === hash)
          return e.json(200, { ok: true, estado: 'replay', evento_id: eventoId })
      } catch (_) {}
      return e.json(409, { erro: 'conflito_hash' })
    }

    // novo evento muda a projeção: a aprovação ativa da ordem cai e a ordem preparada fica bloqueada
    const aps = $app.findRecordsByFilter(
      'pcp_aprovacoes_consolidacao',
      "op_id = {:o} && estado = 'ativa'",
      '-created',
      20,
      0,
      { o: opId },
    )
    let invalidou = false
    for (const a of aps) {
      a.set('estado', 'invalidada')
      $app.save(a)
      invalidou = true
      try {
        const t = $app.findFirstRecordByFilter('pcp_transacoes_omie', 'transacao_id = {:t}', {
          t: 'TX-' + a.getString('aprovacao_id'),
        })
        if (t.getString('estado') === 'preparada') {
          t.set('estado', 'bloqueada')
          $app.save(t)
        }
      } catch (_) {}
    }
    return e.json(200, {
      ok: true,
      estado: 'registrado',
      evento_id: eventoId,
      aprovacao_invalidada: invalidou,
    })
  },
  $apis.requireAuth(),
)
