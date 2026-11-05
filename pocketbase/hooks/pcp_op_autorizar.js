// pocketbase/hooks/pcp_op_autorizar.js — SPEC-3-002 CA-3-07
// POST /backend/v1/pcp/omie/op/autorizar — o DONO autoriza UMA ordem preparada. Só a ação
// autorizar_escrita_omie (do dono) passa; o servidor fixa autor e hora. Em uma transação:
//   - a transação precisa estar 'preparada' (409);
//   - se a chave omie_op_escrita já está ligada para OUTRA ordem, nega (uma por vez, 409);
//   - o hash que o dono viu (hash_visto) precisa ser o do conteúdo atual (422): conteúdo
//     alterado invalida e exige nova conferência;
//   - aí a transação vira 'autorizada' e a chave liga SÓ para ela.
// Autorizar não envia nada: o envio é a rota /omie/op/enviar. Contrato: src/lib/pcp/autorizacao-op.ts.
routerAdd(
  'POST',
  '/backend/v1/pcp/omie/op/autorizar',
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
    const transacaoId = String(body.transacao_id || '')
    const hashVisto = String(body.hash_visto || '')
    if (!transacaoId || !hashVisto)
      return e.badRequestError('transacao_id_e_hash_visto_obrigatorios')

    let resultado = null
    $app.runInTransaction((tx) => {
      let t = null
      try {
        t = tx.findFirstRecordByFilter('pcp_transacoes_omie', 'transacao_id = {:t}', {
          t: transacaoId,
        })
      } catch (_) {}
      if (!t) {
        resultado = { http: 404, corpo: { erro: 'transacao_inexistente' } }
        return
      }
      if (t.getBool('demonstracao')) {
        resultado = { http: 422, corpo: { erro: 'registro_de_demonstracao' } }
        return
      }
      let chave = null
      try {
        chave = tx.findFirstRecordByFilter('pcp_chaves_escrita', 'chave = {:c}', {
          c: 'omie_op_escrita',
        })
      } catch (_) {}
      if (!chave) {
        resultado = { http: 409, corpo: { erro: 'chave_inexistente' } }
        return
      }
      if (t.getString('estado') !== 'preparada') {
        resultado = {
          http: 409,
          corpo: {
            erro: 'estado_nao_autoriza',
            motivo:
              'transação em estado ' + t.getString('estado') + ': só preparada pode ser autorizada',
          },
        }
        return
      }
      if (chave.getBool('ligada') && chave.getString('escopo') !== transacaoId) {
        resultado = {
          http: 409,
          corpo: {
            erro: 'outra_ordem_autorizada',
            motivo: 'já existe outra ordem autorizada: uma por vez',
          },
        }
        return
      }
      let p = {}
      try {
        p = JSON.parse(t.getString('payload') || '{}') || {}
      } catch (_) {}
      const hashAtual = JSON.stringify({
        operacao: p.operacao,
        nCodOP: p.nCodOP === undefined ? null : p.nCodOP,
        cCodIntOP: p.cCodIntOP,
        dDtConclusao: p.dDtConclusao,
        nQtdeProduzida: p.nQtdeProduzida,
        cObsConclusao: p.cObsConclusao,
      })
      const hashGuardado = t.getString('payload_hash')
      if (
        p.operacao !== 'concluir_op' ||
        !(Number(p.nQtdeProduzida) > 0) ||
        hashVisto !== hashAtual ||
        (hashGuardado !== '' && hashGuardado !== hashAtual)
      ) {
        resultado = {
          http: 422,
          corpo: {
            erro: 'conteudo_diferente_do_visto',
            motivo: 'o conteúdo mudou depois que você conferiu; confira de novo',
          },
        }
        return
      }
      const agora = new Date().toISOString()
      const quem = auth.getString('email') || auth.id
      t.set('estado', 'autorizada')
      t.set('payload_hash', hashAtual)
      t.set('autorizada_por', quem)
      t.set('autorizada_em', agora)
      tx.save(t)
      chave.set('ligada', true)
      chave.set('escopo', transacaoId)
      chave.set('autorizada_por', quem)
      chave.set('autorizada_em', agora)
      tx.save(chave)
      resultado = {
        http: 200,
        corpo: { ok: true, estado: 'autorizada', transacao_id: transacaoId, autorizada_em: agora },
      }
    })
    return e.json(resultado.http, resultado.corpo)
  },
  $apis.requireAuth(),
)
