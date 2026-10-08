// pocketbase/hooks/pcp_sync_estado.js — SPEC-1-002/1-003
// Metadados por área: sem dado bruto, sem segredo. Mostra último sucesso, última tentativa,
// lote ativo, conferência e estado técnico (indisponível ≠ zero; falha ≠ dado novo).
routerAdd(
  'GET',
  '/backend/v1/pcp/sync/estado',
  (e) => {
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Sessão ausente ou expirada.')
    let perfil = null
    try {
      perfil = $app.findFirstRecordByFilter('pcp_perfis', 'usuario = {:u}', { u: auth.id })
    } catch (_) {}
    const areas = perfil && perfil.getBool('ativo') ? perfil.getStringSlice('areas') : []
    const podeSync = perfil && perfil.getBool('ativo') && perfil.getBool('pode_atualizar_fontes')

    // Recursos visíveis por área: estoque→[estoque], pedidos→[pedidos]; catálogo entra na SPEC-1-004.
    const mapaAreas = { estoque: 'estoque', pedidos: 'pedidos', produtos: 'catalogo' }

    const todos = $app.findRecordsByFilter(
      'pcp_fontes',
      "aplicativo_ref = 'app1'",
      'fonte,recurso',
      50,
      0,
    )
    const fontes = []
    for (const f of todos) {
      const recurso = f.getString('recurso')
      const area = mapaAreas[recurso]
      if (!area || areas.indexOf(area) === -1) continue // diagnóstico só da área permitida
      let totalItens = 0
      let conferencia = null
      const loteAtivo = f.getString('lote_ativo')
      if (loteAtivo) {
        try {
          const lote = $app.findRecordById('pcp_lotes', loteAtivo)
          totalItens = Number(lote.get('total_itens') || 0)
          const conf = lote.getString('conferencia') || ''
          if (conf) {
            try {
              conferencia = JSON.parse(conf)
            } catch (_) {
              conferencia = null
            }
          }
        } catch (_) {}
      }
      fontes.push({
        fonte: f.getString('fonte'),
        recurso,
        estado_tecnico: f.getString('estado_tecnico'),
        geracao: Number(f.get('geracao') || 0),
        lote_ativo: loteAtivo,
        total_itens: totalItens,
        conferencia,
        ultima_tentativa: f.getString('ultima_tentativa') || null,
        ultimo_sucesso: f.getString('ultimo_sucesso') || null,
        em_andamento: Boolean(f.getString('execucao_ativa')),
      })
    }
    return e.json(200, { pode_atualizar_fontes: podeSync, fontes })
  },
  $apis.requireAuth(),
)
