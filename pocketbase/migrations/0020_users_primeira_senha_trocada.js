// pocketbase/migrations/0020_users_primeira_senha_trocada.js — SPEC-2-000 CA-A2/A3 (task 49327a88)
// Campo primeira_senha_trocada (bool) na colecao users: controla a troca obrigatoria
// da senha inicial. Sem required (bool com required rejeita false — aprendizado AP).
// Regras de acesso: o usuario NAO pode editar o proprio flag via API comum
// (updateRule trava mudanca do campo); hook pcp_trocar_senha grava no servidor.
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('_pb_users_auth_')
    const nomes = col.fields.map((f) => f.name)
    if (nomes.indexOf('primeira_senha_trocada') === -1) {
      col.fields.add(new BoolField({ name: 'primeira_senha_trocada' }))
    }
    col.updateRule = 'id = @request.auth.id && @request.body.primeira_senha_trocada:changed = false'
    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('_pb_users_auth_')
    col.fields.removeByName('primeira_senha_trocada')
    col.updateRule = 'id = @request.auth.id'
    app.save(col)
  },
)
