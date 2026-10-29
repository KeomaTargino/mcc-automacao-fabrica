// pocketbase/hooks/pcp_alerta_assumir.js — SPEC-3-011 CA-3-33/34
// POST /backend/v1/pcp/alertas/assumir { id, versao_esperada }
// Quem cuida da área do alerta assume: aberto → em análise, com a pessoa como responsável. Exige a ação
// tratar_alerta E a área do alerta (planejamento: estoque, produção, divergência; compras: compra e
// preço; faturamento: pedido; as três áreas = gestão). Qualquer falha de acesso — sem perfil, sem a ação,
// outra área, alerta inexistente — recebe a MESMA resposta 403, sem pistas. Duas pessoas ao mesmo
// tempo: uma consegue, a outra recebe 409 (versão esperada, em transação). Só registra: não executa nada.
routerAdd(
  'POST',
  '/backend/v1/pcp/alertas/assumir',
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
    let alerta = null
    try {
      alerta = $app.findRecordById('pcp_alertas', String(b.id || ''))
    } catch (_) {}
    const AREA = {
      estoque: 'planejamento',
      producao: 'planejamento',
      divergencia: 'planejamento',
      compra: 'compras',
      preco: 'compras',
      pedido: 'faturamento',
    }
    const areas = perfil ? perfil.getStringSlice('areas') : []
    const gestao =
      areas.indexOf('planejamento') !== -1 &&
      areas.indexOf('compras') !== -1 &&
      areas.indexOf('faturamento') !== -1
    const area = alerta ? AREA[alerta.getString('tipo')] : null
    if (
      !perfil ||
      !perfil.getBool('ativo') ||
      !Array.isArray(acoes) ||
      acoes.indexOf('tratar_alerta') === -1 ||
      !alerta ||
      !area ||
      !(gestao || areas.indexOf(area) !== -1)
    ) {
      return e.forbiddenError('sem_permissao')
    }
    const quem = auth.getString('email') || auth.id
    let resposta = null
    try {
      $app.runInTransaction((tx) => {
        const a = tx.findRecordById('pcp_alertas', alerta.id)
        if (Number(a.get('versao') || 1) !== Number(b.versao_esperada || 0)) {
          resposta = {
            http: 409,
            corpo: {
              erro: 'conflito_de_versao',
              motivo: 'outra pessoa mexeu neste alerta; recarregue',
            },
          }
          return
        }
        if ((a.getString('estado') || 'aberto') !== 'aberto') {
          resposta = { http: 409, corpo: { erro: 'estado_nao_permite' } }
          return
        }
        const agora = new Date().toISOString()
        a.set('estado', 'em_analise')
        a.set('responsavel', quem)
        a.set('versao', Number(a.get('versao') || 1) + 1)
        tx.save(a)
        const h = new Record(tx.findCollectionByNameOrId('pcp_alertas_historico'))
        h.set('alerta_id', a.id)
        h.set('evento', 'assumido')
        h.set('autor', quem)
        h.set('em', agora)
        h.set('detalhe', '')
        tx.save(h)
        resposta = {
          http: 200,
          corpo: { ok: true, id: a.id, estado: 'em_analise', versao: Number(a.get('versao')) },
        }
      })
    } catch (_) {
      return e.json(409, {
        erro: 'conflito_de_versao',
        motivo: 'outra pessoa mexeu neste alerta ao mesmo tempo; recarregue',
      })
    }
    return e.json(resposta.http, resposta.corpo)
  },
  $apis.requireAuth(),
)
