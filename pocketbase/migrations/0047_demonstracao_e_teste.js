// Migration 0047 — teste e demonstração separados do real (SPEC-4-001, CA-4-34)
// Aditiva e reversível. Acrescenta:
// - `teste` (bool) em pcp_perfis: marca a conta de teste. O Maestro marca as contas que o dono criar;
//   esta migration não cria conta, senha nem acesso.
// - `demonstracao` (bool) nas coleções de produção, compras e faturamento: o servidor marca o
//   registro gravado por conta de teste ou ligado a produto de demonstração (hook pcp_demonstracao_marca).
// Coleção que não existir é ignorada.
const COLECOES = [
  // produção
  'pcp_programacoes',
  'pcp_apontamentos',
  'pcp_conferencias_op',
  'pcp_aprovacoes_consolidacao',
  'pcp_transacoes_omie',
  // compras e recebimento
  'pcp_requisicoes',
  'pcp_cotacoes',
  'pcp_aprovacoes_compra',
  'pcp_pedidos_compra_vinculo',
  'pcp_recebimentos',
  // faturamento
  'pcp_pedidos_manuais',
  'pcp_preparacao_pedido',
  'pcp_volumes',
  'pcp_liberacoes_faturamento',
  'pcp_gravacoes_venda',
]
migrate(
  (app) => {
    for (const nome of COLECOES) {
      let col = null
      try {
        col = app.findCollectionByNameOrId(nome)
      } catch (_) {
        continue
      }
      if (!col.fields.getByName('demonstracao')) {
        col.fields.add(new BoolField({ name: 'demonstracao' }))
        app.save(col)
      }
    }
    const perfis = app.findCollectionByNameOrId('pcp_perfis')
    if (!perfis.fields.getByName('teste')) {
      perfis.fields.add(new BoolField({ name: 'teste' }))
      app.save(perfis)
    }
  },
  (app) => {
    for (const nome of COLECOES.concat(['pcp_perfis'])) {
      let col = null
      try {
        col = app.findCollectionByNameOrId(nome)
      } catch (_) {
        continue
      }
      const campo = nome === 'pcp_perfis' ? 'teste' : 'demonstracao'
      if (col.fields.getByName(campo)) {
        col.fields.removeByName(campo)
        app.save(col)
      }
    }
  },
)
