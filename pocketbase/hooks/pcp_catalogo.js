// pocketbase/hooks/pcp_catalogo.js — SPEC-1-004 (CA-C1/C2/C3/C4)
// Catálogo de LEITURA sobre o snapshot ativo (pcp_fontes/pcp_lotes/pcp_dados) — sem nova
// autoridade de produto, sem escrita no Omie. Área 'catalogo' obrigatória no servidor;
// saldo por local exige SEPARADAMENTE a área 'estoque' (CA-C4 — catálogo não concede estoque).
// Regras da SPEC: produto identificado por produto_id (código igual NUNCA mescla — C1);
// ficha sem contrato comprovado na conta → estado explícito 'ficha_indisponivel' (C3),
// nunca receita vazia com zero; unidade ausente → 'unidade_ausente' (não preencher UN);
// CA-C3 (task ece1553b): diferenciar produto INATIVO de ausência de leitura, unidade
// AUSENTE e unidade INCOMPATÍVEL entre cadastro e saldo — nunca converter nem somar
// unidades distintas; consulta nunca altera o mestre.
routerAdd(
  'GET',
  '/backend/v1/pcp/catalogo',
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

    let fonte = null
    try {
      fonte = $app.findFirstRecordByFilter(
        'pcp_fontes',
        "fonte = 'omie' && recurso = 'produtos' && aplicativo_ref = 'app1'",
        {},
      )
    } catch (_) {}
    const loteAtivo = fonte ? fonte.getString('lote_ativo') : ''
    if (!fonte || !loteAtivo) {
      return e.json(200, {
        disponivel: false,
        motivo: 'cadastro_omnie_vazio',
        pendencias: [
          'Cadastro de produtos do Omie VAZIO na conta (0 registros) — povoar o cadastro no ERP para o catálogo reconciliar; enquanto isso, a lista fica explicitamente vazia (nada é inventado).',
        ],
      })
    }
    const q = e.requestInfo().query
    const busca = String(q.busca || '').trim()
    let pagina = Number(q.pagina || 1)
    if (!Number.isFinite(pagina) || pagina < 1) pagina = 1
    const porPagina = 50

    // Sem concatenação de entrada em filtro: busca aplicada EM MEMÓRIA sobre o snapshot
    // (IDs/descrições são dados da fonte; filtro parametrizado por lote).
    const regs = $app.findRecordsByFilter('pcp_dados', 'lote = {:l}', 'id', 20000, 0, {
      l: loteAtivo,
    })
    const produtos = []
    for (const r of regs) {
      let it = {}
      try {
        it = JSON.parse(r.getString('conteudo') || '{}') || {}
      } catch (_) {}
      const codigo = String(it.codigo || '')
      const descricao = String(it.descricao || '')
      if (busca) {
        const b = busca.toLowerCase()
        if (codigo.toLowerCase().indexOf(b) === -1 && descricao.toLowerCase().indexOf(b) === -1)
          continue
      }
      produtos.push({
        produto_id: String(it.produto_id || ''),
        codigo,
        descricao,
        unidade: String(it.unidade || ''),
        ativo: String(it.ativo || ''),
        familia: String(it.familia || ''),
      })
    }
    const total = produtos.length
    const paginas = Math.max(1, Math.ceil(total / porPagina))
    if (pagina > paginas) pagina = paginas
    const fatia = produtos.slice((pagina - 1) * porPagina, pagina * porPagina)
    const pendencias = []
    if (total === 0) {
      pendencias.push(
        busca
          ? 'Nenhum produto encontrado para a busca.'
          : 'Lote ativo sem produtos (cadastro vazio na origem).',
      )
    }
    return e.json(200, {
      disponivel: true,
      fonte: 'omie',
      lote_ativo: loteAtivo,
      atualizado_em: fonte.getString('ultimo_sucesso') || null,
      total,
      pagina,
      paginas,
      busca,
      produtos: fatia,
      pendencias,
    })
  },
  $apis.requireAuth(),
)

