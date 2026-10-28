// Migration 0030 — nova área "recebimento" nos perfis (SPEC-3-003, CA-3-08)
// Aditiva: acrescenta o valor 'recebimento' à lista de áreas de pcp_perfis e sobe o máximo de
// seleções para caber. Nenhum perfil existente muda e nenhuma conta recebe a área ou qualquer
// ação nova (conta real só pela matriz aprovada pelo dono, CL-003). Idempotente.
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('pcp_perfis')
    const campo = col.fields.getByName('areas')
    const valores = campo.values || []
    if (valores.indexOf('recebimento') !== -1) return
    campo.values = valores.concat(['recebimento'])
    campo.maxSelect = campo.values.length
    app.save(col)
  },
  (app) => {
    // Reversão segura: não retira o valor (perfil que já o use ficaria inválido). Desligar o uso é
    // não conceder a área; nada a desfazer aqui.
  },
)
