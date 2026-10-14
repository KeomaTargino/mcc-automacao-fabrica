// pocketbase/migrations/0018_perfis_acoes_pontos.js — SPEC-2-000 CA-A2/A3 (task 49327a88)
// Campos acoes e pontos em pcp_perfis (jsonarray). Aditiva e reversivel.
// Acoes F2 da SPEC (9): consultar_planejamento, editar_programacao, editar_parametros,
//   publicar_programacao, apontar_producao, conferir_expedicao, conferir_camara,
//   aprovar_consolidacao, executar_sync_omie.
// Pontos: locais fisicos de apontamento (cozinha, triagem, encaixotamento, expedicao, camara_fria).
// Regras de acesso permanecem null (servidor-only via hooks) — nenhuma concessao via API comum.
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('pcp_perfis')
    const nomes = col.fields.map((f) => f.name)
    if (nomes.indexOf('acoes') === -1) {
      col.fields.add(new JSONField({ name: 'acoes', maxSize: 20000 }))
    }
    if (nomes.indexOf('pontos') === -1) {
      col.fields.add(new JSONField({ name: 'pontos', maxSize: 20000 }))
    }
    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('pcp_perfis')
    col.fields.removeByName('acoes')
    col.fields.removeByName('pontos')
    app.save(col)
  },
)
