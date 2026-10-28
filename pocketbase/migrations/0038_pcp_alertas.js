// Migration 0038 — parâmetros de alerta, famílias e alertas (SPEC-3-010, CA-3-30/31/32)
// Aditiva e reversível; quatro coleções com regras null (só o servidor, pelos hooks
// /backend/v1/pcp/alertas*, lê e grava). Não mexe em pcp_parametros (parâmetros de produção da fase 2).
// - pcp_parametros_alerta: versões aprovadas dos parâmetros de alerta (produto ou família).
// - pcp_familias: agrupamento de produtos definido pelo PCP (um produto numa família no máximo).
// - pcp_alertas: um alerta aberto por chave (regra + item + referência); a rodada seguinte o atualiza.
// - pcp_alertas_lacunas: parâmetros que faltam (derivada: recalculada a cada rodada).
// Alerta não compra, não publica ordem, não muda parâmetro e não gera ação financeira.
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
      'pcp_parametros_alerta',
      [
        { name: 'versao', type: 'number', required: true },
        { name: 'aprovador', type: 'text' },
        { name: 'aprovado_em', type: 'date' },
        { name: 'hash_parametros', type: 'text' },
        { name: 'parametros', type: 'json', maxSize: 200000 },
      ],
      ['CREATE UNIQUE INDEX idx_pcp_parametros_alerta_versao ON pcp_parametros_alerta (versao)'],
    )
    criar(
      'pcp_familias',
      [
        { name: 'familia', type: 'text', required: true },
        { name: 'produto', type: 'text', required: true },
        { name: 'alterado_por', type: 'text' },
      ],
      ['CREATE UNIQUE INDEX idx_pcp_familias_produto ON pcp_familias (produto)'],
    )
    criar(
      'pcp_alertas',
      [
        { name: 'chave', type: 'text', required: true },
        { name: 'ocorrencia', type: 'number' },
        { name: 'tipo', type: 'text' },
        { name: 'item', type: 'text' },
        { name: 'referencia', type: 'text' },
        { name: 'gravidade', type: 'text' },
        { name: 'regra', type: 'text' },
        { name: 'valores', type: 'json', maxSize: 20000 },
        { name: 'versao_parametros', type: 'number' },
        { name: 'estado', type: 'text' },
        { name: 'aberto_em', type: 'date' },
        { name: 'atualizado_em', type: 'date' },
        { name: 'dado_em', type: 'date' },
        { name: 'fonte_desatualizada', type: 'bool' },
        { name: 'atualizacoes', type: 'number' },
      ],
      [
        'CREATE UNIQUE INDEX idx_pcp_alertas_chave ON pcp_alertas (chave, ocorrencia)',
        'CREATE INDEX idx_pcp_alertas_estado ON pcp_alertas (estado)',
      ],
    )
    criar(
      'pcp_alertas_lacunas',
      [
        { name: 'regra', type: 'text', required: true },
        { name: 'item', type: 'text' },
        { name: 'campo', type: 'text' },
        { name: 'motivo', type: 'text' },
      ],
      ['CREATE UNIQUE INDEX idx_pcp_alertas_lacunas ON pcp_alertas_lacunas (regra, item, campo)'],
    )
  },
  (app) => {
    for (const nome of [
      'pcp_alertas_lacunas',
      'pcp_alertas',
      'pcp_familias',
      'pcp_parametros_alerta',
    ]) {
      try {
        app.delete(app.findCollectionByNameOrId(nome))
      } catch (_) {
        // coleção já inexistente: down idempotente
      }
    }
  },
)
