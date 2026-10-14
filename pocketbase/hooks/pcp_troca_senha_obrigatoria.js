// pocketbase/hooks/pcp_troca_senha_obrigatoria.js — SPEC-2-000 CA-A2/A3 (task 49327a88)
// Troca OBRIGATORIA da senha inicial: valida a senha atual, grava a nova e marca trocada.
// A senha inicial vem do secret (nunca transita por repo/chat); a nova nunca e registrada.
routerAdd(
  'POST',
  '/backend/v1/pcp/trocar-senha',
  (e) => {
    const auth = e.auth
    if (!auth) {
      return e.unauthorizedError('Sessão ausente ou expirada.')
    }
    const body = e.requestInfo().body || {}
    const atual = String(body.senha_atual || '')
    const nova = String(body.senha_nova || '')
    if (!atual || !nova) {
      return e.badRequestError('senha_atual e senha_nova sao obrigatorias')
    }
    if (nova.length < 8) {
      return e.badRequestError('senha_nova deve ter no minimo 8 caracteres')
    }
    if (nova === atual) {
      return e.badRequestError('a nova senha deve ser diferente da atual')
    }
    // valida a senha atual contra o hash real do PocketBase
    let valida = false
    try {
      valida = auth.validatePassword(atual)
    } catch (_) {
      valida = false
    }
    if (!valida) {
      return e.forbiddenError('senha_atual_incorreta')
    }
    auth.setPassword(nova)
    auth.set('primeira_senha_trocada', true)
    $app.save(auth)
    return e.json(200, { ok: true, mensagem: 'Senha alterada. Use a nova no proximo login.' })
  },
  $apis.requireAuth(),
)
