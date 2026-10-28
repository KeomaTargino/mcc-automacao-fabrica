// pocketbase/hooks/pcp_pedido_conferir.js — SPEC-3-006 CA-3-18 (RN-05)
// POST /backend/v1/pcp/compras/pedido/conferir { requisicao }
// Só LEITURA (ConsultarPedCompra pelo código de integração = id da compra). Resolve um lançamento em
// "resultado_incerto": se o pedido existe, liga ao número; se não, continua incerto. NUNCA grava no
// Omie e nunca repete o lançamento. Uma consulta por chamada; bloqueio por excesso de consultas
// (HTTP 425 / "consumo redundante") devolve aviso e mantém o estado. Exige editar_requisicao E compras.
routerAdd(
  'POST',
  '/backend/v1/pcp/compras/pedido/conferir',
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
    const id = String((e.requestInfo().body || {}).requisicao || '')
    let v = null
    try {
      v = $app.findFirstRecordByFilter('pcp_pedidos_compra_vinculo', 'requisicao = {:r}', { r: id })
    } catch (_) {}
    if (!v) return e.json(404, { erro: 'sem_vinculo' })
    if (v.getString('estado') !== 'resultado_incerto' && v.getString('estado') !== 'enviando') {
      return e.json(409, { erro: 'nada_a_conferir', estado: v.getString('estado') })
    }
    const appKey = $secrets.get('OMIE_APP_KEY')
    const appSecret = $secrets.get('OMIE_APP_SECRET')
    if (!appKey || !appSecret) return e.badRequestError('credencial_ausente')
    let status = 0
    let j = null
    try {
      const res = $http.send({
        url: 'https://app.omie.com.br/api/v1/produtos/pedidocompra/',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          call: 'ConsultarPedCompra',
          app_key: appKey,
          app_secret: appSecret,
          param: [{ cCodIntPed: id }],
        }),
        timeout: 30,
      })
      status = res.statusCode
      j = res.json
    } catch (_) {
      return e.json(200, {
        ok: true,
        estado: 'resultado_incerto',
        aviso: 'consulta não respondeu; tente de novo mais tarde',
      })
    }
    const faultstring = String((j && j.faultstring) || '').toLowerCase()
    if (status === 425 || faultstring.indexOf('consumo redundante') !== -1) {
      return e.json(200, {
        ok: true,
        estado: v.getString('estado'),
        aviso:
          'o Omie pediu para esperar; o estado foi mantido e a conferência pode ser repetida mais tarde',
      })
    }
    const cab = j && j.cabecalho_consulta
    if (status >= 200 && status < 300 && cab && cab.nCodPed) {
      v.set('estado', 'ligado')
      v.set('numero_omie', cab.cNumero ? String(cab.cNumero) : '')
      v.set('cod_pedido_omie', String(cab.nCodPed))
      $app.save(v)
      return e.json(200, { ok: true, estado: 'ligado', numero_omie: v.getString('numero_omie') })
    }
    // ausência não prova ausência de efeito: continua incerto, sem nova gravação
    return e.json(200, {
      ok: true,
      estado: 'resultado_incerto',
      aviso: 'o pedido não foi encontrado na consulta; nada foi gravado de novo',
    })
  },
  $apis.requireAuth(),
)
