// Migration 0034 — entregas e vínculo do pedido de compra (SPEC-3-006, CA-3-17/18)
// Duas coleções novas, aditivas e reversíveis; regras null (só o servidor, pelos hooks
// /backend/v1/pcp/compras/*, lê e grava).
// - pcp_entregas_compra: linhas de pedido de compra lidas do Omie (derivada; a rotina de leitura real
//   ainda não preenche, aguarda a chave do Omie). Nunca é escrita de volta ao Omie.
// - pcp_pedidos_compra_vinculo: UMA linha por compra aprovada (índice único) ligando-a ao pedido do
//   Omie, manualmente (número informado e conferido) ou pelo lançamento atrás da chave desligada.
migrate(
  (app) => {
    const criar = (nome, campos, indices) => {
      try {
        app.findCollectionByNameOrId(nome)
        return
      } catch (_) {}
      app.save(
        new Collection({
          name: nome,
          type: 'base',
          listRule: null,
          viewRule: null,
          createRule: null,
          updateRule: null,
          deleteRule: null,
          indexes: indices,
          fields: campos.concat([
            { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
            { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
          ]),
        }),
      )
    }
    criar(
      'pcp_entregas_compra',
      [
        { name: 'aplicativo', type: 'text', required: true },
        { name: 'pedido_id', type: 'text', required: true },
        { name: 'numero', type: 'text' },
        { name: 'linha_id', type: 'text', required: true },
        { name: 'fornecedor', type: 'text' },
        { name: 'produto_id', type: 'text' },
        { name: 'unidade', type: 'text' },
        { name: 'quantidade_pedida', type: 'number' },
        { name: 'quantidade_recebida', type: 'number' },
        { name: 'data_prevista', type: 'text' },
        { name: 'etapa', type: 'text' },
        { name: 'cancelado', type: 'bool' },
        { name: 'lido_em', type: 'date' },
      ],
      [
        'CREATE UNIQUE INDEX idx_pcp_entregas_chave ON pcp_entregas_compra (aplicativo, pedido_id, linha_id)',
        'CREATE INDEX idx_pcp_entregas_numero ON pcp_entregas_compra (numero)',
      ],
    )
    criar(
      'pcp_pedidos_compra_vinculo',
      [
        { name: 'requisicao', type: 'text', required: true },
        { name: 'codigo_integracao', type: 'text' },
        { name: 'numero_omie', type: 'text' },
        { name: 'cod_pedido_omie', type: 'text' },
        { name: 'origem', type: 'text' },
        { name: 'estado', type: 'text' },
        { name: 'ligado_por', type: 'text' },
        { name: 'hora', type: 'date' },
        { name: 'payload_hash', type: 'text' },
        { name: 'resultado', type: 'json', maxSize: 20000 },
      ],
      ['CREATE UNIQUE INDEX idx_pcp_vinculo_requisicao ON pcp_pedidos_compra_vinculo (requisicao)'],
    )
  },
  (app) => {
    for (const nome of ['pcp_pedidos_compra_vinculo', 'pcp_entregas_compra']) {
      try {
        app.delete(app.findCollectionByNameOrId(nome))
      } catch (_) {
        // coleção já inexistente: down idempotente
      }
    }
  },
)
