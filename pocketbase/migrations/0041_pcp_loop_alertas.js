// Migration 0041 — LOOP-01 alertas críticos tratados (SPEC-3-013, CA-3-37/38)
// Aditiva e reversível; duas coleções com regras null (só o servidor, pelos hooks
// /backend/v1/pcp/alertas/loop*). O loop nasce DESLIGADO: a linha de configuração só existe depois que
// alguém a grava, e ligar exige linha de base, alvo, janela e validador (CL-PEND-005).
// - pcp_loop_config: uma linha por loop (LOOP-01).
// - pcp_loop_medicoes: uma medição por ciclo (loop + início); o veredito do validador a congela.
// O loop só mede, lembra e registra o veredito: não trata alerta, não compra e não reprograma.
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
      'pcp_loop_config',
      [
        { name: 'loop', type: 'text', required: true },
        { name: 'ativo', type: 'bool' },
        { name: 'baseline_pct', type: 'number' },
        { name: 'baseline_definida', type: 'bool' },
        { name: 'alvo_pct', type: 'number' },
        { name: 'janela_dias', type: 'number' },
        { name: 'validador', type: 'text' },
        { name: 'definido_por', type: 'text' },
        { name: 'definido_em', type: 'date' },
      ],
      ['CREATE UNIQUE INDEX idx_pcp_loop_config ON pcp_loop_config (loop)'],
    )
    criar(
      'pcp_loop_medicoes',
      [
        { name: 'loop', type: 'text', required: true },
        { name: 'ciclo_inicio', type: 'text', required: true },
        { name: 'ciclo_fim', type: 'text' },
        { name: 'gerados', type: 'number' },
        { name: 'tratados', type: 'number' },
        { name: 'proporcao_pct', type: 'number' },
        { name: 'nao_aplicavel', type: 'bool' },
        { name: 'pendente', type: 'bool' },
        { name: 'motivo_pendente', type: 'text' },
        { name: 'veredito', type: 'text' },
        { name: 'veredito_por', type: 'text' },
        { name: 'veredito_em', type: 'date' },
        { name: 'veredito_texto', type: 'text' },
        { name: 'congelada', type: 'bool' },
        { name: 'calculado_em', type: 'date' },
      ],
      ['CREATE UNIQUE INDEX idx_pcp_loop_medicoes ON pcp_loop_medicoes (loop, ciclo_inicio)'],
    )
  },
  (app) => {
    for (const nome of ['pcp_loop_medicoes', 'pcp_loop_config']) {
      try {
        app.delete(app.findCollectionByNameOrId(nome))
      } catch (_) {
        // coleção já inexistente: down idempotente
      }
    }
  },
)
