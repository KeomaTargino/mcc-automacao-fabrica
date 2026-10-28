// pocketbase/hooks/pcp_preco_classificar.js — SPEC-3-004 CA-3-12 (RN-01, RN-02)
// POST /backend/v1/pcp/compras/historico/classificar { chave, classificacao }
// Compras classifica uma linha que o Omie não identifica (insumo, frete, serviço ou N-D). Exige
// editar_requisicao E a área compras. Só o campo de classificação muda; o dado do Omie fica como veio.
routerAdd(
  'POST',
  '/backend/v1/pcp/compras/historico/classificar',
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
      acoes.indexOf('editar_requisicao') === -1 ||
      perfil.getStringSlice('areas').indexOf('compras') === -1
    ) {
      return e.forbiddenError('sem_permissao')
    }
    const body = e.requestInfo().body || {}
    const chave = String(body.chave || '')
    const classificacao = String(body.classificacao || '')
    if (['insumo', 'frete', 'servico', 'nd'].indexOf(classificacao) === -1) {
      return e.json(422, { erro: 'classificacao_invalida' })
    }
    const partes = chave.split('|')
    if (partes.length !== 3) return e.json(422, { erro: 'linha_inexistente' })
    let rec = null
    try {
      rec = $app.findFirstRecordByFilter(
        'pcp_precos_compra',
        'aplicativo = {:a} && pedido_id = {:p} && linha_id = {:l}',
        { a: partes[0], p: partes[1], l: partes[2] },
      )
    } catch (_) {}
    if (!rec) return e.json(422, { erro: 'linha_inexistente' })
    rec.set('classificacao_compras', classificacao)
    rec.set('classificado_por', auth.getString('email') || auth.id)
    rec.set('classificado_em', new Date().toISOString())
    $app.save(rec)
    return e.json(200, { ok: true, chave: chave, classificacao: classificacao })
  },
  $apis.requireAuth(),
)
