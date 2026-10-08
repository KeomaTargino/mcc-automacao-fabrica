// pocketbase/migrations/0008_restaura_estado_original.js — SPEC-1-001 CA-A4 (fechamento)
// Reativa o perfil do usuário-teste-PCP: estado final idêntico ao original (ativo).
migrate(
  (app) => {
    const usuario = app.findAuthRecordByEmail('users', 'usuario-teste-pcp@pcp.local')
    const perfil = app.findFirstRecordByData('pcp_perfis', 'usuario', usuario.id)
    perfil.set('ativo', true)
    app.save(perfil)
  },
  (app) => {
    const usuario = app.findAuthRecordByEmail('users', 'usuario-teste-pcp@pcp.local')
    const perfil = app.findFirstRecordByData('pcp_perfis', 'usuario', usuario.id)
    perfil.set('ativo', false)
    app.save(perfil)
  },
)
