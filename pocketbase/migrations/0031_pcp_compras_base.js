// Migration 0031 — base de compras (SPEC-3-003, CA-3-09/10/11)
// Três coleções novas, aditivas e reversíveis; regras null (só o servidor, pelos hooks
// /backend/v1/pcp/compras/*, lê e grava). Nenhuma grava no Omie. Contatos de fornecedor ficam só
// aqui, nunca no Git.
// - pcp_fornecedores_complemento: UMA linha por versão (contatos, prazo, observação, autor, hora).
// - pcp_conversoes: UMA linha por versão do fator de conversão de unidade.
// - pcp_excecoes_compra: exceção autorizada para item fora do catálogo (uma por item e documento).
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
      'pcp_fornecedores_complemento',
      [
        { name: 'fornecedor', type: 'text', required: true },
        { name: 'versao', type: 'number' },
        { name: 'contatos', type: 'json', maxSize: 50000 },
        { name: 'prazo_entrega_dias', type: 'number' },
        { name: 'observacao', type: 'text' },
        { name: 'alterado_por', type: 'text' },
        { name: 'alterado_em', type: 'date' },
      ],
      [
        'CREATE UNIQUE INDEX idx_pcp_forn_compl_versao ON pcp_fornecedores_complemento (fornecedor, versao)',
      ],
    )
    criar(
      'pcp_conversoes',
      [
        { name: 'item', type: 'text', required: true },
        { name: 'fornecedor', type: 'text' },
        { name: 'apresentacao', type: 'text', required: true },
        { name: 'unidade_compra', type: 'text' },
        { name: 'fator', type: 'number' },
        { name: 'unidade_estoque', type: 'text' },
        { name: 'confirmado_por', type: 'text' },
        { name: 'confirmado_em', type: 'date' },
        { name: 'versao', type: 'number' },
      ],
      [
        'CREATE UNIQUE INDEX idx_pcp_conversoes_versao ON pcp_conversoes (item, fornecedor, apresentacao, versao)',
      ],
    )
    criar(
      'pcp_excecoes_compra',
      [
        { name: 'item', type: 'text', required: true },
        { name: 'documento', type: 'text' },
        { name: 'documento_id', type: 'text' },
        { name: 'motivo', type: 'text' },
        { name: 'autorizado_por', type: 'text' },
        { name: 'autorizado_em', type: 'date' },
        { name: 'estado', type: 'text' },
      ],
      [
        'CREATE UNIQUE INDEX idx_pcp_excecoes_item_doc ON pcp_excecoes_compra (item, documento, documento_id)',
      ],
    )
  },
  (app) => {
    for (const nome of ['pcp_excecoes_compra', 'pcp_conversoes', 'pcp_fornecedores_complemento']) {
      try {
        app.delete(app.findCollectionByNameOrId(nome))
      } catch (_) {
        // coleção já inexistente: down idempotente
      }
    }
  },
)
