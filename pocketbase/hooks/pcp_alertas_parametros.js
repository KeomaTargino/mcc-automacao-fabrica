// pocketbase/hooks/pcp_alertas_parametros.js — SPEC-3-010 CA-3-30
// GET /backend/v1/pcp/alertas/parametros — parâmetros de alerta em versão aprovada (maior versão), as
// famílias e as lacunas (parâmetro que falta = aquele alerta não é calculado). Nenhum valor padrão.
// Qualquer conta ativa com área de trabalho consulta; só editar_parametros altera (outras rotas).
routerAdd(
  'GET',
  '/backend/v1/pcp/alertas/parametros',
  (e) => {
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Sessão ausente ou expirada.')
    let perfil = null
    try {
      perfil = $app.findFirstRecordByFilter('pcp_perfis', 'usuario = {:u}', { u: auth.id })
    } catch (_) {}
    if (!perfil || !perfil.getBool('ativo') || perfil.getStringSlice('areas').length === 0) {
      return e.forbiddenError('sem_permissao')
    }
    let acoes = []
    try {
      acoes = JSON.parse(perfil.getString('acoes') || '[]') || []
    } catch (_) {}
    let vigente = null
    const lista = $app.findRecordsByFilter('pcp_parametros_alerta', '', '-versao', 1, 0)
    if (lista.length > 0) {
      let parametros = null
      try {
        parametros = JSON.parse(lista[0].getString('parametros') || 'null')
      } catch (_) {}
      vigente = {
        versao: Number(lista[0].get('versao') || 0),
        aprovador: lista[0].getString('aprovador'),
        aprovado_em: lista[0].getString('aprovado_em'),
        parametros: parametros,
      }
    }
    const familias = {}
    for (const r of $app.findRecordsByFilter('pcp_familias', '', 'familia', 20000, 0)) {
      const f = r.getString('familia')
      if (!familias[f]) familias[f] = []
      familias[f].push(r.getString('produto'))
    }
    const lacunas = $app
      .findRecordsByFilter('pcp_alertas_lacunas', '', 'regra,item', 5000, 0)
      .map((r) => ({
        regra: r.getString('regra'),
        item: r.getString('item'),
        campo: r.getString('campo'),
        motivo: r.getString('motivo'),
      }))
    return e.json(200, {
      vigente: vigente,
      familias: familias,
      lacunas: lacunas,
      pode_editar: acoes.indexOf('editar_parametros') !== -1,
      origem: vigente ? 'aprovada' : 'sem_parametros',
    })
  },
  $apis.requireAuth(),
)
