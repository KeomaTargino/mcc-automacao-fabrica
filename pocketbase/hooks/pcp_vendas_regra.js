// pocketbase/hooks/pcp_vendas_regra.js — SPEC-3-012 CA-3-35 (RN-01; CL-PEND-001)
// POST /backend/v1/pcp/vendas/regra { ciclos_minimos, cobertura_minima_pct }
// O PCP aprova a regra de suficiência do histórico: quantos ciclos (anos anteriores com o mesmo mês lido)
// e que cobertura mínima cada ciclo precisa ter (meses lidos nos 12 meses que terminam no mês do ciclo).
// Exige editar_parametros (403 sem pistas). Versão nova a cada mudança (as anteriores ficam); mesmo
// conteúdo = replay. Sem regra aprovada, a tela mostra "histórico insuficiente". Aprovador e hora do servidor.
routerAdd(
  'POST',
  '/backend/v1/pcp/vendas/regra',
  (e) => {
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Sessão ausente ou expirada.')
    let perfil = null
    try {
      perfil = $app.findFirstRecordByFilter('pcp_perfis', 'usuario = {:u}', { u: auth.id })
    } catch (_) {}
    let acoes = []
    try {
      acoes = JSON.parse((perfil && perfil.getString('acoes')) || '[]') || []
    } catch (_) {
      acoes = []
    }
    if (
      !perfil ||
      !perfil.getBool('ativo') ||
      !Array.isArray(acoes) ||
      acoes.indexOf('editar_parametros') === -1
    ) {
      return e.forbiddenError('sem_permissao')
    }
    const b = e.requestInfo().body || {}
    const c = Number(b.ciclos_minimos)
    const p = Number(b.cobertura_minima_pct)
    const erros = []
    if (!isFinite(c) || Math.floor(c) !== c || c < 1 || c > 10)
      erros.push('ciclos mínimos precisa ser um inteiro de 1 a 10')
    if (!isFinite(p) || p <= 0 || p > 100)
      erros.push('cobertura mínima precisa ser maior que 0 e até 100')
    if (erros.length > 0) return e.json(422, { erro: 'dados_invalidos', motivos: erros })
    let resposta = null
    try {
      $app.runInTransaction((tx) => {
        const l = tx.findRecordsByFilter('pcp_regra_sazonalidade', '', '-versao', 1, 0)
        const atual = l.length > 0 ? l[0] : null
        const v = atual ? Number(atual.get('versao') || 0) : 0
        if (
          atual &&
          Number(atual.get('ciclos_minimos')) === c &&
          Number(atual.get('cobertura_minima_pct')) === p
        ) {
          resposta = { estado: 'replay', versao: v }
          return
        }
        const r = new Record(tx.findCollectionByNameOrId('pcp_regra_sazonalidade'))
        r.set('versao', v + 1)
        r.set('aprovador', auth.getString('email') || auth.id)
        r.set('aprovado_em', new Date().toISOString())
        r.set('ciclos_minimos', c)
        r.set('cobertura_minima_pct', p)
        tx.save(r)
        resposta = { estado: 'aprovada', versao: v + 1 }
      })
    } catch (_) {
      return e.json(409, {
        erro: 'conflito_de_versao',
        motivo: 'outra aprovação chegou ao mesmo tempo; recarregue',
      })
    }
    return e.json(200, resposta)
  },
  $apis.requireAuth(),
)
