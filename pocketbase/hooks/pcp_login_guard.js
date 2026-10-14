// pocketbase/hooks/pcp_login_guard.js — SPEC-2-000 CA-A2/A3 (task 49327a88)
// Porta de login: usuario com perfil real (conta @mccfranchising.com.br) entra;
// sinteticos @pcp.local sao recusados depois da revogacao (flag no secret).
// REGRA CRITICA (guia de hooks): em onRecordAuthWithPasswordRequest o PocketBase
// escreve o token DENTRO de e.next() — recusa SEMPRE com throw, nunca return vazio;
// superuser passa SEMPRE antes de qualquer checagem (a plataforma nao pode ser trancada).
onRecordAuthWithPasswordRequest((e) => {
  // plataforma passa sempre (painel, logs, migrations, deploys)
  if (e.hasSuperuserAuth()) {
    return e.next()
  }
  const email = String((e.record && e.record.email()) || '').toLowerCase()
  // revogacao dos sinteticos: liga/desliga pelo secret (sem redeploy)
  const revogar = $secrets.get('PCP_REVOGAR_SINTETICOS')
  if (revogar === '1' && email.indexOf('@pcp.local') !== -1) {
    throw new BadRequestError('Conta de teste revogada — use sua conta real.')
  }
  return e.next()
}, 'users')
