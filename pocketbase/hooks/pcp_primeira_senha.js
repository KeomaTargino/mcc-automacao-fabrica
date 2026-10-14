// pocketbase/hooks/pcp_primeira_senha.js — SPEC-2-000 CA-A2/A3 (task 49327a88)
// Troca obrigatoria no 1o login: contas reais com primeira_senha_trocada=false recebem
// motivo 'primeira_senha_trocada' no /pcp/perfil (o frontend exige a troca antes de seguir).
// A area/acao NUNCA vem do navegador: o servidor le pcp_perfis.
routerAdd(
  'GET',
  '/backend/v1/pcp/primeira-senha',
  (e) => {
    const auth = e.auth
    if (!auth) {
      return e.unauthorizedError('Sessão ausente ou expirada.')
    }
    const trocada = auth.getBool('primeira_senha_trocada')
    return e.json(200, { primeira_senha_trocada: trocada, exige_troca: !trocada })
  },
  $apis.requireAuth(),
)
