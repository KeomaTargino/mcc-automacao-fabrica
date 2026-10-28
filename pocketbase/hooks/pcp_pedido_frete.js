// pocketbase/hooks/pcp_pedido_frete.js — SPEC-3-009 CA-3-26
// POST /backend/v1/pcp/faturamento/pedido/frete { pedido_id, modalidade, transportadora, versao_esperada }
// Define a modalidade de frete DE UM pedido. Não existe frete padrão: sem modalidade escolhida o pedido
// fica bloqueado ("frete não definido"). Exige preparar_pedido E a área faturamento (403 sem pistas).
// Versão esperada (0 na primeira vez); 409 se outra alteração chegou antes. Mudança depois da liberação
// desfaz a liberação (registrada). Regras de src/lib/pcp/preparacao-pedido.ts.
routerAdd(
  'POST',
  '/backend/v1/pcp/faturamento/pedido/frete',
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
      acoes.indexOf('preparar_pedido') === -1 ||
      perfil.getStringSlice('areas').indexOf('faturamento') === -1
    ) {
      return e.forbiddenError('sem_permissao')
    }
    const b = e.requestInfo().body || {}
    const pedido = String(b.pedido_id || '').trim()
    const modalidade = String(b.modalidade || '')
    const MODS = [
      'CIF',
      'FOB',
      'TERCEIROS',
      'PROPRIO_REMETENTE',
      'PROPRIO_DESTINATARIO',
      'SEM_FRETE',
    ]
    if (!pedido) return e.json(422, { erro: 'dados_invalidos', motivos: ['pedido obrigatório'] })
    if (MODS.indexOf(modalidade) === -1) {
      return e.json(422, {
        erro: 'dados_invalidos',
        motivos: ['escolha a modalidade de frete do pedido'],
      })
    }
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
        const desfeita = prep.getString('liberacao_hash') !== ''
        if (desfeita) {
          const ev = new Record(tx.findCollectionByNameOrId('pcp_liberacoes_faturamento'))
          ev.set('pedido_id', pedido)
          ev.set('evento', 'desfeita')
          ev.set('hash', prep.getString('liberacao_hash'))
          ev.set('por', auth.getString('email') || auth.id)
          ev.set('em', agora)
          ev.set('motivo', 'frete alterado depois da liberação')
          tx.save(ev)
        }
        prep.set('frete_modalidade', modalidade)
        prep.set('transportadora', String(b.transportadora || '').trim())
        prep.set('liberacao_hash', '')
        prep.set('liberado_por', '')
        prep.set('versao', atual + 1)
        prep.set('alterado_por', auth.getString('email') || auth.id)
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
