// pocketbase/hooks/pcp_parametros_estado.js — SPEC-2-002 CA-P1/P2 (task d2a44349)
// GET /backend/v1/pcp/parametros — estado atual dos parâmetros oficiais.
// Devolve a aprovação vigente (maior versão) ou null; o frontend valida o rascunho
// com o contrato (validarParametros) e o servidor revalida no POST (autoridade).
// Nenhum default inventado: sem aprovação, aprovacao=null e origem=demonstracao.
routerAdd(
  'GET',
  '/backend/v1/pcp/parametros',
  (e) => {
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Sessão ausente ou expirada.')
    let atual = null
    try {
      const lista = $app.findRecordsByFilter('pcp_parametros', '', 'versao DESC', 1, 0)
      if (lista.length > 0) {
        const r = lista[0]
        let parametros = null
        try {
          parametros = JSON.parse(r.getString('parametros') || 'null')
        } catch (_) {
          parametros = null
        }
        atual = {
          versao: Number(r.get('versao') || 0),
          aprovador: r.getString('aprovador'),
          aprovado_em: r.getString('aprovado_em'),
          hash_parametros: r.getString('hash_parametros'),
          parametros: parametros,
        }
      }
    } catch (err) {
      console.log('pcp_parametros_estado lookup falhou', String(err))
    }
    return e.json(200, { aprovacao: atual, origem: atual ? 'aprovada' : 'demonstracao' })
  },
  $apis.requireAuth(),
)
