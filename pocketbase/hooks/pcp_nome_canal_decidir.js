// pocketbase/hooks/pcp_nome_canal_decidir.js — SPEC-3-008 CA-3-24 (RN-01, exceção)
// POST /backend/v1/pcp/faturamento/nome-canal/decidir { canal, cliente_omie, nome_recebido, decisao: 'aceito'|'recusado' }
// O faturamento decide sobre um nome "a revisar". Aceitar grava uma versão NOVA da unidade com o nome
// recebido como nome fantasia operacional (autor e hora do servidor); recusar não muda nada. Só nomes
// "a revisar". Exige editar_unidade E a área faturamento.
routerAdd(
  'POST',
  '/backend/v1/pcp/faturamento/nome-canal/decidir',
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
      acoes.indexOf('editar_unidade') === -1 ||
      perfil.getStringSlice('areas').indexOf('faturamento') === -1
    ) {
      return e.forbiddenError('sem_permissao')
    }
    const sem = (s) =>
      String(s || '')
        .trim()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/\s+/g, ' ')
        .toLowerCase()
    const b = e.requestInfo().body || {}
    const decisao = String(b.decisao || '')
    if (decisao !== 'aceito' && decisao !== 'recusado')
      return e.json(422, { erro: 'dados_invalidos' })
    const quem = auth.getString('email') || auth.id
    let resposta = null
    $app.runInTransaction((tx) => {
      let n = null
      try {
        n = tx.findFirstRecordByFilter(
          'pcp_nomes_canal',
          'canal = {:k} && cliente_omie = {:c} && nome_normalizado = {:n}',
          { k: String(b.canal || ''), c: String(b.cliente_omie || ''), n: sem(b.nome_recebido) },
        )
      } catch (_) {}
      if (!n || n.getString('estado') !== 'a_revisar') {
        resposta = { http: 422, corpo: { erro: 'nada_a_revisar' } }
        return
      }
      if (decisao === 'aceito') {
        const ant = tx.findRecordsByFilter('pcp_unidades', 'cliente_omie = {:c}', '-versao', 1, 0, {
          c: n.getString('cliente_omie'),
        })
        if (ant.length === 0) {
          resposta = { http: 422, corpo: { erro: 'unidade_nao_cadastrada' } }
          return
        }
        const a = ant[0]
        const r = new Record(tx.findCollectionByNameOrId('pcp_unidades'))
        r.set('cliente_omie', a.getString('cliente_omie'))
        r.set('unidade', a.getString('unidade'))
        r.set('nome_fantasia_operacional', n.getString('nome_recebido'))
        r.set('tipo', a.getString('tipo'))
        r.set('ativo', a.getBool('ativo'))
        r.set('versao', Number(a.get('versao') || 0) + 1)
        r.set('alterado_por', quem)
        r.set('alterado_em', new Date().toISOString())
        tx.save(r)
      }
      n.set('estado', decisao)
      n.set('decidido_por', quem)
      n.set('decidido_em', new Date().toISOString())
      tx.save(n)
      resposta = { http: 200, corpo: { ok: true, estado: decisao } }
    })
    return e.json(resposta.http, resposta.corpo)
  },
  $apis.requireAuth(),
)
