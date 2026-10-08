// pocketbase/hooks/pcp_perfil_atual.js — SPEC-1-001 CA-A2/A3
// Perfil do usuário autenticado. A área NUNCA vem do navegador: o servidor lê pcp_perfis.
routerAdd(
  'GET',
  '/backend/v1/pcp/perfil',
  (e) => {
    if (e.hasSuperuserAuth()) {
      return e.json(200, { superuser: true, perfil: null, motivo: '' })
    }
    const auth = e.auth
    if (!auth) {
      return e.unauthorizedError('Sessão ausente ou expirada.')
    }
    let perfil = null
    try {
      perfil = $app.findFirstRecordByFilter('pcp_perfis', 'usuario = {:u}', auth.id)
    } catch (err) {
      console.log('pcp_perfil lookup falhou', auth.id, String(err))
    }
    if (!perfil) {
      console.log('pcp_perfil sem registro', auth.id)
      return e.json(200, { superuser: false, perfil: null, motivo: 'perfil_ausente' })
    }
    if (!perfil.getBool('ativo')) {
      return e.json(200, { superuser: false, perfil: null, motivo: 'perfil_inativo' })
    }
    return e.json(200, {
      superuser: false,
      perfil: {
        usuario: perfil.getString('usuario'),
        areas: perfil.getStringSlice('areas'),
        pode_atualizar_fontes: perfil.getBool('pode_atualizar_fontes'),
      },
      motivo: '',
    })
  },
  $apis.requireAuth(),
)
