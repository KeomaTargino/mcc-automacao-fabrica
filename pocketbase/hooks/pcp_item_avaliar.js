// pocketbase/hooks/pcp_item_avaliar.js — SPEC-3-003 CA-3-10 (RN-01, RN-02)
// POST /backend/v1/pcp/compras/item/avaliar — responde se um item PODE entrar numa requisição,
// cotação ou recebimento: está no catálogo real do Omie (liberado), tem exceção aberta para este
// documento (liberado, pendente de regularização) ou não (bloqueado: "cadastrar no Omie antes de
// comprar"). Catálogo que não foi lido por inteiro não prova que o item existe: bloqueia com
// mensagem própria. As rotas de requisição, cotação e recebimento (SPECs 3-005 a 3-007) usam esta
// mesma regra em cada chamada. Exige consultar_compras E a área compras. Só leitura.
// Regras de src/lib/pcp/bloqueio-item.ts.
routerAdd(
  'POST',
  '/backend/v1/pcp/compras/item/avaliar',
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
      acoes.indexOf('consultar_compras') === -1 ||
      perfil.getStringSlice('areas').indexOf('compras') === -1
    ) {
      return e.forbiddenError('sem_permissao')
    }
    const body = e.requestInfo().body || {}
    const item = String(body.item || '')
      .trim()
      .toUpperCase()
    const documento = String(body.documento || '')
    const documentoId = String(body.documento_id || '').trim()
    if (
      !item ||
      !documentoId ||
      ['requisicao', 'cotacao', 'recebimento'].indexOf(documento) === -1
    ) {
      return e.json(422, {
        erro: 'dados_invalidos',
        motivo: 'informe o item, o tipo e o número do documento',
      })
    }

    // Catálogo confiável: lote ativo vindo de uma leitura produto a produto concluída.
    let catalogo = null
    try {
      const fonte = $app.findFirstRecordByFilter(
        'pcp_fontes',
        "fonte = 'omie' && recurso = 'produtos' && aplicativo_ref = 'app1'",
        {},
      )
      const loteId = fonte.getString('lote_ativo')
      if (loteId) {
        const lote = $app.findRecordById('pcp_lotes', loteId)
        const exec = lote.getString('execucao')
          ? $app.findRecordById('pcp_execucoes', lote.getString('execucao'))
          : null
        if (
          exec &&
          exec.getString('recurso') === 'produtos_dirigido' &&
          exec.getString('estado') === 'concluida'
        ) {
          catalogo = {}
          const regs = $app.findRecordsByFilter('pcp_dados', 'lote = {:l}', 'id', 20000, 0, {
            l: loteId,
          })
          for (const r of regs) {
            try {
              const c = String(JSON.parse(r.getString('conteudo') || '{}').codigo || '')
                .trim()
                .toUpperCase()
              if (c) catalogo[c] = true
            } catch (_) {}
          }
        }
      }
    } catch (_) {}
    if (catalogo === null) {
      return e.json(200, {
        liberado: false,
        motivo: 'catalogo_indisponivel',
        mensagem: 'não foi possível conferir o cadastro do Omie agora; tente de novo mais tarde',
      })
    }
    if (catalogo[item]) return e.json(200, { liberado: true, via: 'catalogo' })
    let excecao = null
    try {
      excecao = $app.findFirstRecordByFilter(
        'pcp_excecoes_compra',
        "item = {:i} && documento = {:d} && documento_id = {:n} && estado = 'aberta'",
        { i: item, d: documento, n: documentoId },
      )
    } catch (_) {}
    if (excecao)
      return e.json(200, { liberado: true, via: 'excecao', pendente_de_regularizacao: true })
    return e.json(200, {
      liberado: false,
      motivo: 'fora_do_catalogo',
      mensagem: 'cadastrar no Omie antes de comprar',
    })
  },
  $apis.requireAuth(),
)
