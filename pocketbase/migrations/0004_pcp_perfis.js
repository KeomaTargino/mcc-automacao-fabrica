// pocketbase/migrations/0004_pcp_perfis.js — SPEC-1-001 CA-A2/A3
// Coleção pcp_perfis (SPEC): 1 perfil por usuário, índice único, regras superuser-only.
// Fecha também as 5 regras das coleções de dados de integração ("" → null = superuser),
// impedindo leitura direta de dados brutos por usuários autenticados.
migrate(
  (app) => {
    // 1) Coleção de perfis — todas as cinco regras declaradas (null = superuser only)
    const perfis = new Collection({
      name: 'pcp_perfis',
      type: 'base',
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        {
          name: 'usuario',
          type: 'relation',
          required: true,
          collectionId: '_pb_users_auth_',
          cascadeDelete: true,
          maxSelect: 1,
        },
        { name: 'ativo', type: 'bool', required: true },
        {
          name: 'areas',
          type: 'select',
          required: true,
          maxSelect: 6,
          values: ['catalogo', 'estoque', 'producao', 'compras', 'pedidos', 'painel'],
        },
        { name: 'pode_atualizar_fontes', type: 'bool' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_pcp_perfis_usuario ON pcp_perfis (usuario)'],
    })
    app.save(perfis)

    // 2) Perfis sintéticos de teste (Plano B) — fixtures, não cargos aprovados
    const pares = [
      { email: 'usuario-teste-pcp@pcp.local', areas: ['estoque', 'painel'], ativo: true },
      { email: 'usuario-teste-compras@pcp.local', areas: ['compras', 'painel'], ativo: true },
      { email: 'usuario-teste-inativo@pcp.local', areas: ['catalogo', 'painel'], ativo: false },
    ]
    for (const p of pares) {
      const usuario = app.findAuthRecordByEmail('users', p.email)
      let existente = null
      try {
        existente = app.findFirstRecordByData('pcp_perfis', 'usuario', usuario.id)
      } catch (_) {}
      if (!existente) {
        const rec = new Record(perfis)
        rec.set('usuario', usuario.id)
        rec.set('ativo', p.ativo)
        rec.set('areas', p.areas)
        rec.set('pode_atualizar_fontes', false)
        app.save(rec)
      }
    }

    // 3) Fecha as regras das coleções de dados (dados brutos ficam superuser-only)
    const colecoes = ['pcp_execucoes', 'pcp_lotes', 'pcp_dados', 'pcp_fontes']
    for (const nome of colecoes) {
      const col = app.findCollectionByNameOrId(nome)
      col.listRule = null
      col.viewRule = null
      col.createRule = null
      col.updateRule = null
      col.deleteRule = null
      app.save(col)
    }
  },
  (app) => {
    // down: restaura regras anteriores ("") e remove a coleção de perfis
    const colecoes = ['pcp_execucoes', 'pcp_lotes', 'pcp_dados', 'pcp_fontes']
    for (const nome of colecoes) {
      const col = app.findCollectionByNameOrId(nome)
      col.listRule = ''
      col.viewRule = ''
      col.createRule = ''
      col.updateRule = ''
      col.deleteRule = ''
      app.save(col)
    }
    try {
      app.delete(app.findCollectionByNameOrId('pcp_perfis'))
    } catch (_) {}
  },
)
