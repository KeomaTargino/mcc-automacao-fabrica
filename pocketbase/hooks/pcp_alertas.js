// pocketbase/hooks/pcp_alertas.js — SPEC-3-010 CA-3-31/32
// GET /backend/v1/pcp/alertas — os alertas abertos, com tipo, item, gravidade, regra, os números usados e a
// hora do dado, mais as lacunas e a hora da última rodada. Só leitura. Conta ativa com alguma área de
// trabalho consulta (o recorte por área e o tratamento são da SPEC-3-011). Alerta só informa: nenhuma
// ação é oferecida por esta rota.
routerAdd(
  'GET',
  '/backend/v1/pcp/alertas',
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
    const alertas = $app
      .findRecordsByFilter('pcp_alertas', "estado = 'aberto'", '-atualizado_em', 500, 0)
      .map((r) => {
        let valores = {}
        try {
          valores = JSON.parse(r.getString('valores') || '{}') || {}
        } catch (_) {}
        return {
          chave: r.getString('chave'),
          tipo: r.getString('tipo'),
          item: r.getString('item'),
          referencia: r.getString('referencia'),
          gravidade: r.getString('gravidade'),
          regra: r.getString('regra'),
          valores: valores,
          versao_parametros: Number(r.get('versao_parametros') || 0),
          aberto_em: r.getString('aberto_em'),
          atualizado_em: r.getString('atualizado_em'),
          dado_em: r.getString('dado_em'),
          fonte_desatualizada: r.getBool('fonte_desatualizada'),
          atualizacoes: Number(r.get('atualizacoes') || 0),
        }
      })
    const lacunas = $app
      .findRecordsByFilter('pcp_alertas_lacunas', '', 'regra,item', 5000, 0)
      .map((r) => ({
        regra: r.getString('regra'),
        item: r.getString('item'),
        campo: r.getString('campo'),
        motivo: r.getString('motivo'),
      }))
    let ultima = null
    for (const a of alertas) if (!ultima || a.atualizado_em > ultima) ultima = a.atualizado_em
    return e.json(200, {
      alertas: alertas,
      lacunas: lacunas,
      ultima_rodada: ultima,
      pode_rodar: acoes.indexOf('editar_parametros') !== -1,
    })
  },
  $apis.requireAuth(),
)
