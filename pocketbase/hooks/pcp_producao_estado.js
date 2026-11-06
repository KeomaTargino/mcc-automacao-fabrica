// pocketbase/hooks/pcp_producao_estado.js — patch de 02/11/2026
// GET /backend/v1/pcp/producao/estado[?op_id=...] — o que está guardado no servidor: programação mais
// recente (versão e ordens), e, por ordem, os apontamentos, as conferências, as aprovações e a ordem
// preparada para o Omie. Só leitura. Aceita quem tem a ação publicar_programacao, aprovar_consolidacao,
// conferir_expedicao ou conferir_camara, ou algum ponto de produção no perfil (403 sem pistas).
routerAdd(
  'GET',
  '/backend/v1/pcp/producao/estado',
  (e) => {
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Sessão ausente ou expirada.')
    let perfil = null
    try {
      perfil = $app.findFirstRecordByFilter('pcp_perfis', 'usuario = {:u}', { u: auth.id })
    } catch (_) {}
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
    const temAcao = [
      'publicar_programacao',
      'aprovar_consolidacao',
      'conferir_expedicao',
      'conferir_camara',
    ].some((a) => Array.isArray(acoes) && acoes.indexOf(a) !== -1)
    const areasEstado = perfil ? perfil.getStringSlice('areas') : []
    const temArea = ['planejamento', 'apontar_producao', 'conferir_expedicao', 'painel'].some(
      (a) => areasEstado.indexOf(a) !== -1,
    )
    if (!perfil || !perfil.getBool('ativo') || !temArea || (!temAcao && pontos.length === 0)) {
      return e.forbiddenError('sem_permissao')
    }
    const opId = String(e.request.url.query().get('op_id') || '').trim()
    const progs = $app.findRecordsByFilter('pcp_programacoes', '', '-versao', 1, 0)
    let programacao = null
    if (progs.length > 0) {
      let ops = []
      try {
        ops = JSON.parse(progs[0].getString('ops') || '[]') || []
      } catch (_) {}
      programacao = {
        versao: Number(progs[0].get('versao')),
        publicada_por: progs[0].getString('publicada_por'),
        publicada_em: progs[0].getString('publicada_em'),
        ops: ops,
      }
    }
    const filtro = opId ? 'op_id = {:o}' : ''
    const params = opId ? { o: opId } : {}
    const eventos = $app
      .findRecordsByFilter('pcp_apontamentos', filtro, 'created', 2000, 0, params)
      .map((x) => ({
        evento_id: x.getString('evento_id'),
        op_id: x.getString('op_id'),
        ponto: x.getString('ponto'),
        tipo: x.getString('tipo'),
        item: x.getString('item'),
        quantidade: Number(x.get('quantidade')),
        unidade: x.getString('unidade'),
        motivo: x.getString('motivo') || null,
        retifica: x.getString('retifica') || null,
        autor: x.getString('autor'),
      }))
    const conferencias = $app
      .findRecordsByFilter('pcp_conferencias_op', filtro, 'created', 1000, 0, params)
      .map((x) => ({
        registro_id: x.getString('registro_id'),
        op_id: x.getString('op_id'),
        etapa: x.getString('etapa'),
        quantidade: Number(x.get('quantidade')),
        unidade: x.getString('unidade'),
        autor: x.getString('autor'),
      }))
    const aprovacoes = $app
      .findRecordsByFilter('pcp_aprovacoes_consolidacao', filtro, '-created', 500, 0, params)
      .map((x) => ({
        aprovacao_id: x.getString('aprovacao_id'),
        op_id: x.getString('op_id'),
        quantidade_final: Number(x.get('quantidade_final')),
        motivo: x.getString('motivo'),
        estado: x.getString('estado'),
        aprovador: x.getString('aprovador'),
      }))
    const ordens = $app
      .findRecordsByFilter('pcp_transacoes_omie', filtro, '-created', 500, 0, params)
      .map((x) => ({
        transacao_id: x.getString('transacao_id'),
        op_id: x.getString('op_id'),
        estado: x.getString('estado'),
        quantidade: Number(x.get('quantidade')),
      }))
    return e.json(200, {
      programacao: programacao,
      eventos: eventos,
      conferencias: conferencias,
      aprovacoes: aprovacoes,
      ordens: ordens,
    })
  },
  $apis.requireAuth(),
)
