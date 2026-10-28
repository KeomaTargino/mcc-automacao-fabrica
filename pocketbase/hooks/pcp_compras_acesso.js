// pocketbase/hooks/pcp_compras_acesso.js — SPEC-3-003 CA-3-08
// GET /backend/v1/pcp/compras/acesso — devolve, derivado do perfil no SERVIDOR, quais das oito
// ações de compras e recebimento a conta pode exercer. Mesma regra de src/lib/pcp/acoes-compras.ts:
// a ação precisa estar no perfil E a área da ação também (área ou cargo não concede ação por
// implicação). Recusa (sem perfil, perfil inativo) sempre igual, sem pistas. É a guarda que as
// rotas de compras e recebimento aplicam em cada chamada. Só leitura.
routerAdd(
  'GET',
  '/backend/v1/pcp/compras/acesso',
  (e) => {
    const AREA_DA_ACAO = {
      consultar_compras: 'compras',
      editar_fornecedor: 'compras',
      editar_conversao: 'compras',
      editar_requisicao: 'compras',
      aprovar_compra: 'compras',
      autorizar_excecao_compra: 'compras',
      conferir_recebimento: 'recebimento',
      conferir_financeiro_recebimento: 'recebimento',
    }
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Sessão ausente ou expirada.')
    let perfil = null
    try {
      perfil = $app.findFirstRecordByFilter('pcp_perfis', 'usuario = {:u}', { u: auth.id })
    } catch (_) {}
    if (!perfil || !perfil.getBool('ativo')) return e.forbiddenError('sem_permissao')
    let acoes = []
    try {
      acoes = JSON.parse(perfil.getString('acoes') || '[]') || []
    } catch (_) {
      acoes = []
    }
    const areas = perfil.getStringSlice('areas')
    const concedidas = []
    for (const acao of Object.keys(AREA_DA_ACAO)) {
      if (
        Array.isArray(acoes) &&
        acoes.indexOf(acao) !== -1 &&
        areas.indexOf(AREA_DA_ACAO[acao]) !== -1
      ) {
        concedidas.push(acao)
      }
    }
    if (concedidas.length === 0) return e.forbiddenError('sem_permissao')
    return e.json(200, { acoes: concedidas })
  },
  $apis.requireAuth(),
)
