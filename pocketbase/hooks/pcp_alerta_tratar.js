// pocketbase/hooks/pcp_alerta_tratar.js — SPEC-3-011 CA-3-33 (RN-01)
// POST /backend/v1/pcp/alertas/tratar { id, versao_esperada, acao, texto }
// O RESPONSÁVEL trata o alerta em análise REGISTRANDO a ação tomada: compra_solicitada, ordem_reprogramada,
// fornecedor_contatado, pedido_liberado, risco_aceito, alerta_indevido (exige motivo), outra (exige texto).
// Sem ação registrada: 422. Grava autor e hora; o histórico só recebe inclusões. Mesmo controle de acesso
// de assumir (ação tratar_alerta E a área do alerta; recusa única 403). Tratar só REGISTRA: não compra,
// não reprograma, não publica ordem, não altera parâmetro e não gera ação financeira. Se a condição
// voltar, a próxima rodada abre um alerta novo ligado a este.
routerAdd(
  'POST',
  '/backend/v1/pcp/alertas/tratar',
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
    const ACOES = [
      'compra_solicitada',
      'ordem_reprogramada',
      'fornecedor_contatado',
      'pedido_liberado',
      'risco_aceito',
      'alerta_indevido',
      'outra',
    ]
    const acao = String(b.acao || '')
    const texto = String(b.texto || '').trim()
    const motivos = []
    if (ACOES.indexOf(acao) === -1) motivos.push('registre a ação tomada')
    else if (acao === 'alerta_indevido' && texto.length < 3)
      motivos.push('alerta indevido exige o motivo')
    else if (acao === 'outra' && texto.length < 3) motivos.push('descreva a ação')
    if (motivos.length > 0) return e.json(422, { erro: 'dados_invalidos', motivos: motivos })
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
        if (a.getString('estado') !== 'em_analise' || a.getString('responsavel') !== quem) {
          resposta = {
            http: 409,
            corpo: { erro: 'estado_nao_permite', motivo: 'só quem assumiu o alerta o trata' },
          }
          return
        }
        const agora = new Date().toISOString()
        a.set('estado', 'tratado')
        a.set('acao', acao)
        a.set('acao_texto', texto)
        a.set('tratado_por', quem)
        a.set('tratado_em', agora)
        a.set('versao', Number(a.get('versao') || 1) + 1)
        tx.save(a)
        const h = new Record(tx.findCollectionByNameOrId('pcp_alertas_historico'))
        h.set('alerta_id', a.id)
        h.set('evento', 'tratado')
        h.set('autor', quem)
        h.set('em', agora)
        h.set('detalhe', acao + (texto ? ': ' + texto : ''))
        tx.save(h)
        resposta = {
          http: 200,
          corpo: {
            ok: true,
            id: a.id,
            estado: 'tratado',
            tratado_por: quem,
            tratado_em: agora,
            acao: acao,
          },
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
