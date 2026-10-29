// Migration 0039 — ciclo de tratamento dos alertas (SPEC-3-011, CA-3-33/34)
// Aditiva e reversível. Acrescenta a pcp_alertas os campos do ciclo (versão, responsável, alerta
// anterior, ação e quem/quando tratou) e cria duas coleções com regras null (só o servidor, pelos hooks
// /backend/v1/pcp/alertas/*):
// - pcp_alertas_historico: só inclusão (assumido, tratado, regra ligada/desligada), com autor e hora.
// - pcp_alertas_regras: regra ligada ou desligada por tipo; desligar não apaga alerta nem histórico.
// Nenhum alerta executa ação; tratar só registra.
migrate(
  (app) => {
    const alertas = app.findCollectionByNameOrId('pcp_alertas')
    for (const nome of ['responsavel', 'anterior_id', 'acao', 'acao_texto', 'tratado_por']) {
      if (!alertas.fields.getByName(nome)) alertas.fields.add(new TextField({ name: nome }))
    }
    if (!alertas.fields.getByName('versao')) alertas.fields.add(new NumberField({ name: 'versao' }))
    if (!alertas.fields.getByName('tratado_em'))
      alertas.fields.add(new DateField({ name: 'tratado_em' }))
    app.save(alertas)

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
      'pcp_alertas_historico',
      [
        { name: 'alerta_id', type: 'text' },
        { name: 'evento', type: 'text', required: true },
        { name: 'autor', type: 'text' },
        { name: 'em', type: 'date' },
        { name: 'detalhe', type: 'text' },
      ],
      ['CREATE INDEX idx_pcp_alertas_historico ON pcp_alertas_historico (alerta_id)'],
    )
    criar(
      'pcp_alertas_regras',
      [
        { name: 'tipo', type: 'text', required: true },
        { name: 'ativa', type: 'bool' },
        { name: 'alterada_por', type: 'text' },
        { name: 'alterada_em', type: 'date' },
      ],
      ['CREATE UNIQUE INDEX idx_pcp_alertas_regras ON pcp_alertas_regras (tipo)'],
    )
  },
  (app) => {
    for (const nome of ['pcp_alertas_regras', 'pcp_alertas_historico']) {
      try {
        app.delete(app.findCollectionByNameOrId(nome))
      } catch (_) {
        // coleção já inexistente: down idempotente
      }
    }
    // Os campos novos de pcp_alertas ficam (inofensivos); retirá-los perderia o registro de tratamento.
  },
)
