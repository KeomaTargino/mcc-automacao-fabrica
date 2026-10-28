// pocketbase/hooks/pcp_familia_salvar.js — SPEC-3-010 CA-3-30
// POST /backend/v1/pcp/alertas/familia { familia, produtos:[codigo] }
// O PCP define a família (agrupamento de produtos). Um produto pertence a uma família no máximo: ao
// entrar numa família, sai da anterior. Produto fora da lista enviada sai desta família. Exige
// editar_parametros (403 sem pistas). Não altera produto, estoque nem parâmetro.
routerAdd(
  'POST',
  '/backend/v1/pcp/alertas/familia',
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
      acoes.indexOf('editar_parametros') === -1
    ) {
      return e.forbiddenError('sem_permissao')
    }
    const b = e.requestInfo().body || {}
    const familia = String(b.familia || '')
      .trim()
      .toUpperCase()
    const produtos = (Array.isArray(b.produtos) ? b.produtos : [])
      .map((p) =>
        String(p || '')
          .trim()
          .toUpperCase(),
      )
      .filter((p, i, a) => p && a.indexOf(p) === i)
    if (!familia || familia === '*')
      return e.json(422, { erro: 'dados_invalidos', motivos: ['informe o nome da família'] })
    const quem = auth.getString('email') || auth.id
    $app.runInTransaction((tx) => {
      for (const r of tx.findRecordsByFilter(
        'pcp_familias',
        'familia = {:f}',
        'produto',
        20000,
        0,
        { f: familia },
      )) {
        if (produtos.indexOf(r.getString('produto')) === -1) tx.delete(r)
      }
      for (const p of produtos) {
        let r = null
        try {
          r = tx.findFirstRecordByFilter('pcp_familias', 'produto = {:p}', { p: p })
        } catch (_) {}
        if (!r) {
          r = new Record(tx.findCollectionByNameOrId('pcp_familias'))
          r.set('produto', p)
        }
        if (r.getString('familia') === familia && r.getString('alterado_por')) continue
        r.set('familia', familia)
        r.set('alterado_por', quem)
        tx.save(r)
      }
    })
    return e.json(200, { ok: true, familia: familia, produtos: produtos })
  },
  $apis.requireAuth(),
)
