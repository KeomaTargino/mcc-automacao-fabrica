// pocketbase/hooks/pcp_nome_canal.js — SPEC-3-008 CA-3-24 (RN-01)
// POST /backend/v1/pcp/faturamento/nome-canal { canal, cliente_omie, nome_recebido }
// Registra o nome com que um cliente aparece num canal (omie, lunet, nuvemshop ou manual). Igual ao
// nome fantasia operacional (sem acento, caixa ou espaços a mais): "igual". Diferente: "a revisar".
// NUNCA altera a unidade: o nome do canal não troca o operacional sozinho. Repetir não duplica.
// Exige editar_unidade E a área faturamento.
routerAdd(
  'POST',
  '/backend/v1/pcp/faturamento/nome-canal',
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
    const canal = String(b.canal || '')
    const cliente = String(b.cliente_omie || '').trim()
    const nome = String(b.nome_recebido || '').trim()
    if (['omie', 'lunet', 'nuvemshop', 'manual'].indexOf(canal) === -1 || !cliente || !nome) {
      return e.json(422, { erro: 'dados_invalidos' })
    }
    const ant = $app.findRecordsByFilter('pcp_unidades', 'cliente_omie = {:c}', '-versao', 1, 0, {
      c: cliente,
    })
    if (ant.length === 0) return e.json(422, { erro: 'unidade_nao_cadastrada' })
    const norm = sem(nome)
    try {
      const ja = $app.findFirstRecordByFilter(
        'pcp_nomes_canal',
        'canal = {:k} && cliente_omie = {:c} && nome_normalizado = {:n}',
        { k: canal, c: cliente, n: norm },
      )
      return e.json(200, { ok: true, criado: false, estado: ja.getString('estado') })
    } catch (_) {}
    const estado =
      sem(ant[0].getString('nome_fantasia_operacional')) === norm ? 'igual' : 'a_revisar'
    const r = new Record($app.findCollectionByNameOrId('pcp_nomes_canal'))
    r.set('canal', canal)
    r.set('cliente_omie', cliente)
    r.set('nome_recebido', nome)
    r.set('nome_normalizado', norm)
    r.set('estado', estado)
    try {
      $app.save(r)
    } catch (_) {
      return e.json(409, { erro: 'conflito' })
    }
    return e.json(200, { ok: true, criado: true, estado: estado })
  },
  $apis.requireAuth(),
)
