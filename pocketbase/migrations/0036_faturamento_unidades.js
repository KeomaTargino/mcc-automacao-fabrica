// Migration 0036 — área "faturamento", unidades, nomes por canal e tabela de preço
// (SPEC-3-008, CA-3-23/24/25)
// Aditiva e reversível. Acrescenta o valor 'faturamento' às áreas de pcp_perfis (nenhum perfil existente
// muda; nenhuma conta recebe a área ou ação nova: conta real só pela matriz aprovada, CL-003) e cria
// três coleções com regras null (só o servidor, pelos hooks /backend/v1/pcp/faturamento/*, lê e grava).
// Nada grava no Omie nem altera pedido, preço ou cliente.
migrate(
  (app) => {
    const perfis = app.findCollectionByNameOrId('pcp_perfis')
    const campo = perfis.fields.getByName('areas')
    const valores = campo.values || []
    if (valores.indexOf('faturamento') === -1) {
      campo.values = valores.concat(['faturamento'])
      campo.maxSelect = campo.values.length
      app.save(perfis)
    }
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
      'pcp_unidades',
      [
        { name: 'cliente_omie', type: 'text', required: true },
        { name: 'unidade', type: 'text' },
        { name: 'nome_fantasia_operacional', type: 'text' },
        { name: 'tipo', type: 'text' },
        { name: 'ativo', type: 'bool' },
        { name: 'versao', type: 'number' },
        { name: 'alterado_por', type: 'text' },
        { name: 'alterado_em', type: 'date' },
      ],
      ['CREATE UNIQUE INDEX idx_pcp_unidades_versao ON pcp_unidades (cliente_omie, versao)'],
    )
    criar(
      'pcp_nomes_canal',
      [
        { name: 'canal', type: 'text', required: true },
        { name: 'cliente_omie', type: 'text', required: true },
        { name: 'nome_recebido', type: 'text' },
        { name: 'nome_normalizado', type: 'text' },
        { name: 'estado', type: 'text' },
        { name: 'decidido_por', type: 'text' },
        { name: 'decidido_em', type: 'date' },
      ],
      [
        'CREATE UNIQUE INDEX idx_pcp_nomes_canal ON pcp_nomes_canal (canal, cliente_omie, nome_normalizado)',
      ],
    )
    criar(
      'pcp_tabelas_preco',
      [
        { name: 'chave', type: 'text', required: true },
        { name: 'item', type: 'text', required: true },
        { name: 'preco', type: 'number' },
        { name: 'unidade', type: 'text' },
        { name: 'vigencia_inicio', type: 'text' },
        { name: 'versao', type: 'number' },
        { name: 'origem', type: 'text' },
        { name: 'alterado_por', type: 'text' },
      ],
      [
        'CREATE UNIQUE INDEX idx_pcp_tabelas_preco ON pcp_tabelas_preco (chave, item, vigencia_inicio, versao)',
      ],
    )
  },
  (app) => {
    for (const nome of ['pcp_tabelas_preco', 'pcp_nomes_canal', 'pcp_unidades']) {
      try {
        app.delete(app.findCollectionByNameOrId(nome))
      } catch (_) {
        // coleção já inexistente: down idempotente
      }
    }
    // O valor 'faturamento' não é retirado da lista de áreas (perfil que o use ficaria inválido).
  },
)
