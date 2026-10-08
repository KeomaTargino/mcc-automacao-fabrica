// pocketbase/hooks/pcp_dados_area.js — SPEC-1-001 CA-A2/A3
// Leitura de dados por área: o servidor deriva as áreas do perfil ativo.
// A área enviada pelo navegador é SEMPRE ignorada. Fixtures de demonstração no servidor.
// Nota de runtime (goja): findFirstRecordByFilter exige params como objeto, não string.
routerAdd(
  'GET',
  '/backend/v1/pcp/dados',
  (e) => {
    if (e.hasSuperuserAuth()) {
      return e.json(200, {
        areas_permitidas: ['catalogo', 'estoque', 'producao', 'compras', 'pedidos', 'painel'],
        fonte: 'demonstracao',
        observado_em: new Date().toISOString(),
        dados: {},
        superuser: true,
      })
    }
    const auth = e.auth
    if (!auth) {
      return e.unauthorizedError('Sessão ausente ou expirada.')
    }
    let perfil = null
    try {
      perfil = $app.findFirstRecordByFilter('pcp_perfis', 'usuario = {:u}', { u: auth.id })
    } catch (err) {
      console.log('pcp_dados lookup falhou', String(err))
    }
    if (!perfil) {
      return e.forbiddenError('perfil_ausente')
    }
    if (!perfil.getBool('ativo')) {
      return e.forbiddenError('perfil_inativo')
    }
    const areas = perfil.getStringSlice('areas')
    const tem = (a) => areas.indexOf(a) !== -1

    // Fixtures idênticas ao provider de demonstração (SPEC-1-000), servidas pelo servidor.
    const estoque = [
      {
        produto_id: 'P1',
        codigo: 'P1',
        descricao: 'Produto demonstração 1',
        unidade: 'UN',
        local: 'A',
        saldo: 10,
      },
      {
        produto_id: 'P2',
        codigo: 'P2',
        descricao: 'Produto demonstração 2',
        unidade: 'KG',
        local: 'B',
        saldo: 2,
      },
    ]
    const producao = [
      {
        documento_id: 'OP-1',
        produto: 'Produto demonstração 1',
        quantidade: 5,
        unidade: 'UN',
        status_original: 'aberta',
        data_prevista: null,
      },
    ]
    const compras = [
      {
        documento_id: 'C-1',
        item: 'Insumo demonstração',
        quantidade: 20,
        unidade: 'UN',
        status_original: 'aberta',
        data_prevista: null,
      },
    ]
    const pedidos = [
      {
        documento_id: 'OM-11',
        canal: 'omie',
        oficial: true,
        cliente: 'Cliente demonstração',
        status_original: 'aberto',
        data: '2026-10-01',
      },
      {
        documento_id: 'OM-L1',
        canal: 'omie',
        oficial: true,
        cliente: 'Cliente demonstração',
        status_original: 'liberado',
        data: '2026-10-01',
      },
      {
        documento_id: 'NS-10',
        canal: 'nuvemshop',
        oficial: false,
        cliente: 'Cliente demonstração',
        status_original: 'pendente',
        data: '2026-10-01',
      },
    ]

    const dados = {}
    if (tem('estoque')) dados.estoque = estoque
    if (tem('producao')) dados.producao = producao
    if (tem('compras')) dados.compras = compras
    if (tem('pedidos')) dados.pedidos = pedidos

    return e.json(200, {
      areas_permitidas: areas,
      fonte: 'demonstracao',
      observado_em: new Date().toISOString(),
      dados,
      superuser: false,
    })
  },
  $apis.requireAuth(),
)
