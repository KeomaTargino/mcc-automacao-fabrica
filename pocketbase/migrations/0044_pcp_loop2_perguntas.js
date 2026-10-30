// Migration 0044 — LOOP-02 perguntas prioritárias respondidas com fonte (SPEC-3-017, CA-3-45/46)
// Aditiva e reversível; duas coleções com regras null (só o servidor, pelas rotas
// /backend/v1/pcp/assistente/loop*). A configuração do loop e as medições reaproveitam pcp_loop_config e
// pcp_loop_medicoes (loop = 'LOOP-02'). O loop nasce DESLIGADO: a linha de configuração só existe depois
// que alguém a grava, e ligar exige perguntas prioritárias, linha de base, alvo, janela e validador.
// O loop só mede, lembra e registra o veredito: não responde no lugar do assistente.
// - pcp_perguntas_prioritarias: cadastro da gestão, versionado por código.
// - pcp_assistente_revisoes: UMA linha por pergunta feita (índice único): ligação à prioritária e decisão do validador.
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
      'pcp_perguntas_prioritarias',
      [
        { name: 'codigo', type: 'text', required: true },
        { name: 'texto', type: 'text' },
        { name: 'area', type: 'text' },
        { name: 'ativa', type: 'bool' },
        { name: 'versao', type: 'number', required: true },
        { name: 'alterado_por', type: 'text' },
      ],
      ['CREATE UNIQUE INDEX idx_pcp_prioritarias ON pcp_perguntas_prioritarias (codigo, versao)'],
    )
    criar(
      'pcp_assistente_revisoes',
      [
        { name: 'pergunta_id', type: 'text', required: true },
        { name: 'prioritaria', type: 'text' },
        { name: 'ligada_por', type: 'text' },
        { name: 'decisao', type: 'text' },
        { name: 'motivo', type: 'text' },
        { name: 'validador', type: 'text' },
        { name: 'revisado_em', type: 'date' },
      ],
      ['CREATE UNIQUE INDEX idx_pcp_assistente_revisoes ON pcp_assistente_revisoes (pergunta_id)'],
    )
  },
  (app) => {
    for (const nome of ['pcp_assistente_revisoes', 'pcp_perguntas_prioritarias']) {
      try {
        app.delete(app.findCollectionByNameOrId(nome))
      } catch (_) {
        // coleção já inexistente: down idempotente
      }
    }
  },
)
