// pocketbase/hooks/pcp_piloto.js — SPEC-2-001 CA-D1/D2/D3 (task 5d8793fb)
// Transporte puro dos dados REAIS do produto piloto M011001 (aprovado pelo owner em
// 20/10/2026): produto (ConsultarProduto), ficha (ConsultarEstrutura/malha) e locais
// (ListarLocaisEstoque). SEM lógica de conciliação aqui — a regra (unidade oficial,
// ficha verbatim, bloqueios) vive no contrato src/lib/pcp/conciliacao.ts, aplicado
// no frontend. Falha de rede → estado explícito, nada inventado.
// Gate: área 'catalogo' (mesma autoridade do catálogo; não concede estoque).
routerAdd(
  'GET',
  '/backend/v1/pcp/piloto',
  (e) => {
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Sessão ausente ou expirada.')
    let perfil = null
    try {
      perfil = $app.findFirstRecordByFilter('pcp_perfis', 'usuario = {:u}', { u: auth.id })
    } catch (_) {}
    if (!perfil || !perfil.getBool('ativo')) return e.forbiddenError('perfil_invalido')
    const areas = perfil.getStringSlice('areas')
    if (areas.indexOf('catalogo') === -1) return e.forbiddenError('area_nao_autorizada')

    const appKey = $secrets.get('OMIE_APP_KEY')
    const appSecret = $secrets.get('OMIE_APP_SECRET')
    if (!appKey || !appSecret) {
      return e.json(200, { disponivel: false, motivo: 'credencial_ausente' })
    }
    const COD = 'M011001'
    const chamar = (endpoint, call, param) => {
      try {
        const res = $http.send({
          url: endpoint,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            call: call,
            app_key: appKey,
            app_secret: appSecret,
            param: [param],
          }),
          timeout: 15,
        })
        return { status: res.statusCode, json: res.json || {} }
      } catch (err) {
        return { status: 0, json: {}, erro: String(err) }
      }
    }

    const rProduto = chamar('https://app.omie.com.br/api/v1/geral/produtos/', 'ConsultarProduto', {
      codigo: COD,
    })
    if (rProduto.status !== 200 || !rProduto.json.codigo) {
      return e.json(200, {
        disponivel: false,
        motivo: 'fonte_indisponivel',
        detalhe:
          'ConsultarProduto status ' + rProduto.status + (rProduto.erro ? ' ' + rProduto.erro : ''),
      })
    }
    const p = rProduto.json
    const produto = {
      produto_id: String(p.codigo_produto || ''),
      codigo: String(p.codigo || ''),
      descricao: String(p.descricao || ''),
      unidade: String(p.unidade || ''),
      familia: String(p.descricao_familia || ''),
      ativo: String(p.inativo || 'N') === 'N' ? 'S' : 'N',
    }

    const rFicha = chamar('https://app.omie.com.br/api/v1/geral/malha/', 'ConsultarEstrutura', {
      codProduto: COD,
    })
    let ficha = null
    if (rFicha.status === 200 && Array.isArray(rFicha.json.itens)) {
      // Itens verbatim da fonte (identidade/quantidade/unidade/perda/tipo) — sem conversão.
      ficha = {
        itens: rFicha.json.itens.map((i) => ({
          insumo: String(i.codProdMalha || ''),
          descricao: String(i.descrProdMalha || ''),
          quantidade:
            i.quantProdMalha !== undefined && i.quantProdMalha !== null
              ? Number(i.quantProdMalha)
              : null,
          unidade: String(i.unidProdMalha || ''),
          perda_pct:
            i.percPerdaProdMalha !== undefined && i.percPerdaProdMalha !== null
              ? Number(i.percPerdaProdMalha)
              : null,
          tipo: String(i.tipoProdMalha || ''),
        })),
      }
    }

    const rLocais = chamar('https://app.omie.com.br/api/v1/estoque/local/', 'ListarLocaisEstoque', {
      nPagina: 1,
      nRegPorPagina: 50,
    })
    const locais = (
      rLocais.status === 200 && Array.isArray(rLocais.json.locaisEncontrados)
        ? rLocais.json.locaisEncontrados
        : []
    ).map((l) => ({
      local_id: String(l.codigo_local_estoque || ''),
      descricao: String(l.descricao || ''),
      padrao: String(l.padrao || 'N') === 'S',
      inativo: String(l.inativo || 'N') === 'S',
    }))

    // Unidades registradas nas linhas de estoque do lote ATIVO para este produto
    // (dados legados podem ter 'UN' do defaultUN da F1 — sinalizados, não convertidos).
    const unidadesEstoque = []
    let loteEstoque = ''
    try {
      const fonteEstoque = $app.findFirstRecordByFilter(
        'pcp_fontes',
        "fonte = 'omie' && recurso = 'estoque' && aplicativo_ref = 'app1'",
        {},
      )
      loteEstoque = fonteEstoque.getString('lote_ativo') || ''
      if (loteEstoque) {
        const regs = $app.findRecordsByFilter(
          'pcp_dados',
          'lote = {:l} && chave_origem ~ {:k}',
          'id',
          2000,
          0,
          { l: loteEstoque, k: 'omie:estoque:app1:' + produto.produto_id + ':' },
        )
        for (const r of regs) {
          let ie = {}
          try {
            ie = JSON.parse(r.getString('conteudo') || '{}') || {}
          } catch (_) {}
          const u = String(ie.unidade || '').trim()
          if (u && unidadesEstoque.indexOf(u) === -1) unidadesEstoque.push(u)
        }
      }
    } catch (_) {}

    return e.json(200, {
      disponivel: true,
      piloto: { codigo: COD, aprovado_por: 'owner (opcao 1, 20/10/2026)' },
      produto,
      ficha,
      locais,
      unidades_estoque: unidadesEstoque,
      lote_estoque: loteEstoque || null,
      atualizado_em: new Date().toISOString(),
    })
  },
  $apis.requireAuth(),
)
