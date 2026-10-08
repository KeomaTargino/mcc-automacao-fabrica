// pocketbase/migrations/0005_revoga_teste_temp.js — SPEC-1-001 CA-A4 (prova de revogação)
// Desativa temporariamente o perfil do usuário-teste-PCP para provar que a revogação
// durante uma sessão válida elimina o acesso na PRÓXIMA consulta (sem esperar logout).
// Estado original é restaurado pela migration 0006. Nenhuma conta real é afetada.
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
