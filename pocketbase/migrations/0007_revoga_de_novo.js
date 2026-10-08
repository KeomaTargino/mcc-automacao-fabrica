// pocketbase/migrations/0007_revoga_de_novo.js — par da 0006 (prova CA-A4, fase 3)
// Desativa o perfil NOVAMENTE: agora há um token válido emitido com perfil ativo
// (/tmp não é usado pelo servidor; o token está em posse do executor de prova).
migrate(
  (app) => {
    const usuario = app.findAuthRecordByEmail('users', 'usuario-teste-pcp@pcp.local')
    const perfil = app.findFirstRecordByData('pcp_perfis', 'usuario', usuario.id)
    perfil.set('ativo', false)
    app.save(perfil)
  },
  (app) => {
    const usuario = app.findAuthRecordByEmail('users', 'usuario-teste-pcp@pcp.local')
    const perfil = app.findFirstRecordByData('pcp_perfis', 'usuario', usuario.id)
    perfil.set('ativo', true)
    app.save(perfil)
  },
)
