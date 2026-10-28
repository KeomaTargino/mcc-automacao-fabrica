// Migration 0032 — histórico de preços de compra (SPEC-3-004, CA-3-12/13)
// Uma coleção nova, aditiva e reversível; regras null (só o servidor, pelos hooks
// /backend/v1/pcp/compras/historico*, lê e grava). É DERIVADA do Omie: pode ser recalculada.
// Cada linha de pedido de compra fica inteira (insumo, frete, serviço, N-D); só a classificação feita
// por Compras é escrita pela tela. Nada grava no Omie.
migrate(
  (app) => {
    try {
      app.findCollectionByNameOrId('pcp_precos_compra')
      return
    } catch (_) {}
    app.save(
      new Collection({
        name: 'pcp_precos_compra',
        type: 'base',
        listRule: null,
        viewRule: null,
        createRule: null,
        updateRule: null,
        deleteRule: null,
        indexes: [
          'CREATE UNIQUE INDEX idx_pcp_precos_chave ON pcp_precos_compra (aplicativo, pedido_id, linha_id)',
          'CREATE INDEX idx_pcp_precos_produto ON pcp_precos_compra (produto_id)',
        ],
        fields: [
          { name: 'aplicativo', type: 'text', required: true },
          { name: 'pedido_id', type: 'text', required: true },
          { name: 'linha_id', type: 'text', required: true },
          { name: 'produto_id', type: 'text', required: true },
          { name: 'fornecedor', type: 'text' },
          { name: 'unidade_compra', type: 'text' },
          { name: 'quantidade', type: 'number' },
          { name: 'preco_unitario', type: 'number' },
          { name: 'valor_total', type: 'number' },
          { name: 'tipo_omie', type: 'text' },
          { name: 'cancelado', type: 'bool' },
          { name: 'data', type: 'text' },
          { name: 'classificacao_compras', type: 'text' },
          { name: 'classificado_por', type: 'text' },
          { name: 'classificado_em', type: 'date' },
          { name: 'origem', type: 'text' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
      }),
    )
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('pcp_precos_compra'))
    } catch (_) {
      // já inexistente: down idempotente
    }
  },
)
