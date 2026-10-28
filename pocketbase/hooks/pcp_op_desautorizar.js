// pocketbase/hooks/pcp_op_desautorizar.js — SPEC-3-002 CA-3-07
// POST /backend/v1/pcp/omie/op/desautorizar — o dono desfaz a autorização ANTES do envio:
// a transação volta a 'preparada' e a chave omie_op_escrita desliga. Depois de enviada (ou
// enviando) não desfaz nada: efeito gravado exige decisão humana. Só a ação do dono.
routerAdd(
  'POST',
  '/backend/v1/pcp/omie/op/desautorizar',
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
    const transacaoId = String((e.requestInfo().body || {}).transacao_id || '')
    if (!transacaoId) return e.badRequestError('transacao_id_obrigatorio')
    let resultado = null
    $app.runInTransaction((tx) => {
      let t = null
      let chave = null
      try {
        t = tx.findFirstRecordByFilter('pcp_transacoes_omie', 'transacao_id = {:t}', {
          t: transacaoId,
        })
        chave = tx.findFirstRecordByFilter('pcp_chaves_escrita', 'chave = {:c}', {
          c: 'omie_op_escrita',
        })
      } catch (_) {}
      if (!t || !chave) {
        resultado = { http: 404, corpo: { erro: 'transacao_ou_chave_inexistente' } }
        return
      }
      if (t.getString('estado') !== 'autorizada') {
        resultado = {
          http: 409,
          corpo: {
            erro: 'ja_enviada',
            motivo:
              'transação em estado ' + t.getString('estado') + ': só autorizada pode ser desfeita',
          },
        }
        return
      }
      t.set('estado', 'preparada')
      t.set('payload_hash', '')
      t.set('autorizada_por', '')
      t.set('autorizada_em', '')
      tx.save(t)
      if (chave.getString('escopo') === transacaoId) {
        chave.set('ligada', false)
        chave.set('escopo', '')
        tx.save(chave)
      }
      resultado = { http: 200, corpo: { ok: true, estado: 'preparada', transacao_id: transacaoId } }
    })
    return e.json(resultado.http, resultado.corpo)
  },
  $apis.requireAuth(),
)
