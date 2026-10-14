// pocketbase/hooks/pcp_login_guard.js — SPEC-2-000 CA-A2/A3 (task 49327a88)
// Porta de login: sinteticos @pcp.local sao recusados depois da revogacao (flag no secret).
// Correcao goja: e.record.email() NAO existe (guia: "no getEmail") — usar getString('email').
// REGRA CRITICA: superuser passa SEMPRE antes de qualquer checagem; recusa com throw (nunca return vazio).
onRecordAuthWithPasswordRequest((e) => {
  if (e.hasSuperuserAuth()) {
    return e.next()
  }
  const revogar = $secrets.get('PCP_REVOGAR_SINTETICOS')
  if (revogar === '1') {
    const email = String((e.record && e.record.getString('email')) || '').toLowerCase()
    if (email.indexOf('@pcp.local') !== -1) {
      throw new BadRequestError('Conta de teste revogada — use sua conta real.')
    }
  }
  return e.next()
}, 'users')
