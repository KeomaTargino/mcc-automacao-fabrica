// pocketbase/hooks/pcp_pedido_volumes.js — SPEC-3-009 CA-3-26
// POST /backend/v1/pcp/faturamento/pedido/volumes { pedido_id, quantidade, peso_bruto, versao_esperada }
// A EXPEDIÇÃO registra os volumes contados fisicamente. Sem cubagem: só a quantidade (inteira, 1 a 9999)
// e, se o pedido foi pesado, o peso bruto. Exige conferir_volumes E a área faturamento (403 sem pistas).
// Cada contagem fica no histórico (pcp_volumes); a linha do pedido guarda a atual. Mudança depois da
// liberação desfaz a liberação (registrada). Regras de src/lib/pcp/preparacao-pedido.ts.
routerAdd(
  'POST',
  '/backend/v1/pcp/faturamento/pedido/volumes',
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
      acoes.indexOf('conferir_volumes') === -1 ||
      perfil.getStringSlice('areas').indexOf('faturamento') === -1
    ) {
      return e.forbiddenError('sem_permissao')
    }
    const b = e.requestInfo().body || {}
    const pedido = String(b.pedido_id || '').trim()
    const qtd = Number(b.quantidade)
    const peso =
      b.peso_bruto === null || b.peso_bruto === undefined || b.peso_bruto === ''
        ? null
        : Number(b.peso_bruto)
    const motivos = []
    if (!pedido) motivos.push('pedido obrigatório')
    if (!isFinite(qtd) || Math.floor(qtd) !== qtd || qtd < 1 || qtd > 9999)
      motivos.push('a quantidade de volumes precisa ser um número inteiro de 1 a 9999')
    if (peso !== null && (!isFinite(peso) || peso <= 0))
      motivos.push('peso, se informado, precisa ser maior que zero')
    if (motivos.length > 0) return e.json(422, { erro: 'dados_invalidos', motivos: motivos })
    let resposta = null
    try {
      $app.runInTransaction((tx) => {
        let prep = null
        try {
          prep = tx.findFirstRecordByFilter('pcp_preparacao_pedido', 'pedido_id = {:p}', {
            p: pedido,
          })
        } catch (_) {}
        const atual = prep ? Number(prep.get('versao') || 0) : 0
        if (atual !== Number(b.versao_esperada || 0)) {
          resposta = {
            http: 409,
            corpo: {
              erro: 'conflito_de_versao',
              motivo: 'outra alteração chegou antes; recarregue',
            },
          }
          return
        }
        if (!prep) {
          prep = new Record(tx.findCollectionByNameOrId('pcp_preparacao_pedido'))
          prep.set('pedido_id', pedido)
        }
        const agora = new Date().toISOString()
        const quem = auth.getString('email') || auth.id
        const desfeita = prep.getString('liberacao_hash') !== ''
        if (desfeita) {
          const ev = new Record(tx.findCollectionByNameOrId('pcp_liberacoes_faturamento'))
          ev.set('pedido_id', pedido)
          ev.set('evento', 'desfeita')
          ev.set('hash', prep.getString('liberacao_hash'))
          ev.set('por', quem)
          ev.set('em', agora)
          ev.set('motivo', 'volumes alterados depois da liberação')
          tx.save(ev)
        }
        const h = new Record(tx.findCollectionByNameOrId('pcp_volumes'))
        h.set('pedido_id', pedido)
        h.set('quantidade', qtd)
        h.set('peso_bruto', peso === null ? 0 : peso)
        h.set('conferido_por', quem)
        h.set('conferido_em', agora)
        tx.save(h)
        prep.set('volumes_quantidade', qtd)
        prep.set('peso_bruto', peso === null ? 0 : peso)
        prep.set('volumes_por', quem)
        prep.set('volumes_em', agora)
        prep.set('liberacao_hash', '')
        prep.set('liberado_por', '')
        prep.set('versao', atual + 1)
        prep.set('alterado_por', quem)
        tx.save(prep)
        resposta = {
          http: 200,
          corpo: { ok: true, pedido_id: pedido, versao: atual + 1, liberacao_desfeita: desfeita },
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
