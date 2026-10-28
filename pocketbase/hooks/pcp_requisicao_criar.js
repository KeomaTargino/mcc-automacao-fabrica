// pocketbase/hooks/pcp_requisicao_criar.js — SPEC-3-005 CA-3-14 (RN-01, RN-05)
// POST /backend/v1/pcp/compras/requisicoes { necessidades: [{ origem, item, fornecedor, quantidade_estoque,
//   apresentacao, unidade_compra, data_necessaria, emergencial, motivo_emergencia }] }
// Cria UMA requisição por fornecedor (e data/emergência). Exige editar_requisicao E a área compras.
// A unidade de estoque vem do catálogo real, nunca do navegador; item fora do catálogo é barrado
// ("cadastrar no Omie antes de comprar") salvo exceção autorizada. Repetir a mesma origem não duplica
// (índice único em pcp_requisicao_origens). Regras de src/lib/pcp/requisicao.ts.
routerAdd(
  'POST',
  '/backend/v1/pcp/compras/requisicoes',
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
    const norm = (c) =>
      String(c || '')
        .trim()
        .toUpperCase()
    const necessidades = (e.requestInfo().body || {}).necessidades
    if (!Array.isArray(necessidades) || necessidades.length === 0) {
      return e.json(422, { erro: 'dados_invalidos', motivos: ['nenhuma necessidade informada'] })
    }

    // catálogo ativo: código → unidade
    const catalogo = {}
    let catalogoLido = false
    try {
      const fonte = $app.findFirstRecordByFilter(
        'pcp_fontes',
        "fonte = 'omie' && recurso = 'produtos' && aplicativo_ref = 'app1'",
        {},
      )
      const lote = fonte.getString('lote_ativo')
      if (lote) {
        catalogoLido = true
        const cat = $app.findRecordsByFilter('pcp_dados', 'lote = {:l}', 'id', 20000, 0, {
          l: lote,
        })
        for (const r of cat) {
          try {
            const c = JSON.parse(r.getString('conteudo') || '{}') || {}
            if (c.codigo) catalogo[norm(c.codigo)] = String(c.unidade || '').trim()
          } catch (_) {}
        }
      }
    } catch (_) {}
    if (!catalogoLido) {
      return e.json(423, {
        erro: 'catalogo_indisponivel',
        motivo: 'não foi possível conferir o cadastro do Omie agora; tente de novo mais tarde',
      })
    }

    const motivos = []
    const bloqueados = []
    const grupos = {}
    let jaExistiam = 0
    for (const n of necessidades) {
      const item = norm(n.item)
      const qtd = Number(n.quantidade_estoque)
      const origem = String(n.origem || '').trim()
      if (!item || !origem) {
        motivos.push('item e origem obrigatórios')
        continue
      }
      if (!isFinite(qtd) || qtd <= 0) {
        motivos.push(item + ': quantidade precisa ser maior que zero')
        continue
      }
      if (!String(n.data_necessaria || '').trim()) {
        motivos.push(item + ': data necessária obrigatória')
        continue
      }
      if (n.emergencial && !String(n.motivo_emergencia || '').trim()) {
        motivos.push(item + ': compra emergencial exige o motivo')
        continue
      }
      try {
        $app.findFirstRecordByFilter('pcp_requisicao_origens', 'origem = {:o}', { o: origem })
        jaExistiam++
        continue
      } catch (_) {}
      let liberado = catalogo[item] !== undefined
      if (!liberado) {
        try {
          $app.findFirstRecordByFilter(
            'pcp_excecoes_compra',
            "item = {:i} && documento = 'requisicao' && documento_id = {:d} && estado = 'aberta'",
            { i: item, d: origem },
          )
          liberado = true
        } catch (_) {}
      }
      if (!liberado) {
        bloqueados.push({ item: item, mensagem: 'cadastrar no Omie antes de comprar' })
        continue
      }
      const forn = String(n.fornecedor || '').trim()
      const apresentacao = String(n.apresentacao || '').trim()
      const unidadeCompra = String(n.unidade_compra || '').trim()
      let fator = null
      if (apresentacao) {
        let melhor = null
        const lista = $app.findRecordsByFilter(
          'pcp_conversoes',
          'item = {:i} && apresentacao = {:a} && (fornecedor = {:f} || fornecedor = "")',
          '-versao',
          50,
          0,
          { i: item, a: apresentacao, f: forn },
        )
        for (const c of lista) {
          const doForn = c.getString('fornecedor') === forn && forn !== ''
          const atual = { forn: doForn, versao: Number(c.get('versao') || 0), rec: c }
          if (
            !melhor ||
            (atual.forn && !melhor.forn) ||
            (atual.forn === melhor.forn && atual.versao > melhor.versao)
          ) {
            melhor = atual
          }
        }
        if (
          melhor &&
          melhor.rec.getString('unidade_compra') === unidadeCompra &&
          melhor.rec.getString('unidade_estoque')
        ) {
          fator = { valor: Number(melhor.rec.get('fator')), versao: melhor.versao }
        }
      }
      const fornecedor = forn || 'a definir'
      const chave =
        fornecedor +
        '|' +
        n.data_necessaria +
        '|' +
        (n.emergencial ? 'E:' + String(n.motivo_emergencia).trim() : 'N')
      if (!grupos[chave]) {
        grupos[chave] = {
          fornecedor: fornecedor,
          data: String(n.data_necessaria),
          emergencial: !!n.emergencial,
          motivo: n.emergencial ? String(n.motivo_emergencia).trim() : '',
          itens: [],
          origem: [],
        }
      }
      grupos[chave].itens.push({
        item: item,
        fornecedor: forn || null,
        quantidadeEstoque: qtd,
        unidadeEstoque: catalogo[item] || '',
        apresentacao: apresentacao || null,
        unidadeCompra: unidadeCompra || null,
        quantidadeCompra: fator ? Math.round((qtd / fator.valor) * 1e6) / 1e6 : null,
        fatorUsado: fator ? fator.valor : null,
        fatorVersao: fator ? fator.versao : null,
        pendencias: fator ? [] : ['sem fator confirmado: quantidade só na unidade de estoque'],
      })
      grupos[chave].origem.push(origem)
    }
    if (motivos.length > 0) return e.json(422, { erro: 'dados_invalidos', motivos: motivos })

    const criadas = []
    try {
      $app.runInTransaction((tx) => {
        const col = tx.findCollectionByNameOrId('pcp_requisicoes')
        const colO = tx.findCollectionByNameOrId('pcp_requisicao_origens')
        for (const k of Object.keys(grupos)) {
          const g = grupos[k]
          const r = new Record(col)
          r.set('fornecedor', g.fornecedor)
          r.set('itens', JSON.stringify(g.itens))
          r.set('data_necessaria', g.data)
          r.set('emergencial', g.emergencial)
          r.set('motivo_emergencia', g.motivo)
          r.set('estado', 'rascunho')
          r.set('versao', 1)
          r.set('origem', JSON.stringify(g.origem))
          r.set('criado_por', auth.getString('email') || auth.id)
          r.set('criado_em', new Date().toISOString())
          tx.save(r)
          for (const o of g.origem) {
            const ro = new Record(colO)
            ro.set('origem', o)
            ro.set('requisicao', r.id)
            tx.save(ro)
          }
          criadas.push({ id: r.id, fornecedor: g.fornecedor, itens: g.itens.length })
        }
      })
    } catch (_) {
      return e.json(409, {
        erro: 'conflito',
        motivo: 'outra criação chegou ao mesmo tempo para a mesma sugestão; recarregue e confira',
      })
    }
    return e.json(200, { requisicoes: criadas, ja_existiam: jaExistiam, bloqueados: bloqueados })
  },
  $apis.requireAuth(),
)
