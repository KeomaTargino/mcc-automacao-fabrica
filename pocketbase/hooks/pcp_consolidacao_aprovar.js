// pocketbase/hooks/pcp_consolidacao_aprovar.js — patch de 02/11/2026 (SPEC-2-004 C4 + SPEC-3-002)
// POST /backend/v1/pcp/producao/consolidacao/aprovar
//   { aprovacao_id, op_id, quantidade_final, motivo, data_conclusao? }
// O PCP aprova a quantidade final de uma ordem. Exige a ação aprovar_consolidacao (403 sem pistas).
// Conferência de expedição e de câmara precisam existir (ausência nunca vira 0). Motivo obrigatório.
// Guarda os hashes dos eventos e das conferências vigentes. Com quantidade final maior que zero, PREPARA a
// ordem para o Omie (pcp_transacoes_omie, estado preparada, payload de conclusão): nada é enviado, a chave
// omie_op_escrita continua desligada e o envio é a rota de autorização do dono. Quantidade final 0 é
// registrada e não prepara ordem. Nova aprovação substitui a anterior se a ordem ainda não foi enviada;
// ordem enviada, incerta ou confirmada = 409. Mesma aprovacao_id repetida devolve o registro.
// Regras de src/lib/pcp/producao-servidor.ts.
routerAdd(
  'POST',
  '/backend/v1/pcp/producao/consolidacao/aprovar',
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
      acoes.indexOf('aprovar_consolidacao') === -1 ||
      perfil.getStringSlice('areas').indexOf('painel') === -1
    ) {
      return e.forbiddenError('sem_permissao')
    }
    const b = e.requestInfo().body || {}
    const aprovacaoId = String(b.aprovacao_id || '').trim()
    const opId = String(b.op_id || '').trim()
    const motivo = String(b.motivo || '').trim()
    const quantidadeFinal =
      b.quantidade_final === null || b.quantidade_final === '' ? NaN : Number(b.quantidade_final)
    const hoje = new Date().toISOString().slice(0, 10)
    const dataConclusao = String(b.data_conclusao || hoje)
    if (!aprovacaoId || !opId) return e.json(422, { erro: 'aprovacao_e_ordem_obrigatorias' })

    let repetida = null
    try {
      repetida = $app.findFirstRecordByFilter(
        'pcp_aprovacoes_consolidacao',
        'aprovacao_id = {:a}',
        {
          a: aprovacaoId,
        },
      )
    } catch (_) {}
    if (repetida) {
      if (repetida.getString('op_id') === opId)
        return e.json(200, { ok: true, estado: 'replay', aprovacao_id: aprovacaoId })
      return e.json(409, { erro: 'aprovacao_de_outra_ordem' })
    }

    // a ordem precisa existir
    let ordemExiste = false
    let produtoDaOrdem = ''
    for (const p of $app.findRecordsByFilter('pcp_programacoes', '', '-versao', 200, 0)) {
      let ops = []
      try {
        ops = JSON.parse(p.getString('ops') || '[]') || []
      } catch (_) {}
      const achada = ops.find((o) => o.op_id === opId)
      if (achada) {
        ordemExiste = true
        produtoDaOrdem = String(achada.produto || '')
        break
      }
    }
    if (!ordemExiste) return e.json(422, { erro: 'ordem_inexistente' })

    // conferências vigentes (a última de cada etapa) e eventos
    const confs = $app.findRecordsByFilter(
      'pcp_conferencias_op',
      'op_id = {:o}',
      'created',
      500,
      0,
      {
        o: opId,
      },
    )
    const ultima = (etapa) => {
      let r = null
      for (const c of confs) if (c.getString('etapa') === etapa) r = c
      return r
    }
    const exp = ultima('recebimento_expedicao')
    const cam = ultima('entrada_camara')
    const eventos = $app.findRecordsByFilter(
      'pcp_apontamentos',
      'op_id = {:o}',
      'created',
      5000,
      0,
      {
        o: opId,
      },
    )
    const hashEventos = JSON.stringify(
      eventos.map((x) => [x.getString('evento_id'), Number(x.get('quantidade'))]).sort(),
    )
    const hashConferencias = JSON.stringify(
      [exp, cam].map((c) => (c ? [c.getString('registro_id'), Number(c.get('quantidade'))] : null)),
    )

    // decisão (mesma regra do contrato puro)
    if (!isFinite(quantidadeFinal) || quantidadeFinal < 0)
      return e.json(422, { erro: 'quantidade_invalida' })
    if (!motivo) return e.json(422, { erro: 'motivo_obrigatorio' })
    if (!exp || !cam) return e.json(422, { erro: 'conferencia_ausente' })
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dataConclusao)
    if (quantidadeFinal > 0 && !m)
      return e.json(422, { erro: 'payload_invalido', motivo: 'data de conclusão inválida' })

    let resultado = null
    $app.runInTransaction((tx) => {
      // aprovações ativas anteriores: só caem se a ordem ainda não foi enviada
      const anteriores = tx.findRecordsByFilter(
        'pcp_aprovacoes_consolidacao',
        "op_id = {:o} && estado = 'ativa'",
        '-created',
        20,
        0,
        { o: opId },
      )
      const trs = tx.findRecordsByFilter('pcp_transacoes_omie', 'op_id = {:o}', '-created', 50, 0, {
        o: opId,
      })
      for (const t of trs) {
        const s = t.getString('estado')
        if (
          s !== 'preparada' &&
          s !== 'bloqueada' &&
          s !== 'autorizada' &&
          s !== 'falhou_sem_efeito'
        ) {
          resultado = { http: 409, corpo: { erro: 'ordem_ja_enviada', estado: s } }
          return
        }
        if (s === 'autorizada') {
          resultado = {
            http: 409,
            corpo: {
              erro: 'ordem_autorizada',
              motivo: 'o dono precisa desautorizar a ordem antes',
            },
          }
          return
        }
      }
      for (const a of anteriores) {
        a.set('estado', 'invalidada')
        tx.save(a)
        for (const t of trs) {
          if (
            t.getString('transacao_id') === 'TX-' + a.getString('aprovacao_id') &&
            t.getString('estado') === 'preparada'
          ) {
            t.set('estado', 'bloqueada')
            tx.save(t)
          }
        }
      }
      // Conta de teste ou produto de demonstração: aprova e registra, mas não prepara ordem (CA-4-34).
      const demo = perfil.getBool('teste') || /DEMO|^COOKIE-1$|^INS-\d+$/i.test(produtoDaOrdem)
      const pendencias = demo
        ? ['registro_de_demonstracao: nenhuma ordem preparada; nunca vai ao Omie']
        : quantidadeFinal === 0
          ? ['quantidade_final_zero: nenhuma ordem preparada; decisão do PCP permanece pendente']
          : []
      const ap = new Record(tx.findCollectionByNameOrId('pcp_aprovacoes_consolidacao'))
      ap.set('aprovacao_id', aprovacaoId)
      ap.set('op_id', opId)
      ap.set('quantidade_final', quantidadeFinal)
      ap.set('motivo', motivo)
      ap.set('data_conclusao', dataConclusao)
      ap.set('aprovador', auth.getString('email') || auth.id)
      ap.set('hash_eventos', hashEventos)
      ap.set('hash_conferencias', hashConferencias)
      ap.set('estado', 'ativa')
      ap.set('demonstracao', demo)
      ap.set('pendencias', JSON.stringify(pendencias))
      tx.save(ap)
      let ordem = null
      if (quantidadeFinal > 0 && !demo) {
        const payload = {
          operacao: 'concluir_op',
          nCodOP: null,
          cCodIntOP: opId,
          dDtConclusao: m[3] + '/' + m[2] + '/' + m[1],
          nQtdeProduzida: quantidadeFinal,
          cObsConclusao: motivo.slice(0, 200),
        }
        const t = new Record(tx.findCollectionByNameOrId('pcp_transacoes_omie'))
        t.set('transacao_id', 'TX-' + aprovacaoId)
        t.set('op_id', opId)
        t.set('revisao_consolidacao', anteriores.length + 1)
        t.set('operacao', 'concluir_op')
        t.set('codigo_integracao', opId)
        t.set('quantidade', quantidadeFinal)
        t.set('payload', JSON.stringify(payload))
        t.set('payload_hash', JSON.stringify(payload))
        t.set('estado', 'preparada')
        t.set('posts_mutantes', 0)
        t.set('pendencias', JSON.stringify([]))
        tx.save(t)
        ordem = { transacao_id: 'TX-' + aprovacaoId, estado: 'preparada' }
      }
      resultado = {
        http: 200,
        corpo: { ok: true, aprovacao_id: aprovacaoId, ordem: ordem, pendencias: pendencias },
      }
    })
    return e.json(resultado.http, resultado.corpo)
  },
  $apis.requireAuth(),
)
