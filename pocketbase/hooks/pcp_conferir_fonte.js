// pocketbase/hooks/pcp_conferir_fonte.js — SPEC-1-002 (a5b75aca) + SPEC-1-004 (0113090a)
// Conferência da integração com dados autorizados:
// 1) reconcilia contagem do lote ativo com nTotRegistros do Omie (1 chamada real);
// 2) valida credencial real: 401/403 → credencial_recusada (sem retry, sem falso sucesso);
// 3) rate-limit/5xx/transporte → retry em ETAPAS SEPARADAS (2s/5s, máx. 3) — só registra
//    resultado quando concluída (DEFECT-1);
// 4) registra o resultado no lote ativo (campo conferencia) e devolve relatório.
// SPEC-1-004: recurso 'produtos' liberado — cadastro VAZIO na conta é reconciliável
// (0=0 é conferência válida, não divergência); amostra do lote confere identidade própria
// no PRÓPRIO lote (padrão de chave POR RECURSO: estoque inclui local/unidade na chave).
// BUG-2 corrigido (log 17:27:11): JSON.parse('') devolve undefined em goja —
// confAnterior.resultado explodia em lote novo sem conferência (400 genérico).
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
    // Allowlist de conferência (recursos reconciliados com as contas reais)
    const ALLOW_CONF = {
      estoque: {
        endpoint: 'https://app.omie.com.br/api/v1/estoque/consulta/',
        call: 'ListarPosEstoque',
        param: () => [{ nPagina: 1, nRegPorPagina: 1, dDataPosicao: '', cExibeTodos: 'S' }],
        chaveTotal: 'nTotRegistros',
      },
      produtos: {
        endpoint: 'https://app.omie.com.br/api/v1/geral/produtos/',
        call: 'ListarProdutosResumido',
        param: () => [{ pagina: 1, registros_por_pagina: 1 }],
        chaveTotal: 'total_de_registros',
      },
    }
    const cfg = ALLOW_CONF[recurso]
    if (!cfg) return e.badRequestError('recurso_nao_reconciliado')

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

    // Tentativas anteriores desta conferência (retry em etapas separadas)
    let confAnterior = {}
    try {
      confAnterior = JSON.parse(lote.getString('conferencia') || '{}') || {}
    } catch (_) {
      confAnterior = {}
    }
    const resultadoAnterior = String((confAnterior && confAnterior.resultado) || '')
    const tentativas =
      resultadoAnterior.indexOf('retry_') === 0 ? Number(resultadoAnterior.slice(6)) || 0 : 0

    // === Rede FORA da transação: 1 chamada real de contagem ===
    const appKey = $secrets.get('OMIE_APP_KEY')
    const appSecret = $secrets.get('OMIE_APP_SECRET')
    if (!appKey || !appSecret) return e.badRequestError('credencial_ausente')
    const conferido = Number(lote.get('total_itens') || 0)
    let esperado = 0
    let resultado = ''
    let detalhe = ''
    let transitorio = false
    let amostraDivergente = []
    try {
      const res = $http.send({
        url: cfg.endpoint,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          call: cfg.call,
          app_key: appKey,
          app_secret: appSecret,
          param: cfg.param(),
        }),
        timeout: 15,
      })
      if (res.statusCode === 401 || res.statusCode === 403) {
        resultado = 'credencial_recusada'
        detalhe = 'HTTP ' + res.statusCode + ' do Omie na conferência'
      } else if (res.statusCode >= 200 && res.statusCode < 300) {
        const j = res.json
        esperado = Number((j && j[cfg.chaveTotal]) || 0)
        if (esperado === conferido) {
          // 0=0 (cadastro vazio) e N=N são conferências válidas
          resultado = 'conferido'
          detalhe =
            'total do lote (' + conferido + ') = ' + cfg.chaveTotal + ' do Omie (' + esperado + ')'
          if (conferido > 0) {
            // Amostra: até 3 registros do lote conferidos por existência de identidade no
            // PRÓPRIO lote (chave por recurso — estoque inclui local/unidade na chave)
            const regs = $app.findRecordsByFilter('pcp_dados', 'lote = {:l}', 'id', 3, 0, {
              l: loteAtivoId,
            })
            for (const r of regs) {
              let it = {}
              try {
                it = JSON.parse(r.getString('conteudo') || '{}') || {}
              } catch (_) {}
              const idLote = String(it.produto_id || '')
              if (!idLote) continue
              const padraoChave =
                recurso === 'estoque'
                  ? 'omie:estoque:app1:' + idLote + ':'
                  : 'omie:produtos:app1:' + idLote
              let achou = false
              try {
                $app.findFirstRecordByFilter('pcp_dados', 'lote = {:l} && chave_origem ~ {:k}', {
                  l: loteAtivoId,
                  k: padraoChave,
                })
                achou = true
              } catch (_) {}
              if (!achou) amostraDivergente.push(idLote)
            }
            if (amostraDivergente.length > 0) {
              detalhe +=
                '; amostra com ' +
                amostraDivergente.length +
                ' registro(s) sem identidade própria (revisar)'
            }
          }
        } else {
          resultado = 'divergencia'
          detalhe =
            'lote ' +
            conferido +
            ' × Omie ' +
            esperado +
            ' (janela/defasagem esperada entre leituras)'
        }
      } else if (res.statusCode === 429 || res.statusCode >= 500) {
        resultado = 'falha_http_' + res.statusCode
        transitorio = true
        detalhe = 'fonte sob carga/limite; lote anterior preservado'
      } else {
        resultado = 'falha_http_' + res.statusCode
        detalhe = 'conferência não concluída; lote anterior preservado'
      }
    } catch (err) {
      resultado = 'falha_transporte'
      transitorio = true
      detalhe = 'fonte inacessível agora; lote anterior preservado'
    }

    // Falha transitória com tentativas restantes: agenda próxima etapa, NÃO registra como final
    if (transitorio && tentativas + 1 < 3) {
      const proxima = tentativas + 1
      return e.json(200, {
        recurso,
        lote: loteAtivoId,
        conferencia: {
          esperado: 0,
          conferido,
          resultado: 'retry_' + proxima,
          detalhe:
            'tentativa ' +
            proxima +
            ' falhou (' +
            resultado +
            '); repita em ' +
            (proxima === 1 ? '2' : '5') +
            's; lote anterior preservado',
          conferido_em: new Date().toISOString(),
        },
        proxima_em_ms: proxima === 1 ? 2000 : 5000,
      })
    }

    // Registra o resultado FINAL da conferência (transação curta)
    $app.runInTransaction((tx) => {
      lote.set(
        'conferencia',
        JSON.stringify({
          esperado,
          conferido,
          resultado,
          detalhe,
          amostra_divergente: amostraDivergente,
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
