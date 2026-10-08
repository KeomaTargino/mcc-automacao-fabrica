// pocketbase/hooks/pcp_conferir_fonte.js — SPEC-1-002 task a5b75aca (CA-O1–O4)
// Conferência da integração com dados autorizados:
// 1) reconcilia contagem do lote ativo com nTotRegistros/nTotPaginas do Omie (1 chamada real);
// 2) valida credencial real: 403/401 → credencial_recusada (sem retry, sem falso sucesso);
// 3) registra o resultado no lote ativo (campo conferencia) e devolve relatório.
// Escrita em transação curta; rede fora de transação; sem segredo na resposta.
routerAdd(
  'POST',
  '/backend/v1/pcp/conferir-fonte',
  (e) => {
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Sessão ausente ou expirada.')
    let perfil = null
    try {
      perfil = $app.findFirstRecordByFilter('pcp_perfis', 'usuario = {:u}', { u: auth.id })
    } catch (_) {}
    if (!perfil || !perfil.getBool('ativo') || !perfil.getBool('pode_atualizar_fontes')) {
      return e.forbiddenError('sem_permissao_tecnica')
    }
    const body = e.requestInfo().body
    const recurso = String(body.recurso || 'estoque')
    if (recurso !== 'estoque') return e.badRequestError('recurso_nao_reconciliado')

    let fonte = null
    try {
      fonte = $app.findFirstRecordByFilter(
        'pcp_fontes',
        "fonte = 'omie' && recurso = {:r} && aplicativo_ref = 'app1'",
        { r: recurso },
      )
    } catch (_) {}
    if (!fonte) return e.badRequestError('fonte_ausente')
    const loteAtivoId = fonte.getString('lote_ativo')
    if (!loteAtivoId) return e.badRequestError('lote_ativo_ausente')
    let lote = null
    try {
      lote = $app.findRecordById('pcp_lotes', loteAtivoId)
    } catch (_) {}
    if (!lote) return e.badRequestError('lote_ativo_ausente')

    // === Rede FORA da transação: 1 chamada real de contagem (página 1, 1 registro) ===
    const appKey = $secrets.get('OMIE_APP_KEY')
    const appSecret = $secrets.get('OMIE_APP_SECRET')
    if (!appKey || !appSecret) return e.badRequestError('credencial_ausente')
    let esperado = 0
    let conferido = Number(lote.get('total_itens') || 0)
    let resultado = ''
    let detalhe = ''
    try {
      const res = $http.send({
        url: 'https://app.omie.com.br/api/v1/estoque/consulta/',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          call: 'ListarPosEstoque',
          app_key: appKey,
          app_secret: appSecret,
          param: [{ nPagina: 1, nRegPorPagina: 1, dDataPosicao: '', cExibeTodos: 'S' }],
        }),
        timeout: 15,
      })
      if (res.statusCode === 401 || res.statusCode === 403) {
        // credencial recusada: registra e NÃO altera lote (prova de credencial inválida)
        resultado = 'credencial_recusada'
        detalhe = 'HTTP ' + res.statusCode + ' do Omie na conferência'
      } else if (res.statusCode >= 200 && res.statusCode < 300) {
        const j = res.json
        esperado = Number((j && j.nTotRegistros) || 0)
        if (esperado > 0 && esperado === conferido) {
          resultado = 'conferido'
          detalhe = 'total do lote (' + conferido + ') = nTotRegistros do Omie (' + esperado + ')'
        } else {
          resultado = 'divergencia'
          detalhe =
            'lote ' +
            conferido +
            ' × Omie ' +
            esperado +
            ' (janela/defasagem esperada entre leituras)'
        }
      } else {
        resultado = 'falha_http_' + res.statusCode
        detalhe = 'conferência não concluída; lote anterior preservado'
      }
    } catch (err) {
      resultado = 'falha_transporte'
      detalhe = 'conferência não concluída; lote anterior preservado'
    }

    // Registra a conferência no lote ativo (transação curta)
    $app.runInTransaction((tx) => {
      lote.set(
        'conferencia',
        JSON.stringify({
          esperado,
          conferido,
          resultado,
          detalhe,
          conferido_em: new Date().toISOString(),
        }),
      )
      tx.save(lote)
      fonte.set('ultima_tentativa', new Date().toISOString())
      tx.save(fonte)
    })
    return e.json(200, {
      recurso,
      lote: loteAtivoId,
      conferencia: { esperado, conferido, resultado, detalhe },
    })
  },
  $apis.requireAuth(),
)
