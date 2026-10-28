// pocketbase/hooks/pcp_faturamento_acesso.js — SPEC-3-008 CA-3-23
// GET /backend/v1/pcp/faturamento/acesso — devolve, derivado do perfil no SERVIDOR, quais das cinco
// ações de faturamento e expedição a conta pode exercer. Mesma regra de src/lib/pcp/acoes-faturamento.ts:
// a ação precisa estar no perfil E a área "faturamento" também (área não concede ação por implicação).
// Recusa (sem perfil, perfil inativo, nenhuma ação) sempre igual, sem pistas. Só leitura.
routerAdd(
  'GET',
  '/backend/v1/pcp/faturamento/acesso',
  (e) => {
    const ACOES = [
      'consultar_faturamento',
      'editar_unidade',
      'preparar_pedido',
      'conferir_volumes',
      'liberar_faturamento',
    ]
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
    const concedidas = ACOES.filter(
      (a) => Array.isArray(acoes) && acoes.indexOf(a) !== -1 && areas.indexOf('faturamento') !== -1,
    )
    if (concedidas.length === 0) return e.forbiddenError('sem_permissao')
    return e.json(200, { acoes: concedidas })
  },
  $apis.requireAuth(),
)
