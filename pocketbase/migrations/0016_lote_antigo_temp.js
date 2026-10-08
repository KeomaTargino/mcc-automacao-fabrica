// 0016_lote_antigo_temp.js — SPEC-1-005 CA-P3: PROVA de "lote antigo após erro"
// Marca a fonte estoque com estado_tecnico=falha_teste_lote_antigo (lote/último sucesso
// PRESERVADOS). Reversível: down restaura 'ok'. Remover após a prova (padrão T1–T8).
migrate(
  (app) => {
    const f = app.findFirstRecordByFilter(
      'pcp_fontes',
      "fonte = 'omie' && recurso = 'estoque' && aplicativo_ref = 'app1'",
      {},
    )
    f.set('estado_tecnico', 'falha_teste_lote_antigo')
    app.save(f)
  },
  (app) => {
    const f = app.findFirstRecordByFilter(
      'pcp_fontes',
      "fonte = 'omie' && recurso = 'estoque' && aplicativo_ref = 'app1'",
      {},
    )
    f.set('estado_tecnico', 'ok')
    app.save(f)
  },
)
