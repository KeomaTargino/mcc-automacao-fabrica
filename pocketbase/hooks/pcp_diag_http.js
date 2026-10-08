// pocketbase/hooks/pcp_diag_http.js — DIAGNÓSTICO TEMPORÁRIO (remover após uso)
// Reconciliação: lê 3 registros do lote ativo de estoque (superuser interno) e devolve
// apenas produto_id/local_id/saldo — para conferência contra PosicaoEstoque direto.
routerAdd(
  'GET',
  '/backend/v1/pcp/diag-http',
  (e) => {
    let lote = null
    try {
      lote = $app.findFirstRecordByFilter('pcp_fontes', "fonte = 'omie' && recurso = 'estoque'", {})
    } catch (_) {}
    if (!lote) return e.json(200, { erro: 'fonte ausente' })
    const loteAtivo = lote.getString('lote_ativo')
    if (!loteAtivo) return e.json(200, { erro: 'sem lote ativo' })
    const regs = $app.findRecordsByFilter('pcp_dados', 'lote = {:l}', 'id', 3, 0, { l: loteAtivo })
    const amostra = regs.map((r) => {
      let c = {}
      try {
        c = JSON.parse(r.getString('conteudo') || '{}')
      } catch (_) {}
      return { produto_id: c.produto_id, local_id: c.local_id, saldo: c.saldo }
    })
    return e.json(200, {
      total_itens_lote: Number(lote.get('total_itens') || 0) || undefined,
      amostra_tamanho: regs.length,
      amostra,
    })
  },
  $apis.requireAuth(),
)
