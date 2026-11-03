// Migration 0045 — patch de 02/11/2026: a chave de escrita guarda o conteúdo que o dono autorizou.
// Campo novo e aditivo em pcp_chaves_escrita: `payload_autorizado` (texto). As rotas de gravação
// do pedido de compra e do pedido de venda (incluindo volumes e frete) comparam o conteúdo atual
// com este campo e recusam, sem chamar o Omie, se o pedido mudou depois da autorização.
// As chaves continuam desligadas; nada é ligado por esta migration.
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('pcp_chaves_escrita')
    if (!col.fields.getByName('payload_autorizado')) {
      col.fields.add(new TextField({ name: 'payload_autorizado', max: 20000 }))
      app.save(col)
    }
  },
  (app) => {
    const col = app.findCollectionByNameOrId('pcp_chaves_escrita')
    if (col.fields.getByName('payload_autorizado')) {
      col.fields.removeByName('payload_autorizado')
      app.save(col)
    }
  },
)
