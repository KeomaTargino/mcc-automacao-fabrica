// pocketbase/hooks/pcp_conversoes.js — SPEC-3-003 CA-3-11
// GET /backend/v1/pcp/compras/conversoes — todos os fatores confirmados, com a versão, quem
// confirmou e quando; a maior versão de cada item/fornecedor/apresentação vem marcada como vigente.
// Exige consultar_compras E a área compras. Só leitura.
routerAdd(
  'GET',
  '/backend/v1/pcp/compras/conversoes',
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
    const registros = $app.findRecordsByFilter('pcp_conversoes', '', '-versao', 5000, 0)
    const maior = {}
    const itens = registros.map((r) => {
      const chave =
        r.getString('item') + '|' + r.getString('fornecedor') + '|' + r.getString('apresentacao')
      const versao = Number(r.get('versao') || 0)
      if (!maior[chave] || versao > maior[chave]) maior[chave] = versao
      return {
        chave: chave,
        item: r.getString('item'),
        fornecedor: r.getString('fornecedor') || null,
        apresentacao: r.getString('apresentacao'),
        unidade_compra: r.getString('unidade_compra'),
        fator: Number(r.get('fator') || 0),
        unidade_estoque: r.getString('unidade_estoque'),
        confirmado_por: r.getString('confirmado_por'),
        confirmado_em: r.getString('confirmado_em'),
        versao: versao,
      }
    })
    for (const i of itens) i.vigente = i.versao === maior[i.chave]
    itens.sort((a, b) => (a.chave === b.chave ? b.versao - a.versao : a.chave < b.chave ? -1 : 1))
    return e.json(200, { itens: itens, pode_editar: acoes.indexOf('editar_conversao') !== -1 })
  },
  $apis.requireAuth(),
)
