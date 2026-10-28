// Migration 0029 — escrita no Omie com chave desligada (SPEC-3-002, CA-3-06/07)
// Duas coleções novas, aditivas e reversíveis, sem acesso direto de cliente (todas as regras null:
// só o servidor, pelos hooks /backend/v1/pcp/omie/*, lê e grava):
// - pcp_chaves_escrita: uma linha por chave de escrita; nasce DESLIGADA. `escopo` guarda a única
//   transação que o dono autorizou enquanto a chave está ligada.
// - pcp_transacoes_omie: tentativa de gravação (estado, hash do payload aprovado, lease, contagem
//   de chamadas que gravam, resultado sanitizado).
// A chave de recebimento (omie_recebimento_escrita) não é criada: está em revisão.
migrate(
  (app) => {
    try {
      app.findCollectionByNameOrId('pcp_chaves_escrita')
    } catch (_) {
      app.save(
        new Collection({
          name: 'pcp_chaves_escrita',
          type: 'base',
          listRule: null,
          viewRule: null,
          createRule: null,
          updateRule: null,
          deleteRule: null,
          indexes: [
            'CREATE UNIQUE INDEX idx_pcp_chaves_escrita_chave ON pcp_chaves_escrita (chave)',
          ],
          fields: [
            { name: 'chave', type: 'text', required: true },
            { name: 'ligada', type: 'bool' },
            { name: 'escopo', type: 'text' },
            { name: 'autorizada_por', type: 'text' },
            { name: 'autorizada_em', type: 'date' },
            { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
            { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
          ],
        }),
      )
    }
    try {
      app.findCollectionByNameOrId('pcp_transacoes_omie')
    } catch (_) {
      app.save(
        new Collection({
          name: 'pcp_transacoes_omie',
          type: 'base',
          listRule: null,
          viewRule: null,
          createRule: null,
          updateRule: null,
          deleteRule: null,
          indexes: [
            'CREATE UNIQUE INDEX idx_pcp_transacoes_omie_id ON pcp_transacoes_omie (transacao_id)',
          ],
          fields: [
            { name: 'transacao_id', type: 'text', required: true },
            { name: 'op_id', type: 'text' },
            { name: 'revisao_consolidacao', type: 'number' },
            { name: 'operacao', type: 'text' },
            { name: 'codigo_integracao', type: 'text' },
            { name: 'quantidade', type: 'number' },
            { name: 'payload', type: 'json', maxSize: 20000 },
            { name: 'payload_hash', type: 'text' },
            { name: 'estado', type: 'text' },
            { name: 'lease_ate', type: 'date' },
            { name: 'posts_mutantes', type: 'number' },
            { name: 'pendencias', type: 'json', maxSize: 20000 },
            { name: 'resultado', type: 'json', maxSize: 20000 },
            { name: 'autorizada_por', type: 'text' },
            { name: 'autorizada_em', type: 'date' },
            { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
            { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
          ],
        }),
      )
    }
    // Seed idempotente: as chaves de escrita existem e nascem desligadas.
    const col = app.findCollectionByNameOrId('pcp_chaves_escrita')
    for (const nome of [
      'omie_op_escrita',
      'omie_pedido_compra_escrita',
      'omie_pedido_venda_escrita',
    ]) {
      let existe = null
      try {
        existe = app.findFirstRecordByFilter('pcp_chaves_escrita', 'chave = {:c}', { c: nome })
      } catch (_) {}
      if (!existe) {
        const r = new Record(col)
        r.set('chave', nome)
        r.set('ligada', false)
        app.save(r)
      }
    }
  },
  (app) => {
    for (const nome of ['pcp_transacoes_omie', 'pcp_chaves_escrita']) {
      try {
        app.delete(app.findCollectionByNameOrId(nome))
      } catch (_) {
        // coleção já inexistente: down idempotente
      }
    }
  },
)
