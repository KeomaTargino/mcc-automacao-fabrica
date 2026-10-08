// 0012_area_catalogo_teste.js — SPEC-1-004: área 'catalogo' no usuário de teste
// (mesma mecânica da 0011; reversível, só fixture de teste)
migrate(
  (app) => {
    const u = app.findFirstRecordByFilter('users', 'email = {:e}', {
      e: 'usuario-teste-pcp@pcp.local',
    })
    const areas = u.getStringSlice('areas')
    if (areas.indexOf('catalogo') === -1) {
      areas.push('catalogo')
      u.set('areas', areas)
      app.save(u)
    }
  },
  (app) => {
    const u = app.findFirstRecordByFilter('users', 'email = {:e}', {
      e: 'usuario-teste-pcp@pcp.local',
    })
    const areas = u.getStringSlice('areas')
    const idx = areas.indexOf('catalogo')
    if (idx !== -1) {
      areas.splice(idx, 1)
      u.set('areas', areas)
      app.save(u)
    }
  },
)
