// Migration 0046 — produção guardada no servidor (patch de 02/11/2026)
// Quatro coleções novas, aditivas e reversíveis, sem acesso direto de cliente (todas as regras null:
// só o servidor, pelos hooks /backend/v1/pcp/producao/*, lê e grava):
// - pcp_programacoes: programação publicada, uma linha por versão (versão única).
// - pcp_apontamentos: eventos imutáveis de apontamento (evento_id único = idempotência).
// - pcp_conferencias_op: conferências de expedição e de câmara por ordem (registro_id único).
// - pcp_aprovacoes_consolidacao: decisão do PCP sobre a quantidade final de cada ordem.
// Nada aqui liga escrita no Omie: a ordem aprovada vira uma transação `preparada` em
// pcp_transacoes_omie, que só vai ao Omie pelas rotas de autorização e envio (chave desligada).
migrate(
  (app) => {
    const criar = (nome, indexes, fields) => {
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
          indexes: indexes,
          fields: fields.concat([
            { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
            { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
          ]),
        }),
      )
    }
    criar(
      'pcp_programacoes',
      ['CREATE UNIQUE INDEX idx_pcp_programacoes_versao ON pcp_programacoes (versao)'],
      [
        { name: 'versao', type: 'number', required: true },
        { name: 'linhas', type: 'json', maxSize: 200000 },
        { name: 'ops', type: 'json', maxSize: 200000 },
        { name: 'publicada_por', type: 'text' },
        { name: 'publicada_em', type: 'date' },
      ],
    )
    criar(
      'pcp_apontamentos',
      [
        'CREATE UNIQUE INDEX idx_pcp_apontamentos_evento ON pcp_apontamentos (evento_id)',
        'CREATE INDEX idx_pcp_apontamentos_op ON pcp_apontamentos (op_id)',
      ],
      [
        { name: 'evento_id', type: 'text', required: true },
        { name: 'op_id', type: 'text', required: true },
        { name: 'ponto', type: 'text' },
        { name: 'tipo', type: 'text' },
        { name: 'item', type: 'text' },
        { name: 'quantidade', type: 'number' },
        { name: 'unidade', type: 'text' },
        { name: 'motivo', type: 'text' },
        { name: 'retifica', type: 'text' },
        { name: 'hash_evento', type: 'text' },
        { name: 'autor', type: 'text' },
      ],
    )
    criar(
      'pcp_conferencias_op',
      [
        'CREATE UNIQUE INDEX idx_pcp_conferencias_op_registro ON pcp_conferencias_op (registro_id)',
        'CREATE INDEX idx_pcp_conferencias_op_op ON pcp_conferencias_op (op_id)',
      ],
      [
        { name: 'registro_id', type: 'text', required: true },
        { name: 'op_id', type: 'text', required: true },
        { name: 'etapa', type: 'text' },
        { name: 'ponto', type: 'text' },
        { name: 'quantidade', type: 'number' },
        { name: 'unidade', type: 'text' },
        { name: 'hash_registro', type: 'text' },
        { name: 'autor', type: 'text' },
      ],
    )
    criar(
      'pcp_aprovacoes_consolidacao',
      [
        'CREATE UNIQUE INDEX idx_pcp_aprovacoes_consolidacao_id ON pcp_aprovacoes_consolidacao (aprovacao_id)',
        'CREATE INDEX idx_pcp_aprovacoes_consolidacao_op ON pcp_aprovacoes_consolidacao (op_id)',
      ],
      [
        { name: 'aprovacao_id', type: 'text', required: true },
        { name: 'op_id', type: 'text', required: true },
        { name: 'quantidade_final', type: 'number' },
        { name: 'motivo', type: 'text' },
        { name: 'data_conclusao', type: 'text' },
        { name: 'aprovador', type: 'text' },
        { name: 'hash_eventos', type: 'text' },
        { name: 'hash_conferencias', type: 'text' },
        { name: 'estado', type: 'text' },
        { name: 'pendencias', type: 'json', maxSize: 20000 },
      ],
    )
  },
  (app) => {
    for (const nome of [
      'pcp_aprovacoes_consolidacao',
      'pcp_conferencias_op',
      'pcp_apontamentos',
      'pcp_programacoes',
    ]) {
      try {
        app.delete(app.findCollectionByNameOrId(nome))
      } catch (_) {
        // coleção já inexistente: down idempotente
      }
    }
  },
)
