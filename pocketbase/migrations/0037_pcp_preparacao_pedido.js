// Migration 0037 — preparação do pedido para faturar (SPEC-3-009, CA-3-26 a CA-3-29)
// Aditiva e reversível; cinco coleções com regras null (só o servidor, pelos hooks
// /backend/v1/pcp/faturamento/*, lê e grava) e a chave omie_pedido_venda_escrita, DESLIGADA.
// - pcp_preparacao_pedido: UMA linha por pedido (frete, volumes atuais, liberação, versão).
// - pcp_volumes: cada contagem da expedição (histórico; nada é sobrescrito).
// - pcp_pedidos_manuais: pedido manual com motivo, referência e resultado da checagem de duplicata.
// - pcp_liberacoes_faturamento: registro de cada liberação e de cada liberação desfeita.
// - pcp_gravacoes_venda: UMA linha por pedido e operação (índice único) = gravação no Omie.
// Nada grava no Omie; nenhuma nota fiscal é emitida.
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
      'pcp_preparacao_pedido',
      [
        { name: 'pedido_id', type: 'text', required: true },
        { name: 'versao', type: 'number' },
        { name: 'frete_modalidade', type: 'text' },
        { name: 'transportadora', type: 'text' },
        { name: 'volumes_quantidade', type: 'number' },
        { name: 'peso_bruto', type: 'number' },
        { name: 'volumes_por', type: 'text' },
        { name: 'volumes_em', type: 'date' },
        { name: 'liberacao_hash', type: 'text' },
        { name: 'liberado_por', type: 'text' },
        { name: 'liberado_em', type: 'date' },
        { name: 'apto_hash', type: 'text' },
        { name: 'apto_em', type: 'date' },
        { name: 'alterado_por', type: 'text' },
      ],
      ['CREATE UNIQUE INDEX idx_pcp_preparacao_pedido ON pcp_preparacao_pedido (pedido_id)'],
    )
    criar(
      'pcp_volumes',
      [
        { name: 'pedido_id', type: 'text', required: true },
        { name: 'quantidade', type: 'number' },
        { name: 'peso_bruto', type: 'number' },
        { name: 'conferido_por', type: 'text' },
        { name: 'conferido_em', type: 'date' },
      ],
      ['CREATE INDEX idx_pcp_volumes_pedido ON pcp_volumes (pedido_id)'],
    )
    criar(
      'pcp_pedidos_manuais',
      [
        { name: 'pedido_id', type: 'text', required: true },
        { name: 'cliente_omie', type: 'text' },
        { name: 'data', type: 'text' },
        { name: 'itens', type: 'json', maxSize: 50000 },
        { name: 'motivo', type: 'text' },
        { name: 'referencia', type: 'text' },
        { name: 'codigo_integracao', type: 'text' },
        { name: 'estado', type: 'text' },
        { name: 'duplicata_com', type: 'text' },
        { name: 'duplicata_motivo', type: 'text' },
        { name: 'decisao', type: 'text' },
        { name: 'decisao_motivo', type: 'text' },
        { name: 'decisao_por', type: 'text' },
        { name: 'decisao_em', type: 'date' },
        { name: 'criado_por', type: 'text' },
      ],
      ['CREATE UNIQUE INDEX idx_pcp_pedidos_manuais ON pcp_pedidos_manuais (pedido_id)'],
    )
    criar(
      'pcp_liberacoes_faturamento',
      [
        { name: 'pedido_id', type: 'text', required: true },
        { name: 'evento', type: 'text' },
        { name: 'hash', type: 'text' },
        { name: 'por', type: 'text' },
        { name: 'em', type: 'date' },
        { name: 'motivo', type: 'text' },
      ],
      ['CREATE INDEX idx_pcp_liberacoes_pedido ON pcp_liberacoes_faturamento (pedido_id)'],
    )
    criar(
      'pcp_gravacoes_venda',
      [
        { name: 'pedido_id', type: 'text', required: true },
        { name: 'operacao', type: 'text', required: true },
        { name: 'codigo_integracao', type: 'text' },
        { name: 'estado', type: 'text' },
        { name: 'gravado_por', type: 'text' },
        { name: 'hora', type: 'date' },
        { name: 'payload_hash', type: 'text' },
        { name: 'resultado', type: 'json', maxSize: 20000 },
      ],
      ['CREATE UNIQUE INDEX idx_pcp_gravacoes_venda ON pcp_gravacoes_venda (pedido_id, operacao)'],
    )
    // Chave de escrita do pedido de venda: nasce DESLIGADA.
    try {
      app.findFirstRecordByFilter('pcp_chaves_escrita', 'chave = {:c}', {
        c: 'omie_pedido_venda_escrita',
      })
    } catch (_) {
      const chave = new Record(app.findCollectionByNameOrId('pcp_chaves_escrita'))
      chave.set('chave', 'omie_pedido_venda_escrita')
      chave.set('ligada', false)
      chave.set('escopo', '')
      app.save(chave)
    }
  },
  (app) => {
    for (const nome of [
      'pcp_gravacoes_venda',
      'pcp_liberacoes_faturamento',
      'pcp_pedidos_manuais',
      'pcp_volumes',
      'pcp_preparacao_pedido',
    ]) {
      try {
        app.delete(app.findCollectionByNameOrId(nome))
      } catch (_) {
        // coleção já inexistente: down idempotente
      }
    }
    // A linha da chave fica (desligada); apagá-la não muda nada e perderia o histórico.
  },
)
