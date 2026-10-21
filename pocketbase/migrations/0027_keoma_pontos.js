// pocketbase/migrations/0027_keoma_pontos.js — 2c4a9b7e (21/10/2026)
// Matriz v2 aprovada pelo owner ("aprovo", 21/10 14:03): Keoma Targino ganha os
// pontos produto_acabado e expedicao (fluxograma oficial: ela supervisiona 8-11).
// Idempotente: só atualiza se os pontos divergirem. Reversível: restaura [].
migrate(
  (app) => {
    const rec = app.findAuthRecordByEmail('_pb_users_auth_', 'keoma.targino@mccfranchising.com.br')
    let perfil = null
    try {
      perfil = app.findFirstRecordByFilter('pcp_perfis', 'usuario = {:u}', { u: rec.id })
    } catch (_) {}
    if (!perfil) return
    const atuais = JSON.stringify(perfil.get('pontos') || [])
    const novos = JSON.stringify(['produto_acabado', 'expedicao'])
    if (atuais !== novos) {
      perfil.set('pontos', ['produto_acabado', 'expedicao'])
      app.save(perfil)
    }
  },
  (app) => {
    const rec = app.findAuthRecordByEmail('_pb_users_auth_', 'keoma.targino@mccfranchising.com.br')
    let perfil = null
    try {
      perfil = app.findFirstRecordByFilter('pcp_perfis', 'usuario = {:u}', { u: rec.id })
    } catch (_) {}
    if (!perfil) return
    perfil.set('pontos', [])
    app.save(perfil)
  },
)
