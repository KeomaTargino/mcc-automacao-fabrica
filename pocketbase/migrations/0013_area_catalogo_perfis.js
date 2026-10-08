// 0013_area_catalogo_perfis.js — SPEC-1-004: área 'catalogo' no PERFIL do usuário de teste
// (as áreas que o servidor consulta vivem em pcp_perfis.areas — 0012 adicionou em users
// por engano; esta migration corrige no lugar certo; reversível, só fixture de teste)
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
    if (areas.indexOf('catalogo') === -1) {
      areas.push('catalogo')
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
    const idx = areas.indexOf('catalogo')
    if (idx !== -1) {
      areas.splice(idx, 1)
      perfil.set('areas', areas)
      app.save(perfil)
    }
  },
)
