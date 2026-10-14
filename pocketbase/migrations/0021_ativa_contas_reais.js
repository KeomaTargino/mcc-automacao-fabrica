// pocketbase/migrations/0021_ativa_contas_reais.js — SPEC-2-000 CA-A2/A3 (task 49327a88)
// Ativa os perfis das 21 contas reais da matriz v1.2 (a task E a propria ativacao;
// matriz aprovada e confirmada). Sinteticos @pcp.local ficam bloqueados pelo guarda
// de login (secret PCP_REVOGAR_SINTETICOS=1) — comparacao A2/A3 preservada.
// Idempotente: so mexe em perfis de contas @mccfranchising.com.br.
migrate(
  (app) => {
    const ids = app
      .db()
      .newQuery(
        "SELECT p.id FROM pcp_perfis p JOIN users u ON u.id = p.usuario WHERE u.email LIKE '%@mccfranchising.com.br'",
      )
      .all()
    for (const row of ids) {
      app
        .db()
        .newQuery(
          "UPDATE pcp_perfis SET ativo = 1, updated = strftime('%Y-%m-%d %H:%M:%fZ', 'now') WHERE id = {:id}",
        )
        .bind({ id: row.id })
        .execute()
    }
    console.log('0021: perfis reais ativados=' + ids.length)
  },
  (app) => {
    app
      .db()
      .newQuery(
        "UPDATE pcp_perfis SET ativo = 0 WHERE usuario IN (SELECT id FROM users WHERE email LIKE '%@mccfranchising.com.br')",
      )
      .execute()
  },
)
