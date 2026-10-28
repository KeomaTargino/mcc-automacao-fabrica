// pocketbase/hooks/pcp_pedido_liberar.js — SPEC-3-009 CA-3-27
// POST /backend/v1/pcp/faturamento/pedido/liberar { pedido_id, hash_visto, versao_esperada }
// Libera para faturar um pedido APTO. Exige liberar_faturamento E a área faturamento (403 sem pistas).
// O servidor só libera o que a fila marcou como apto: o selo (hash do conteúdo) gravado pela leitura da
// fila precisa ser igual ao que a pessoa viu (hash_visto) e ter no máximo 5 minutos; senão 409 e a
// pessoa recarrega a fila. Grava autor e hora. Qualquer mudança depois desfaz a liberação (fila, frete
// e volumes). Libera para o faturamento emitir a nota no Omie: o sistema não emite nota.
routerAdd(
  'POST',
  '/backend/v1/pcp/faturamento/pedido/liberar',
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
      acoes.indexOf('liberar_faturamento') === -1 ||
      perfil.getStringSlice('areas').indexOf('faturamento') === -1
    ) {
      return e.forbiddenError('sem_permissao')
    }
    const b = e.requestInfo().body || {}
    const pedido = String(b.pedido_id || '').trim()
    const visto = String(b.hash_visto || '')
    if (!pedido || !visto) return e.json(422, { erro: 'pedido_e_hash_visto_obrigatorios' })
    let resposta = null
    try {
      $app.runInTransaction((tx) => {
        let prep = null
        try {
          prep = tx.findFirstRecordByFilter('pcp_preparacao_pedido', 'pedido_id = {:p}', {
            p: pedido,
          })
        } catch (_) {}
        if (!prep || Number(prep.get('versao') || 0) !== Number(b.versao_esperada || 0)) {
          resposta = {
            http: 409,
            corpo: { erro: 'conflito_de_versao', motivo: 'o pedido mudou; recarregue a fila' },
          }
          return
        }
        if (prep.getString('liberacao_hash') !== '') {
          resposta = { http: 409, corpo: { erro: 'ja_liberado' } }
          return
        }
        const selo = prep.getString('apto_hash')
        const fresco =
          prep.getString('apto_em') &&
          Date.now() - new Date(prep.getString('apto_em')).getTime() <= 300000
        if (!selo || selo !== visto || !fresco) {
          resposta = {
            http: 409,
            corpo: {
              erro: 'nao_esta_apto',
              motivo: 'o pedido não está apto na leitura mais recente; recarregue a fila',
            },
          }
          return
        }
        const agora = new Date().toISOString()
        const quem = auth.getString('email') || auth.id
        prep.set('liberacao_hash', selo)
        prep.set('liberado_por', quem)
        prep.set('liberado_em', agora)
        prep.set('versao', Number(prep.get('versao') || 0) + 1)
        tx.save(prep)
        const ev = new Record(tx.findCollectionByNameOrId('pcp_liberacoes_faturamento'))
        ev.set('pedido_id', pedido)
        ev.set('evento', 'liberada')
        ev.set('hash', selo)
        ev.set('por', quem)
        ev.set('em', agora)
        tx.save(ev)
        resposta = {
          http: 200,
          corpo: { ok: true, pedido_id: pedido, liberado_por: quem, liberado_em: agora },
        }
      })
    } catch (_) {
      return e.json(409, {
        erro: 'conflito_de_versao',
        motivo: 'outra alteração chegou ao mesmo tempo; recarregue',
      })
    }
    return e.json(resposta.http, resposta.corpo)
  },
  $apis.requireAuth(),
)
