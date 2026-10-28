// Migration 0035 — recebimento conferido, parcelas e pré-conferência (SPEC-3-007, CA-3-19/20/21/22)
// Três coleções novas, aditivas e reversíveis; regras null (só o servidor, pelos hooks
// /backend/v1/pcp/compras/*, lê e grava). Nada ajusta estoque, classifica nota ou lança no
// financeiro, e nada grava no Omie. A leitura de notas reais e a escrita do recebimento estão em
// revisão (CL-PEND-007): não existem aqui; `pcp_notas_demo` só guarda nota de DEMONSTRAÇÃO.
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
      'pcp_recebimentos',
      [
        { name: 'chave', type: 'text', required: true },
        { name: 'fornecedor', type: 'text' },
        { name: 'data', type: 'text' },
        { name: 'linhas', type: 'json', maxSize: 200000 },
        { name: 'diferencas', type: 'json', maxSize: 50000 },
        { name: 'avisos_ja_paga', type: 'json', maxSize: 20000 },
        { name: 'registrado_por', type: 'text' },
        { name: 'registrado_em', type: 'date' },
      ],
      ['CREATE UNIQUE INDEX idx_pcp_receb_chave ON pcp_recebimentos (chave)'],
    )
    criar(
      'pcp_parcelas_compra',
      [
        { name: 'pedido', type: 'text', required: true },
        { name: 'numero', type: 'number' },
        { name: 'vencimento', type: 'text' },
        { name: 'valor', type: 'number' },
        { name: 'pago_antecipado', type: 'bool' },
        { name: 'referencia_pagamento', type: 'text' },
        { name: 'registrado_por', type: 'text' },
      ],
      ['CREATE UNIQUE INDEX idx_pcp_parcelas_pedido ON pcp_parcelas_compra (pedido, numero)'],
    )
    criar(
      'pcp_notas_demo',
      [
        { name: 'pedido', type: 'text', required: true },
        { name: 'demonstracao', type: 'bool' },
        { name: 'nota', type: 'json', maxSize: 100000 },
        { name: 'estado', type: 'text' },
        { name: 'pendencias', type: 'json', maxSize: 50000 },
        { name: 'avisos', type: 'json', maxSize: 20000 },
        { name: 'conferida_por', type: 'text' },
        { name: 'conferida_em', type: 'date' },
      ],
      ['CREATE INDEX idx_pcp_notas_demo_pedido ON pcp_notas_demo (pedido)'],
    )
  },
  (app) => {
    for (const nome of ['pcp_notas_demo', 'pcp_parcelas_compra', 'pcp_recebimentos']) {
      try {
        app.delete(app.findCollectionByNameOrId(nome))
      } catch (_) {
        // coleção já inexistente: down idempotente
      }
    }
  },
)
