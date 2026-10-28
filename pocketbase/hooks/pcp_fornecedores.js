// pocketbase/hooks/pcp_fornecedores.js — SPEC-3-003 CA-3-09
// GET /backend/v1/pcp/compras/fornecedores — a versão mais recente do complemento de cada fornecedor
// (contatos, prazo de entrega, observação, autor e hora). Exige consultar_compras E a área compras.
// A lista do cadastro de fornecedores do Omie ainda não é lida (chave do Omie bloqueada,
// CL-PEND-006): a resposta diz isso em leitura_omie. Só leitura.
routerAdd(
  'GET',
  '/backend/v1/pcp/compras/fornecedores',
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
    const registros = $app.findRecordsByFilter(
      'pcp_fornecedores_complemento',
      '',
      '-versao',
      2000,
      0,
    )
    const ultimo = {}
    for (const r of registros) {
      const f = r.getString('fornecedor')
      if (!ultimo[f] || Number(r.get('versao') || 0) > ultimo[f].versao) {
        let contatos = []
        try {
          contatos = JSON.parse(r.getString('contatos') || '[]') || []
        } catch (_) {}
        ultimo[f] = {
          fornecedor: f,
          versao: Number(r.get('versao') || 0),
          contatos: contatos,
          prazo_entrega_dias:
            r.get('prazo_entrega_dias') === null ? null : Number(r.get('prazo_entrega_dias')),
          observacao: r.getString('observacao'),
          alterado_por: r.getString('alterado_por'),
          alterado_em: r.getString('alterado_em'),
        }
      }
    }
    const itens = Object.keys(ultimo)
      .sort()
      .map((f) => ultimo[f])
    return e.json(200, {
      itens: itens,
      pode_editar: acoes.indexOf('editar_fornecedor') !== -1,
      leitura_omie:
        'pendente: a lista de fornecedores do Omie ainda não é lida (chave do Omie bloqueada)',
    })
  },
  $apis.requireAuth(),
)