routerAdd(
  'GET',
  '/backend/v1/pcp/catalogo/{produtoId}',
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
    const produtoId = e.request.pathValue('produtoId')

    let fonte = null
    try {
      fonte = $app.findFirstRecordByFilter(
        'pcp_fontes',
        "fonte = 'omie' && recurso = 'produtos' && aplicativo_ref = 'app1'",
        {},
      )
    } catch (_) {}
    const loteAtivo = fonte ? fonte.getString('lote_ativo') : ''
    if (!fonte || !loteAtivo) {
      return e.json(200, {
        disponivel: false,
        motivo: 'cadastro_omnie_vazio',
        pendencias: [
          'Cadastro de produtos do Omie VAZIO na conta — item não pode ser exibido sem dado oficial.',
        ],
      })
    }
    // Identidade por produto_id (chave do item = aplicativo_ref+produto_id) — código não é identidade.
    let rec = null
    try {
      rec = $app.findFirstRecordByFilter('pcp_dados', 'lote = {:l} && chave_origem = {:k}', {
        l: loteAtivo,
        k: 'omie:produtos:app1:' + produtoId,
      })
    } catch (_) {}
    if (!rec) {
      return e.json(200, { disponivel: false, motivo: 'produto_nao_encontrado' })
    }
    let it = {}
    try {
      it = JSON.parse(rec.getString('conteudo') || '{}') || {}
    } catch (_) {}
    const unidade = String(it.unidade || '')
    const ativo = String(it.ativo || '')
    const produto = {
      produto_id: String(it.produto_id || ''),
      codigo: String(it.codigo || ''),
      descricao: String(it.descricao || ''),
      unidade,
      ativo,
      familia: String(it.familia || ''),
      origem_lote: loteAtivo,
      atualizado_em: fonte.getString('ultimo_sucesso') || null,
    }
    // CA-C3: estados explícitos — inatividade ≠ ausência de leitura; unidade ausente
    // impede cálculo/conversão daquele item; nada vira zero/default.
    const pendencias = []
    const inativo = ativo === 'N'
    if (inativo)
      pendencias.push(
        'Produto INATIVO no cadastro do Omie (preservado no catálogo — inatividade não apaga histórico).',
      )
    const unidadeAusente = unidade === ''
    if (unidadeAusente)
      pendencias.push(
        'Unidade AUSENTE no cadastro — conversão e cálculo ficam IMPEDIDOS para este item (nada é preenchido por padrão).',
      )
    // C3: ficha sem contrato comprovado na conta → estado explícito, sem receita vazia.
    const ficha = { disponivel: false, motivo: 'ficha_indisponivel_sem_contrato' }
    // C4: saldo só com área estoque SEPARADA; nunca vaza por UI ou API só porque tem catálogo.
    let saldo = { disponivel: false, motivo: 'area_estoque_nao_autorizada' }
    if (areas.indexOf('estoque') !== -1) {
      let fonteEstoque = null
      try {
        fonteEstoque = $app.findFirstRecordByFilter(
          'pcp_fontes',
          "fonte = 'omie' && recurso = 'estoque' && aplicativo_ref = 'app1'",
          {},
        )
      } catch (_) {}
      const loteEstoque = fonteEstoque ? fonteEstoque.getString('lote_ativo') : ''
      if (!fonteEstoque || !loteEstoque) {
        saldo = { disponivel: false, motivo: 'estoque_sem_lote_ativo' }
      } else {
        const regsEstoque = $app.findRecordsByFilter(
          'pcp_dados',
          'lote = {:l} && chave_origem ~ {:k}',
          'id',
          2000,
          0,
          { l: loteEstoque, k: 'omie:estoque:app1:' + produtoId + ':' },
        )
        // CA-C3: linha de saldo com unidade DIFERENTE da unidade do cadastro é sinalizada
        // como incompatível — exibida como informada, SEM conversão e SEM soma entre unidades.
        const porLocal = regsEstoque.map((re) => {
          let ie = {}
          try {
            ie = JSON.parse(re.getString('conteudo') || '{}') || {}
          } catch (_) {}
          const unLinha = String(ie.unidade || '')
          // 5d8793fb: linha sem unidade herda a oficial do cadastro (join); linha com
          // unidade própria divergente fica INCOMPATÍVEL — exibida como veio, sem conversão.
          return {
            local_id: String(ie.local_id || ''),
            unidade: unLinha || unidade,
            unidade_registrada: unLinha,
            unidade_oficial: unidade || null,
            saldo: ie.saldo !== undefined ? ie.saldo : null,
            fisico: ie.fisico !== undefined ? ie.fisico : null,
            reservado: ie.reservado !== undefined ? ie.reservado : null,
            unidade_incompativel: Boolean(unidade && unLinha && unidade !== unLinha),
          }
        })
        saldo =
          porLocal.length > 0
            ? { disponivel: true, por_local: porLocal }
            : { disponivel: false, motivo: 'sem_saldo_registrado' }
      }
    }
    return e.json(200, { disponivel: true, produto, ficha, saldo, pendencias })
  },
  $apis.requireAuth(),
)
