// pocketbase/migrations/0011_area_pedidos_teste.js — SPEC-1-003
// Adiciona a área 'pedidos' ao FIXTURE de teste PCP (conta sintética; não é concessão real).
migrate(
  (app) => {
    const usuario = app.findAuthRecordByEmail('users', 'usuario-teste-pcp@pcp.local')
    const perfil = app.findFirstRecordByData('pcp_perfis', 'usuario', usuario.id)
    const areas = perfil.getStringSlice('areas')
    if (areas.indexOf('pedidos') === -1) {
      areas.push('pedidos')
      perfil.set('areas', areas)
      app.save(perfil)
    }
  },
  (app) => {
    const usuario = app.findAuthRecordByEmail('users', 'usuario-teste-pcp@pcp.local')
    const perfil = app.findFirstRecordByData('pcp_perfis', 'usuario', usuario.id)
    const areas = perfil.getStringSlice('areas')
    const i = areas.indexOf('pedidos')
    if (i !== -1) {
      areas.splice(i, 1)
      perfil.set('areas', areas)
      app.save(perfil)
    }
  },
)
