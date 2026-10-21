// pocketbase/migrations/0028_keoma_conferencias.js — 2c4a9b7e/d77447ab (21/10/2026)
// Decisão do owner (14:38): testes reais da dupla conferência com a conta da Keoma.
// Keoma ganha: ações conferir_expedicao + conferir_camara; ponto camara_fria
// (produto_acabado e expedicao já vieram na 0027). Idempotente e reversível.
migrate(
  (app) => {
    const rec = app.findAuthRecordByEmail('_pb_users_auth_', 'keoma.targino@mccfranchising.com.br')
    let perfil = null
    try {
      perfil = app.findFirstRecordByFilter('pcp_perfis', 'usuario = {:u}', { u: rec.id })
    } catch (_) {}
    if (!perfil) return
    const acoes = perfil.get('acoes') || []
    const pontos = perfil.get('pontos') || []
    const add = (arr, v) => (arr.indexOf(v) === -1 ? arr.concat([v]) : arr)
    const novasAcoes = add(add(acoes, 'conferir_expedicao'), 'conferir_camara')
    const novosPontos = add(pontos, 'camara_fria')
    if (JSON.stringify(novasAcoes) !== JSON.stringify(acoes)) perfil.set('acoes', novasAcoes)
    if (JSON.stringify(novosPontos) !== JSON.stringify(pontos)) perfil.set('pontos', novosPontos)
    app.save(perfil)
  },
  (app) => {
    const rec = app.findAuthRecordByEmail('_pb_users_auth_', 'keoma.targino@mccfranchising.com.br')
    let perfil = null
    try {
      perfil = app.findFirstRecordByFilter('pcp_perfis', 'usuario = {:u}', { u: rec.id })
    } catch (_) {}
    if (!perfil) return
    const acoes = (perfil.get('acoes') || []).filter(
      (a) => a !== 'conferir_expedicao' && a !== 'conferir_camara',
    )
    const pontos = (perfil.get('pontos') || []).filter((p) => p !== 'camara_fria')
    perfil.set('acoes', acoes)
    perfil.set('pontos', pontos)
    app.save(perfil)
  },
)
