// pocketbase/hooks/pcp_pedido_duplicata_decidir.js — SPEC-3-009 CA-3-28 (RN-05)
// POST /backend/v1/pcp/faturamento/pedido/duplicata { pedido_id, decisao: 'nao_e_duplicata'|'e_duplicata', motivo, versao_esperada }
// O faturamento decide, COM MOTIVO, um pedido manual marcado "a revisar" (possível duplicata). Duplicata
// comprovada por referência não se decide aqui: continua bloqueada. Exige preparar_pedido E a área
// faturamento. A decisão fica no registro do pedido manual (autor e hora) e a fila a considera.
routerAdd(
  'POST',
  '/backend/v1/pcp/faturamento/pedido/duplicata',
  (e) => {
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Sessão ausente ou expirada.')
    let perfil = null
    try {
      perfil = $app.findFirstRecordByFilter('pcp_perfis', 'usuario = {:u}', { u: auth.id })
    } catch (_) {}
    let acoes = []
    try {
      acoes = JSON.parse((perfil && perfil.getString('acoes')) || '[]') || []
    } catch (_) {
      acoes = []
    }
    if (
      !perfil ||
      !perfil.getBool('ativo') ||
      !Array.isArray(acoes) ||
      acoes.indexOf('preparar_pedido') === -1 ||
      perfil.getStringSlice('areas').indexOf('faturamento') === -1
    ) {
      return e.forbiddenError('sem_permissao')
    }
    const b = e.requestInfo().body || {}
    const decisao = String(b.decisao || '')
    const motivo = String(b.motivo || '').trim()
    if (['nao_e_duplicata', 'e_duplicata'].indexOf(decisao) === -1 || motivo.length < 3) {
      return e.json(422, {
        erro: 'dados_invalidos',
        motivos: ['escolha a decisão e informe o motivo'],
      })
    }
    let m = null
    try {
      m = $app.findFirstRecordByFilter('pcp_pedidos_manuais', 'pedido_id = {:p}', {
        p: String(b.pedido_id || ''),
      })
    } catch (_) {}
    if (!m || m.getString('estado') !== 'a_revisar' || m.getString('decisao') !== '') {
      return e.json(422, {
        erro: 'dados_invalidos',
        motivos: ['só a possível duplicata ainda não decidida pode ser decidida'],
      })
    }
    m.set('decisao', decisao)
    m.set('decisao_motivo', motivo)
    m.set('decisao_por', auth.getString('email') || auth.id)
    m.set('decisao_em', new Date().toISOString())
    $app.save(m)
    try {
      const prep = $app.findFirstRecordByFilter('pcp_preparacao_pedido', 'pedido_id = {:p}', {
        p: m.getString('pedido_id'),
      })
      if (prep.getString('liberacao_hash') !== '') {
        prep.set('liberacao_hash', '')
        prep.set('versao', Number(prep.get('versao') || 0) + 1)
        $app.save(prep)
      }
    } catch (_) {}
    return e.json(200, { ok: true, pedido_id: m.getString('pedido_id'), decisao: decisao })
  },
  $apis.requireAuth(),
)
