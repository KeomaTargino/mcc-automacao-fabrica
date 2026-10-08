// 0014_area_painel_teste.js — SPEC-1-005: área 'painel' no PERFIL do usuário de teste
// (áreas vivem em pcp_perfis.areas; reversível, só fixture de teste)
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
    if (areas.indexOf('painel') === -1) {
      areas.push('painel')
      perfil.set('areas', areas)
      app.save(perfil)
    }
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
    const idx = areas.indexOf('painel')
    if (idx !== -1) {
      areas.splice(idx, 1)
      perfil.set('areas', areas)
      app.save(perfil)
    }
  },
)
