// Migration 0042 — campos de origem e estado na preparação do pedido (SPEC-3-014, CA-3-40)
// Aditiva e reversível. A fila de preparação (GET /faturamento/pedidos) passa a guardar na linha do
// pedido a origem, a unidade, a situação do canal e o último estado calculado (bloqueado, apto,
// liberado), só para o relatório de pedidos poder contar sem refazer a leitura do Omie. São cópias
// derivadas: a fila continua sendo a fonte e as recalcula a cada leitura. Nada grava no Omie.
migrate(
  (app) => {
    const c = app.findCollectionByNameOrId('pcp_preparacao_pedido')
    for (const nome of ['origem', 'unidade', 'situacao_canal', 'estado_fila']) {
      if (!c.fields.getByName(nome)) c.fields.add(new TextField({ name: nome }))
    }
    app.save(c)
  },
  (app) => {
    // Os campos ficam (inofensivos); retirá-los não devolve nada e o down precisa ser seguro.
  },
)
