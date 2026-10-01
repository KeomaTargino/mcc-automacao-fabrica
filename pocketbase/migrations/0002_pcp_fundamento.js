// Migration: pcp_fundamento (SPEC-1-000, CA-F1)
// Coleções técnicas do PCP conforme o contrato de dados da SPEC-1-002.
// Todas com as cinco regras declaradas e acesso direto de cliente negado.
migrate(
  (app) => {
    // pcp_execucoes
    app.save(
      new Collection({
        name: 'pcp_execucoes',
        type: 'base',
        listRule: '',
        viewRule: '',
        createRule: '',
        updateRule: '',
        deleteRule: '',
        fields: [
          { name: 'fonte', type: 'text' },
          { name: 'aplicativo_ref', type: 'text' },
          { name: 'inicio', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'fim', type: 'date' },
          { name: 'estado', type: 'text' },
          { name: 'recurso', type: 'text' },
          { name: 'pagina', type: 'number' },
          { name: 'cursor', type: 'text' },
          { name: 'erro_codigo', type: 'text' },
          { name: 'erro_mensagem', type: 'text' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
      }),
    )

    // pcp_lotes
    app.save(
      new Collection({
        name: 'pcp_lotes',
        type: 'base',
        listRule: '',
        viewRule: '',
        createRule: '',
        updateRule: '',
        deleteRule: '',
        fields: [
          { name: 'fonte', type: 'text' },
          { name: 'recurso', type: 'text' },
          { name: 'aplicativo_ref', type: 'text' },
          { name: 'estado', type: 'text' }, // staging | completo | substituido
          { name: 'total_itens', type: 'number' },
          { name: 'concluido_em', type: 'date' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
      }),
    )

    // pcp_dados
    app.save(
      new Collection({
        name: 'pcp_dados',
        type: 'base',
        listRule: '',
        viewRule: '',
        createRule: '',
        updateRule: '',
        deleteRule: '',
        fields: [
          { name: 'chave_origem', type: 'text' },
          { name: 'conteudo', type: 'json' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
      }),
    )

    // pcp_fontes
    app.save(
      new Collection({
        name: 'pcp_fontes',
        type: 'base',
        listRule: '',
        viewRule: '',
        createRule: '',
        updateRule: '',
        deleteRule: '',
        indexes: [
          'CREATE UNIQUE INDEX idx_pcp_fontes_identidade ON pcp_fontes (fonte, recurso, aplicativo_ref)',
        ],
        fields: [
          { name: 'fonte', type: 'text' },
          { name: 'recurso', type: 'text' },
          { name: 'aplicativo_ref', type: 'text' },
          { name: 'geracao', type: 'number' },
          { name: 'lease_ate', type: 'date' },
          { name: 'ultima_tentativa', type: 'date' },
          { name: 'ultimo_sucesso', type: 'date' },
          { name: 'estado_tecnico', type: 'text' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
      }),
    )

    // Relações cruzadas (coleções já existentes agora)
    const lotes = app.findCollectionByNameOrId('pcp_lotes')
    lotes.fields.add(
      new RelationField({
        name: 'execucao',
        collectionId: app.findCollectionByNameOrId('pcp_execucoes').id,
        maxSelect: 1,
      }),
    )
    app.save(lotes)

    const dados = app.findCollectionByNameOrId('pcp_dados')
    dados.fields.add(
      new RelationField({
        name: 'lote',
        collectionId: app.findCollectionByNameOrId('pcp_lotes').id,
        maxSelect: 1,
      }),
    )
    app.save(dados)
    dados.addIndex('idx_pcp_dados_lote_chave', true, 'lote, chave_origem', '')
    app.save(dados)

    const fontes = app.findCollectionByNameOrId('pcp_fontes')
    fontes.fields.add(
      new RelationField({
        name: 'lote_ativo',
        collectionId: app.findCollectionByNameOrId('pcp_lotes').id,
        maxSelect: 1,
      }),
    )
    fontes.fields.add(
      new RelationField({
        name: 'execucao_ativa',
        collectionId: app.findCollectionByNameOrId('pcp_execucoes').id,
        maxSelect: 1,
      }),
    )
    app.save(fontes)
  },
  (app) => {
    for (const name of ['pcp_fontes', 'pcp_dados', 'pcp_lotes', 'pcp_execucoes']) {
      try {
        app.delete(app.findCollectionByNameOrId(name))
      } catch (e) {
        // coleção já inexistente: down idempotente
      }
    }
  },
)
