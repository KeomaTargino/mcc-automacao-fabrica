// pocketbase/migrations/0009_pode_atualizar_fontes_teste.js — SPEC-1-002 CA-O1/O2
// Habilita pode_atualizar_fontes no FIXTURE de teste PCP (conta sintética, não concessão real).
migrate(
  (app) => {
    const usuario = app.findAuthRecordByEmail('users', 'usuario-teste-pcp@pcp.local')
    const perfil = app.findFirstRecordByData('pcp_perfis', 'usuario', usuario.id)
    perfil.set('pode_atualizar_fontes', true)
    app.save(perfil)
  },
  (app) => {
    const usuario = app.findAuthRecordByEmail('users', 'usuario-teste-pcp@pcp.local')
    const perfil = app.findFirstRecordByData('pcp_perfis', 'usuario', usuario.id)
    perfil.set('pode_atualizar_fontes', false)
    app.save(perfil)
  },
)
