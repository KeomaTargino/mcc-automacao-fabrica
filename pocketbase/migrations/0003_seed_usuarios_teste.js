// pocketbase/migrations/0003_seed_usuarios_teste.js — SPEC-1-001 CA-A2/A3 (Plano B)
// Massa sintética sem senhas publicadas: a senha comum vem do secret PCP_TEST_PASSWORD.
// Perfis sintéticos (ver 07-sistemas/pcp/acessos.md) — NÃO são cargos aprovados.
migrate(
  (app) => {
    const senha = $secrets.get('PCP_TEST_PASSWORD')
    if (!senha || senha.length < 8) {
      throw new Error('PCP_TEST_PASSWORD ausente ou curta (min 8)')
    }
    const usuarios = [
      { email: 'usuario-teste-pcp@pcp.local', name: 'Usuario Teste PCP' },
      { email: 'usuario-teste-compras@pcp.local', name: 'Usuario Teste Compras' },
      { email: 'usuario-teste-sem-perfil@pcp.local', name: 'Usuario Teste Sem Perfil' },
      { email: 'usuario-teste-inativo@pcp.local', name: 'Usuario Teste Inativo' },
    ]
    for (const u of usuarios) {
      let rec
      try {
        rec = app.findAuthRecordByEmail('users', u.email)
      } catch (_) {
        const col = app.findCollectionByNameOrId('users')
        rec = new Record(col)
        rec.setEmail(u.email)
        rec.setPassword(senha)
        rec.setVerified(true)
        rec.set('name', u.name)
        app.save(rec)
      }
    }
  },
  (app) => {
    const emails = [
      'usuario-teste-pcp@pcp.local',
      'usuario-teste-compras@pcp.local',
      'usuario-teste-sem-perfil@pcp.local',
      'usuario-teste-inativo@pcp.local',
    ]
    for (const email of emails) {
      try {
        const rec = app.findAuthRecordByEmail('users', email)
        app.delete(rec)
      } catch (_) {}
    }
  },
)
