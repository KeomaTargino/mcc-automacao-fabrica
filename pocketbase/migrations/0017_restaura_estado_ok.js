// 0017_restaura_estado_ok.js — SPEC-1-005 CA-P3: limpeza da prova do lote antigo
// (0016 marcou estado_tecnico=falha_teste_lote_antigo para provar o aviso; este down
// restaura 'ok' — padrão das migrations temporárias 0005–0008)
migrate(
  (app) => {
    const f = app.findFirstRecordByFilter(
      'pcp_fontes',
      "fonte = 'omie' && recurso = 'estoque' && aplicativo_ref = 'app1'",
      {},
    )
    f.set('estado_tecnico', 'ok')
    app.save(f)
  },
  (app) => {},
)
