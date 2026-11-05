// pocketbase/hooks/pcp_demonstracao_marca.js — SPEC-4-001, CA-4-34
// Marca `demonstracao = true` em todo registro novo das coleções de produção, compras e faturamento
// quando (a) o autor do registro é uma conta marcada como de teste no perfil (`teste`), ou (b) o registro
// é ligado a produto de demonstração (código com DEMO, COOKIE-1 ou INS-n). A marca nunca sai sozinha.
// As rotas de autorização e de envio ao Omie recusam registro marcado (422 registro_de_demonstracao).
// Regra pura: src/lib/pcp/demonstracao.ts. Não chama o Omie.
onRecordCreate(
  (e) => {
    const CAMPOS_AUTOR = [
      'autor',
      'criado_por',
      'ligado_por',
      'gravado_por',
      'publicada_por',
      'aprovador',
      'autorizada_por',
      'registrado_por',
      'decidido_por',
      'conferido_por',
      'liberado_por',
      'solicitante',
      'comprador',
      'recebido_por',
    ]
    const CAMPOS_PRODUTO = ['produto', 'item', 'produto_id']
    const r = e.record
    const demo = /DEMO|^COOKIE-1$|^INS-\d+$/i
    let marcar = r.getBool('demonstracao')
    if (!marcar) {
      for (const campo of CAMPOS_AUTOR) {
        const v = String(r.getString(campo) || '').trim()
        if (!v) continue
        try {
          const u = $app.findAuthRecordByEmail('_pb_users_auth_', v)
          const p = $app.findFirstRecordByFilter('pcp_perfis', 'usuario = {:u}', { u: u.id })
          if (p.getBool('teste')) {
            marcar = true
            break
          }
        } catch (_) {}
      }
    }
    if (!marcar) {
      for (const campo of CAMPOS_PRODUTO) {
        const v = String(r.getString(campo) || '').trim()
        if (v && demo.test(v)) {
          marcar = true
          break
        }
      }
    }
    if (!marcar && r.collection().name === 'pcp_programacoes') {
      try {
        const ops = JSON.parse(r.getString('ops') || '[]') || []
        if (ops.some((o) => demo.test(String((o && o.produto) || '')))) marcar = true
      } catch (_) {}
    }
    if (marcar) r.set('demonstracao', true)
    e.next()
  },
  'pcp_programacoes',
  'pcp_apontamentos',
  'pcp_conferencias_op',
  'pcp_aprovacoes_consolidacao',
  'pcp_transacoes_omie',
  'pcp_requisicoes',
  'pcp_cotacoes',
  'pcp_aprovacoes_compra',
  'pcp_pedidos_compra_vinculo',
  'pcp_recebimentos',
  'pcp_pedidos_manuais',
  'pcp_preparacao_pedido',
  'pcp_volumes',
  'pcp_liberacoes_faturamento',
  'pcp_gravacoes_venda',
)
