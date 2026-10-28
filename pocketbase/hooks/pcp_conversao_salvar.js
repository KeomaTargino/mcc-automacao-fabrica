// pocketbase/hooks/pcp_conversao_salvar.js — SPEC-3-003 CA-3-11 (RN-03, RN-04)
// POST /backend/v1/pcp/compras/conversao — grava UMA VERSÃO NOVA do fator que converte a unidade de
// compra (ex.: saco 25 kg) na unidade de estoque do item. Exige editar_conversao E a área compras.
// A unidade de estoque NUNCA vem do navegador: é a do catálogo real do Omie (lote ativo de
// produtos); item fora do catálogo ou sem unidade não aceita fator. Fator <= 0 recusado.
// Quem confirmou e quando vêm do servidor. Mudar o fator cria versão nova (as anteriores ficam).
// Regras de src/lib/pcp/conversao.ts.
routerAdd(
  'POST',
  '/backend/v1/pcp/compras/conversao',
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
      acoes.indexOf('editar_conversao') === -1 ||
      perfil.getStringSlice('areas').indexOf('compras') === -1
    ) {
      return e.forbiddenError('sem_permissao')
    }
    const body = e.requestInfo().body || {}
    const item = String(body.item || '')
      .trim()
      .toUpperCase()
    const fornecedor = String(body.fornecedor || '').trim()
    const apresentacao = String(body.apresentacao || '').trim()
    const unidadeCompra = String(body.unidade_compra || '').trim()
    const fator = Number(body.fator)
    const motivos = []
    if (!item) motivos.push('item obrigatório')
    if (!apresentacao) motivos.push('apresentação de compra obrigatória')
    if (!unidadeCompra) motivos.push('unidade de compra obrigatória')
    if (!Number.isFinite(fator) || fator <= 0) motivos.push('fator precisa ser maior que zero')
    if (motivos.length > 0) return e.json(422, { erro: 'dados_invalidos', motivos: motivos })

    // Unidade de estoque: a do catálogo real (nunca do navegador).
    let fonte = null
    try {
      fonte = $app.findFirstRecordByFilter(
        'pcp_fontes',
        "fonte = 'omie' && recurso = 'produtos' && aplicativo_ref = 'app1'",
        {},
      )
    } catch (_) {}
    const lote = fonte ? fonte.getString('lote_ativo') : ''
    let unidadeEstoque = ''
    if (lote) {
      const regs = $app.findRecordsByFilter('pcp_dados', 'lote = {:l}', 'id', 20000, 0, { l: lote })
      for (const r of regs) {
        try {
          const it = JSON.parse(r.getString('conteudo') || '{}') || {}
          if (
            String(it.codigo || '')
              .trim()
              .toUpperCase() === item
          ) {
            unidadeEstoque = String(it.unidade || '').trim()
            break
          }
        } catch (_) {}
      }
    }
    if (!unidadeEstoque) {
      return e.json(422, {
        erro: 'unidade_de_estoque_desconhecida',
        motivos: [
          'unidade de estoque desconhecida: o item não está no catálogo do Omie ou está sem unidade; o fator não pode ser confirmado',
        ],
      })
    }

    let resposta = null
    try {
      $app.runInTransaction((tx) => {
        const anteriores = tx.findRecordsByFilter(
          'pcp_conversoes',
          'item = {:i} && fornecedor = {:f} && apresentacao = {:a}',
          '-versao',
          1,
          0,
          { i: item, f: fornecedor, a: apresentacao },
        )
        const versao = anteriores.length > 0 ? Number(anteriores[0].get('versao') || 0) + 1 : 1
        const col = tx.findCollectionByNameOrId('pcp_conversoes')
        const r = new Record(col)
        r.set('item', item)
        r.set('fornecedor', fornecedor)
        r.set('apresentacao', apresentacao)
        r.set('unidade_compra', unidadeCompra)
        r.set('fator', fator)
        r.set('unidade_estoque', unidadeEstoque)
        r.set('confirmado_por', auth.getString('email') || auth.id)
        r.set('confirmado_em', new Date().toISOString())
        r.set('versao', versao)
        tx.save(r)
        resposta = { ok: true, item: item, versao: versao, unidade_estoque: unidadeEstoque }
      })
    } catch (_) {
      return e.json(409, {
        erro: 'conflito_de_versao',
        motivo: 'outra alteração chegou ao mesmo tempo; recarregue e tente de novo',
      })
    }
    return e.json(200, resposta)
  },
  $apis.requireAuth(),
)
