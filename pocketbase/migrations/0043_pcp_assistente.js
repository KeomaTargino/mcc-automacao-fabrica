// Migration 0043 — registro das perguntas ao assistente de consulta (SPEC-3-015, CA-3-41/42)
// Aditiva e reversível; uma coleção com regras null (só o servidor, pela rota
// /backend/v1/pcp/assistente, lê e grava). Só inclusão. Guarda quem perguntou, a pergunta (cortada em
// 1000 caracteres), as ferramentas e fontes usadas, o resultado e a resposta, para o LOOP-02. Não guarda
// segredo; o texto da pergunta é livre, então a tela avisa para não digitar dado pessoal.
migrate(
  (app) => {
    try {
      app.findCollectionByNameOrId('pcp_assistente_perguntas')
      return
    } catch (_) {}
    app.save(
      new Collection({
        name: 'pcp_assistente_perguntas',
        type: 'base',
        listRule: null,
        viewRule: null,
        createRule: null,
        updateRule: null,
        deleteRule: null,
        indexes: [
          'CREATE INDEX idx_pcp_assistente_usuario ON pcp_assistente_perguntas (usuario, created)',
        ],
        fields: [
          { name: 'usuario', type: 'text', required: true },
          { name: 'pergunta', type: 'text' },
          { name: 'resultado', type: 'text' },
          { name: 'ferramentas', type: 'json', maxSize: 5000 },
          { name: 'fontes', type: 'json', maxSize: 20000 },
          { name: 'resposta', type: 'text' },
          { name: 'chamadas_ia', type: 'number' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
      }),
    )
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('pcp_assistente_perguntas'))
    } catch (_) {
      // coleção já inexistente: down idempotente
    }
  },
)
