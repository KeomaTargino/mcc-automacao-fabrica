// pocketbase/hooks/pcp_tabela_preco_salvar.js — SPEC-3-008 CA-3-25
// POST /backend/v1/pcp/faturamento/tabela-preco { chave, item, preco, unidade, vigencia_inicio }
// Tabela operacional versionada mantida pelo faturamento (a tabela do Omie só entra se a conta usar e
// a leitura for comprovada por sonda). `chave` é o cliente do Omie da unidade, ou "*" para o geral.
// Cada gravação é uma versão nova da mesma vigência; nada é trocado em pedido. Exige editar_unidade
// E a área faturamento.
routerAdd(
  'POST',
  '/backend/v1/pcp/faturamento/tabela-preco',
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
    const b = e.requestInfo().body || {}
    const chave = String(b.chave || '').trim()
    const item = String(b.item || '')
      .trim()
      .toUpperCase()
    const preco = Number(b.preco)
    const unidade = String(b.unidade || '').trim()
    const vig = String(b.vigencia_inicio || '').trim()
    const motivos = []
    if (!chave) motivos.push('unidade ou grupo obrigatório')
    if (!item) motivos.push('item obrigatório')
    if (!isFinite(preco) || preco <= 0) motivos.push('preço precisa ser maior que zero')
    if (!unidade) motivos.push('unidade do preço obrigatória')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(vig)) motivos.push('início da vigência inválido')
    if (motivos.length > 0) return e.json(422, { erro: 'dados_invalidos', motivos: motivos })
    let versao = 0
    try {
      $app.runInTransaction((tx) => {
        const ant = tx.findRecordsByFilter(
          'pcp_tabelas_preco',
          'chave = {:c} && item = {:i} && vigencia_inicio = {:v}',
          '-versao',
          1,
          0,
          { c: chave, i: item, v: vig },
        )
        versao = (ant.length > 0 ? Number(ant[0].get('versao') || 0) : 0) + 1
        const r = new Record(tx.findCollectionByNameOrId('pcp_tabelas_preco'))
        r.set('chave', chave)
        r.set('item', item)
        r.set('preco', Math.round(preco * 1e6) / 1e6)
        r.set('unidade', unidade)
        r.set('vigencia_inicio', vig)
        r.set('versao', versao)
        r.set('origem', 'operacional')
        r.set('alterado_por', auth.getString('email') || auth.id)
        tx.save(r)
      })
    } catch (_) {
      return e.json(409, {
        erro: 'conflito_de_versao',
        motivo: 'outra alteração chegou ao mesmo tempo; recarregue',
      })
    }
    return e.json(200, { ok: true, versao: versao })
  },
  $apis.requireAuth(),
)
