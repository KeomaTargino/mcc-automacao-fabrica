// 0015_areas_painel_teste.js — SPEC-1-005: áreas 'producao' e 'compras' no PERFIL do
// usuário de teste, para PROVAR o estado explícito de bloco sem fonte na Fase 1
// (fonte_nao_integrada_na_fase_1 — bloqueado, nunca declarado integrado).
migrate(
  (app) => {
    const u = app.findFirstRecordByFilter('users', 'email = {:e}', {
      e: 'usuario-teste-pcp@pcp.local',
    })
    let perfil = null
    try {
      perfil = app.findFirstRecordByFilter('pcp_perfis', 'usuario = {:u}', { u: u.id })
    } catch (_) {}
    if (!perfil) return
    const areas = perfil.getStringSlice('areas')
    if (areas.indexOf('producao') === -1) areas.push('producao')
    if (areas.indexOf('compras') === -1) areas.push('compras')
    perfil.set('areas', areas)
    app.save(perfil)
  },
  (app) => {
    const u = app.findFirstRecordByFilter('users', 'email = {:e}', {
      e: 'usuario-teste-pcp@pcp.local',
    })
    let perfil = null
    try {
      perfil = app.findFirstRecordByFilter('pcp_perfis', 'usuario = {:u}', { u: u.id })
    } catch (_) {}
    if (!perfil) return
    const areas = perfil.getStringSlice('areas')
    const i1 = areas.indexOf('producao')
    if (i1 !== -1) areas.splice(i1, 1)
    const i2 = areas.indexOf('compras')
    if (i2 !== -1) areas.splice(i2, 1)
    perfil.set('areas', areas)
    app.save(perfil)
  },
)
