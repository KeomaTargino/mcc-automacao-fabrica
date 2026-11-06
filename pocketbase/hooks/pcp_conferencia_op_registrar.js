// pocketbase/hooks/pcp_conferencia_op_registrar.js — patch de 02/11/2026 (SPEC-2-004, C1/C3)
// POST /backend/v1/pcp/producao/conferencia/registrar { registro_id, op_id, etapa, quantidade, unidade }
// Guarda a conferência de uma ordem. etapa 'recebimento_expedicao' exige a ação conferir_expedicao e o
// ponto expedicao; etapa 'entrada_camara' exige conferir_camara e o ponto camara_fria (403 sem pistas).
// A conferência vigente de cada etapa é a ÚLTIMA registrada; nova conferência invalida a aprovação ativa
// da ordem. Mesmo registro_id + mesmo conteúdo = repetição; conteúdo diferente = 409. Quantidade
// ausente nunca vira 0. Ordem com envio em curso, autorizada, incerta ou confirmada não recebe conferência.
routerAdd(
  'POST',
  '/backend/v1/pcp/producao/conferencia/registrar',
  (e) => {
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Sessão ausente ou expirada.')
    let perfil = null
    try {
      perfil = $app.findFirstRecordByFilter('pcp_perfis', 'usuario = {:u}', { u: auth.id })
    } catch (_) {}
    const b = e.requestInfo().body || {}
    const etapa = String(b.etapa || '')
    const REGRA = {
      recebimento_expedicao: { acao: 'conferir_expedicao', ponto: 'expedicao' },
      entrada_camara: { acao: 'conferir_camara', ponto: 'camara_fria' },
    }
    const regra = REGRA[etapa]
    let acoes = []
    let pontos = []
    if (perfil) {
      try {
        acoes = JSON.parse(perfil.getString('acoes') || '[]') || []
      } catch (_) {}
      pontos = perfil.getStringSlice('pontos')
      if (!pontos || pontos.length === 0) {
        try {
          pontos = JSON.parse(perfil.getString('pontos') || '[]') || []
        } catch (_) {
          pontos = []
        }
      }
    }
    if (
      !perfil ||
      !perfil.getBool('ativo') ||
      !regra ||
      !Array.isArray(acoes) ||
      acoes.indexOf(regra.acao) === -1 ||
      pontos.indexOf(regra.ponto) === -1 ||
      perfil.getStringSlice('areas').indexOf('conferir_expedicao') === -1
    ) {
      return e.forbiddenError('sem_permissao')
    }
    const registroId = String(b.registro_id || '').trim()
    const opId = String(b.op_id || '').trim()
    const unidade = String(b.unidade || '').trim()
    const quantidade = b.quantidade === null || b.quantidade === '' ? NaN : Number(b.quantidade)
    if (!registroId || !opId) return e.json(422, { erro: 'registro_e_ordem_obrigatorios' })
    if (!isFinite(quantidade) || quantidade < 0) return e.json(422, { erro: 'quantidade_invalida' })
    if (!unidade) return e.json(422, { erro: 'unidade_desconhecida' })

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
    const trs = $app.findRecordsByFilter('pcp_transacoes_omie', 'op_id = {:o}', '-created', 50, 0, {
      o: opId,
    })
    for (const t of trs) {
      const s = t.getString('estado')
      if (s !== 'preparada' && s !== 'bloqueada' && s !== 'falhou_sem_efeito') {
        return e.json(409, { erro: 'ordem_em_envio', estado: s })
      }
    }

    const hash = JSON.stringify([opId, etapa, quantidade, unidade])
    let existente = null
    try {
      existente = $app.findFirstRecordByFilter('pcp_conferencias_op', 'registro_id = {:i}', {
        i: registroId,
      })
    } catch (_) {}
    if (existente) {
      if (existente.getString('hash_registro') === hash)
        return e.json(200, { ok: true, estado: 'replay', registro_id: registroId })
      return e.json(409, { erro: 'conflito_hash' })
    }
    try {
      const r = new Record($app.findCollectionByNameOrId('pcp_conferencias_op'))
      r.set('registro_id', registroId)
      r.set('op_id', opId)
      r.set('etapa', etapa)
      r.set('ponto', regra.ponto)
      r.set('quantidade', quantidade)
      r.set('unidade', unidade)
      r.set('hash_registro', hash)
      r.set('autor', auth.getString('email') || auth.id)
      $app.save(r)
    } catch (_) {
      return e.json(409, { erro: 'conflito_hash' })
    }

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
      registro_id: registroId,
      aprovacao_invalidada: invalidou,
    })
  },
  $apis.requireAuth(),
)
