// Migration: campo conferencia em pcp_lotes (SPEC-1-002, task a5b75aca)
// Registra o resultado da conferência da integração (contagem × nTotRegistros do Omie).
migrate(
  (app) => {
    const lotes = app.findCollectionByNameOrId('pcp_lotes')
    lotes.fields.add(new JSONField({ name: 'conferencia', maxSize: 2000000 }))
    app.save(lotes)
  },
  (app) => {
    const lotes = app.findCollectionByNameOrId('pcp_lotes')
    lotes.fields.removeByName('conferencia')
    app.save(lotes)
  },
)
