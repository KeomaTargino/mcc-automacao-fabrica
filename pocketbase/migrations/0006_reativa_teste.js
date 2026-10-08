// pocketbase/migrations/0006_reativa_teste.js — par da 0005 (prova CA-A4, fase 2)
// Reativa o perfil do usuário-teste-PCP para emitir um token com perfil ATIVO.
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
