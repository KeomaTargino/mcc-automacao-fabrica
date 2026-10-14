// pocketbase/hooks/pcp_perfil.js — SPEC-2-000 CA-A2/A3 (task 49327a88)
// Perfil do usuario autenticado, agora com acoes e pontos (matriz v1.2).
// A area/acao/ponto NUNCA vem do navegador: o servidor le pcp_perfis.
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
      perfil = $app.findFirstRecordByFilter('pcp_perfis', 'usuario = {:u}', { u: auth.id })
    } catch (err) {
      console.log('pcp_perfil lookup falhou', String(err))
    }
    if (!perfil) {
      return e.json(200, { superuser: false, perfil: null, motivo: 'perfil_ausente' })
    }
    if (!perfil.getBool('ativo')) {
      return e.json(200, { superuser: false, perfil: null, motivo: 'perfil_inativo' })
    }
    let acoes = []
    let pontos = []
    try {
      acoes = JSON.parse(perfil.getString('acoes') || '[]') || []
      if (!Array.isArray(acoes)) acoes = []
    } catch (_) {
      acoes = []
    }
    try {
      pontos = JSON.parse(perfil.getString('pontos') || '[]') || []
      if (!Array.isArray(pontos)) pontos = []
    } catch (_) {
      pontos = []
    }
    return e.json(200, {
      superuser: false,
      perfil: {
        usuario: perfil.getString('usuario'),
        areas: perfil.getStringSlice('areas'),
        acoes: acoes,
        pontos: pontos,
        pode_atualizar_fontes: perfil.getBool('pode_atualizar_fontes'),
      },
      motivo: '',
    })
  },
  $apis.requireAuth(),
)
