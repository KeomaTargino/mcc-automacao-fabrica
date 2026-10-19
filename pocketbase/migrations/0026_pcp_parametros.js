// Migration 0026 — coleção pcp_parametros (SPEC-2-002 CA-P1/P2, task d2a44349)
// Parâmetros oficiais de produção aprovados pelo PCP (CL-006). Aditiva e reversível.
// Acesso direto de cliente NEGADO (todas as regras vazias): leitura/escrita só via
// hooks /backend/v1/pcp/parametros* com gate editar_parametros.
// Campos: versao (número crescente), aprovador, aprovado_em, hash_parametros,
// parametros (JSON completo: capacidade_padrao, lote_multiplo, horizonte_dias, recursos).
// Um único registro vigente (o de maior versão); replay idêntico é idempotente.
migrate(
  (app) => {
    try {
      app.findCollectionByNameOrId('pcp_parametros')
      return // já existe: idempotente
    } catch (_) {}
    app.save(
      new Collection({
        name: 'pcp_parametros',
        type: 'base',
        listRule: '',
        viewRule: '',
        createRule: '',
        updateRule: '',
        deleteRule: '',
        fields: [
          { name: 'versao', type: 'number' },
          { name: 'aprovador', type: 'text' },
          { name: 'aprovado_em', type: 'date' },
          { name: 'hash_parametros', type: 'text' },
          { name: 'parametros', type: 'json', maxSize: 200000 },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
      }),
    )
    const col = app.findCollectionByNameOrId('pcp_parametros')
    col.addIndex('idx_pcp_parametros_versao', true, 'versao', '')
    app.save(col)
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('pcp_parametros'))
    } catch (_) {
      // coleção já inexistente: down idempotente
    }
  },
)
