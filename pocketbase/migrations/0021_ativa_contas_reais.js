// pocketbase/migrations/0021_ativa_contas_reais.js — SPEC-2-000 CA-A2/A3 (task 49327a88)
// Ativa os perfis das 21 contas reais da matriz v1.2 (a task E a propria ativacao;
// matriz aprovada e confirmada). Sinteticos @pcp.local ficam bloqueados pelo guarda
// de login (secret PCP_REVOGAR_SINTETICOS=1) — comparacao A2/A3 preservada.
// Correcao: .all() sem argumento (o builder nao aceita callback de row scan).
migrate(
  (app) => {
    app
      .db()
      .newQuery(
        "UPDATE pcp_perfis SET ativo = 1, updated = strftime('%Y-%m-%d %H:%M:%fZ', 'now') WHERE usuario IN (SELECT id FROM users WHERE email LIKE '%@mccfranchising.com.br')",
      )
      .execute()
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
