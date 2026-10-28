// pocketbase/hooks/pcp_recebimentos.js — SPEC-3-007 CA-3-19/20/21/22
// GET /backend/v1/pcp/compras/recebimentos — pedidos aprovados e ligados que podem receber, os
// recebimentos registrados (com falta/sobra), as parcelas (com "já paga"), as exceções abertas de
// recebimento e as pré-conferências com nota de demonstração. Exige consultar_compras E a área
// compras. Só leitura. Nada ajusta estoque nem lança no financeiro.
routerAdd(
  'GET',
  '/backend/v1/pcp/compras/recebimentos',
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
      acoes.indexOf('consultar_compras') === -1 ||
      areas.indexOf('compras') === -1
    ) {
      return e.forbiddenError('sem_permissao')
    }
    const json = (r, campo, padrao) => {
      try {
        return JSON.parse(r.getString(campo) || '') || padrao
      } catch (_) {
        return padrao
      }
    }
    // pedidos aprovados e ligados (pedido = número do Omie, ou o id da compra se ainda sem número)
    const pedidos = []
    const aprovadas = $app.findRecordsByFilter(
      'pcp_requisicoes',
      "estado = 'aprovada'",
      '-created',
      2000,
      0,
    )
    for (const r of aprovadas) {
      let v = null
      try {
        v = $app.findFirstRecordByFilter(
          'pcp_pedidos_compra_vinculo',
          "requisicao = {:r} && estado = 'ligado'",
          { r: r.id },
        )
      } catch (_) {}
      if (!v) continue
      const itens = json(r, 'itens', [])
      pedidos.push({
        pedido_id: v.getString('numero_omie') || r.id,
        requisicao: r.id,
        fornecedor: r.getString('fornecedor'),
        linhas: itens.map((i) => ({
          item: i.item,
          quantidade_estoque: i.quantidadeEstoque,
          unidade: i.unidadeEstoque,
        })),
      })
    }
    const recebimentos = $app
      .findRecordsByFilter('pcp_recebimentos', '', '-created', 2000, 0)
      .map((r) => ({
        chave: r.getString('chave'),
        fornecedor: r.getString('fornecedor'),
        data: r.getString('data'),
        linhas: json(r, 'linhas', []),
        diferencas: json(r, 'diferencas', []),
        avisos_ja_paga: json(r, 'avisos_ja_paga', []),
        registrado_por: r.getString('registrado_por'),
        registrado_em: r.getString('registrado_em'),
      }))
    const parcelas = $app
      .findRecordsByFilter('pcp_parcelas_compra', '', 'pedido,numero', 5000, 0)
      .map((p) => ({
        pedido: p.getString('pedido'),
        numero: Number(p.get('numero') || 0),
        vencimento: p.getString('vencimento'),
        valor: Number(p.get('valor') || 0),
        pago_antecipado: p.getBool('pago_antecipado'),
        referencia_pagamento: p.getString('referencia_pagamento') || null,
      }))
    const porPedido = {}
    for (const p of parcelas) {
      if (!porPedido[p.pedido]) porPedido[p.pedido] = []
      porPedido[p.pedido].push(p)
    }
    const jaPagos = Object.keys(porPedido).filter((k) =>
      porPedido[k].every((p) => p.pago_antecipado),
    )
    const excecoes = $app
      .findRecordsByFilter(
        'pcp_excecoes_compra',
        "documento = 'recebimento' && estado = 'aberta'",
        '-created',
        500,
        0,
      )
      .map((x) => ({
        item: x.getString('item'),
        documento_id: x.getString('documento_id'),
        motivo: x.getString('motivo'),
      }))
    const notas = $app.findRecordsByFilter('pcp_notas_demo', '', '-created', 200, 0).map((n) => ({
      pedido: n.getString('pedido'),
      demonstracao: n.getBool('demonstracao'),
      numero: (json(n, 'nota', {}) || {}).numero || null,
      estado: n.getString('estado'),
      pendencias: json(n, 'pendencias', []),
      avisos: json(n, 'avisos', []),
      conferida_em: n.getString('conferida_em'),
    }))
    return e.json(200, {
      pedidos: pedidos,
      recebimentos: recebimentos,
      parcelas: parcelas,
      pedidos_ja_pagos: jaPagos,
      excecoes_abertas: excecoes,
      notas_demo: notas,
      pode_conferir:
        acoes.indexOf('conferir_recebimento') !== -1 && areas.indexOf('recebimento') !== -1,
      pode_financeiro:
        acoes.indexOf('conferir_financeiro_recebimento') !== -1 &&
        areas.indexOf('recebimento') !== -1,
    })
  },
  $apis.requireAuth(),
)
