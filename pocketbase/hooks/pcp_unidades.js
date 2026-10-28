// pocketbase/hooks/pcp_unidades.js — SPEC-3-008 CA-3-24 e CA-3-25
// GET /backend/v1/pcp/faturamento/unidades — unidades vigentes (com o histórico de versões), nomes
// recebidos dos canais ("a revisar" em destaque) e a tabela de preço. Exige consultar_faturamento E a
// área faturamento. Só leitura; nada é trocado no Omie.
routerAdd(
  'GET',
  '/backend/v1/pcp/faturamento/unidades',
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
    const areas = perfil ? perfil.getStringSlice('areas') : []
    if (
      !perfil ||
      !perfil.getBool('ativo') ||
      !Array.isArray(acoes) ||
      acoes.indexOf('consultar_faturamento') === -1 ||
      areas.indexOf('faturamento') === -1
    ) {
      return e.forbiddenError('sem_permissao')
    }
    const todas = $app.findRecordsByFilter('pcp_unidades', '', '-versao', 20000, 0).map((r) => ({
      cliente_omie: r.getString('cliente_omie'),
      unidade: r.getString('unidade'),
      nome_fantasia_operacional: r.getString('nome_fantasia_operacional'),
      tipo: r.getString('tipo'),
      ativo: r.getBool('ativo'),
      versao: Number(r.get('versao') || 0),
      alterado_por: r.getString('alterado_por'),
      alterado_em: r.getString('alterado_em'),
    }))
    const maior = {}
    for (const u of todas)
      if (!maior[u.cliente_omie] || u.versao > maior[u.cliente_omie])
        maior[u.cliente_omie] = u.versao
    const unidades = todas.filter((u) => u.versao === maior[u.cliente_omie])
    const historico = todas.filter((u) => u.versao !== maior[u.cliente_omie])
    const nomes = $app.findRecordsByFilter('pcp_nomes_canal', '', '-created', 5000, 0).map((r) => ({
      canal: r.getString('canal'),
      cliente_omie: r.getString('cliente_omie'),
      nome_recebido: r.getString('nome_recebido'),
      estado: r.getString('estado'),
      decidido_por: r.getString('decidido_por') || null,
      decidido_em: r.getString('decidido_em') || null,
    }))
    const tabela = $app
      .findRecordsByFilter('pcp_tabelas_preco', '', 'chave,item,-vigencia_inicio,-versao', 20000, 0)
      .map((r) => ({
        chave: r.getString('chave'),
        item: r.getString('item'),
        preco: Number(r.get('preco') || 0),
        unidade: r.getString('unidade'),
        vigencia_inicio: r.getString('vigencia_inicio'),
        versao: Number(r.get('versao') || 0),
        origem: r.getString('origem'),
      }))
    return e.json(200, {
      unidades: unidades,
      historico: historico,
      nomes: nomes,
      a_revisar: nomes.filter((n) => n.estado === 'a_revisar').length,
      tabela: tabela,
      pode_editar: acoes.indexOf('editar_unidade') !== -1,
    })
  },
  $apis.requireAuth(),
)
