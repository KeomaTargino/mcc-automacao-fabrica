// Migration 0040 — histórico de vendas por período e regra de suficiência (SPEC-3-012, CA-3-35/36)
// Aditiva e reversível; três coleções com regras null (só o servidor, pelos hooks
// /backend/v1/pcp/vendas/*, lê e grava). Nada grava no Omie; o baseline90-v1 não é tocado.
// - pcp_historico_vendas_periodo: vendas faturadas por produto, mês e PÁGINA lida (reler uma página
//   substitui as linhas dela: idempotente). DERIVADA do Omie; pode ser recalculada.
// - pcp_historico_vendas_cobertura: por mês, até que página foi lida e se o mês está completo.
//   Mês não lido por inteiro nunca é tratado como zero.
// - pcp_regra_sazonalidade: versões da regra de suficiência aprovada pelo PCP.
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
      'pcp_historico_vendas_periodo',
      [
        { name: 'aplicativo', type: 'text', required: true },
        { name: 'periodo', type: 'text', required: true },
        { name: 'pagina', type: 'number' },
        { name: 'produto', type: 'text', required: true },
        { name: 'quantidade', type: 'number' },
      ],
      [
        'CREATE UNIQUE INDEX idx_pcp_hvp_chave ON pcp_historico_vendas_periodo (aplicativo, periodo, pagina, produto)',
        'CREATE INDEX idx_pcp_hvp_produto ON pcp_historico_vendas_periodo (produto)',
      ],
    )
    criar(
      'pcp_historico_vendas_cobertura',
      [
        { name: 'aplicativo', type: 'text', required: true },
        { name: 'periodo', type: 'text', required: true },
        { name: 'ultima_pagina', type: 'number' },
        { name: 'total_paginas', type: 'number' },
        { name: 'completo', type: 'bool' },
        { name: 'lido_em', type: 'date' },
        { name: 'proxima_tentativa', type: 'date' },
      ],
      [
        'CREATE UNIQUE INDEX idx_pcp_hvc_chave ON pcp_historico_vendas_cobertura (aplicativo, periodo)',
      ],
    )
    criar(
      'pcp_regra_sazonalidade',
      [
        { name: 'versao', type: 'number', required: true },
        { name: 'aprovador', type: 'text' },
        { name: 'aprovado_em', type: 'date' },
        { name: 'ciclos_minimos', type: 'number' },
        { name: 'cobertura_minima_pct', type: 'number' },
      ],
      ['CREATE UNIQUE INDEX idx_pcp_regra_saz_versao ON pcp_regra_sazonalidade (versao)'],
    )
  },
  (app) => {
    for (const nome of [
      'pcp_regra_sazonalidade',
      'pcp_historico_vendas_cobertura',
      'pcp_historico_vendas_periodo',
    ]) {
      try {
        app.delete(app.findCollectionByNameOrId(nome))
      } catch (_) {
        // coleção já inexistente: down idempotente
      }
    }
  },
)
