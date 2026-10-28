// Migration 0033 — requisição, cotação e aprovação da compra (SPEC-3-005, CA-3-14/15/16)
// Quatro coleções novas, aditivas e reversíveis; regras null (só o servidor, pelos hooks
// /backend/v1/pcp/compras/*, lê e grava). Nenhuma grava no Omie. Alçadas NÃO são preenchidas aqui:
// alçada real é dado do dono (CL-PEND-008); sem linhas, a aprovação real fica parada.
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
      'pcp_requisicoes',
      [
        { name: 'fornecedor', type: 'text', required: true },
        { name: 'itens', type: 'json', maxSize: 200000 },
        { name: 'data_necessaria', type: 'text' },
        { name: 'emergencial', type: 'bool' },
        { name: 'motivo_emergencia', type: 'text' },
        { name: 'estado', type: 'text' },
        { name: 'versao', type: 'number' },
        { name: 'origem', type: 'json', maxSize: 50000 },
        { name: 'criado_por', type: 'text' },
        { name: 'criado_em', type: 'date' },
      ],
      ['CREATE INDEX idx_pcp_req_estado ON pcp_requisicoes (estado)'],
    )
    criar(
      'pcp_requisicao_origens',
      [
        { name: 'origem', type: 'text', required: true },
        { name: 'requisicao', type: 'text' },
      ],
      ['CREATE UNIQUE INDEX idx_pcp_req_origem ON pcp_requisicao_origens (origem)'],
    )
    criar(
      'pcp_cotacoes',
      [
        { name: 'requisicao', type: 'text', required: true },
        { name: 'item', type: 'text', required: true },
        { name: 'fornecedor', type: 'text' },
        { name: 'preco_compra', type: 'number' },
        { name: 'unidade_compra', type: 'text' },
        { name: 'preco_estoque', type: 'number' },
        { name: 'ultimo_preco', type: 'number' },
        { name: 'prazo_dias', type: 'number' },
        { name: 'condicao_pagamento', type: 'text' },
        { name: 'validade', type: 'text' },
        { name: 'escolhida', type: 'bool' },
      ],
      ['CREATE INDEX idx_pcp_cot_req ON pcp_cotacoes (requisicao, item)'],
    )
    criar(
      'pcp_aprovacoes_compra',
      [
        { name: 'requisicao', type: 'text', required: true },
        { name: 'aprovador', type: 'text' },
        { name: 'decisao', type: 'text' },
        { name: 'valor', type: 'number' },
        { name: 'alcada_usada', type: 'number' },
        { name: 'motivo', type: 'text' },
        { name: 'hora', type: 'date' },
        { name: 'hash', type: 'text' },
        { name: 'valida', type: 'bool' },
      ],
      ['CREATE INDEX idx_pcp_apr_req ON pcp_aprovacoes_compra (requisicao)'],
    )
    criar(
      'pcp_alcadas',
      [
        { name: 'aprovador', type: 'text', required: true },
        { name: 'limite', type: 'number' },
        { name: 'demonstracao', type: 'bool' },
      ],
      ['CREATE UNIQUE INDEX idx_pcp_alcadas_aprovador ON pcp_alcadas (aprovador)'],
    )
  },
  (app) => {
    for (const nome of [
      'pcp_alcadas',
      'pcp_aprovacoes_compra',
      'pcp_cotacoes',
      'pcp_requisicao_origens',
      'pcp_requisicoes',
    ]) {
      try {
        app.delete(app.findCollectionByNameOrId(nome))
      } catch (_) {
        // coleção já inexistente: down idempotente
      }
    }
  },
)
