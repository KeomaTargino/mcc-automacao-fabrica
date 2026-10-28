// pocketbase/hooks/pcp_requisicoes.js — SPEC-3-005 CA-3-14/15/16
// GET /backend/v1/pcp/compras/requisicoes — requisições agrupadas por fornecedor, com cotações
// (diferença para o último preço do histórico), valor, aprovação e se ainda vale. Exige
// consultar_compras E a área compras. Só leitura. A tolerância de preço (CL-PEND-001) ainda não está
// cadastrada: a tela mostra a diferença sem julgar.
routerAdd(
  'GET',
  '/backend/v1/pcp/compras/requisicoes',
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
      acoes.indexOf('consultar_compras') === -1 ||
      perfil.getStringSlice('areas').indexOf('compras') === -1
    ) {
      return e.forbiddenError('sem_permissao')
    }
    const lista = (nome, filtro, ordem, params) =>
      $app.findRecordsByFilter(nome, filtro, ordem, 5000, 0, params || {})
    const reqs = lista('pcp_requisicoes', '', '-created')
    const tolerancia = null
    const saida = reqs.map((r) => {
      let itens = []
      try {
        itens = JSON.parse(r.getString('itens') || '[]') || []
      } catch (_) {
        itens = []
      }
      const cots = lista('pcp_cotacoes', 'requisicao = {:r}', 'created', { r: r.id }).map((c) => {
        const preco = c.get('preco_estoque')
        const ultimo = c.get('ultimo_preco')
        const comPreco = preco !== null && preco !== '' && Number(preco) > 0
        const comUltimo = ultimo !== null && ultimo !== '' && Number(ultimo) > 0
        let dif = null
        if (comPreco && comUltimo)
          dif = Math.round(((Number(preco) - Number(ultimo)) / Number(ultimo)) * 1e4) / 100
        return {
          id: c.id,
          item: c.getString('item'),
          fornecedor: c.getString('fornecedor'),
          preco_compra: Number(c.get('preco_compra') || 0),
          unidade_compra: c.getString('unidade_compra'),
          preco_estoque: comPreco ? Number(preco) : null,
          ultimo_preco: comUltimo ? Number(ultimo) : null,
          diferenca_percentual: dif,
          acima_da_tolerancia: tolerancia !== null && dif !== null && dif > tolerancia,
          prazo_dias: Number(c.get('prazo_dias') || 0),
          condicao_pagamento: c.getString('condicao_pagamento'),
          validade: c.getString('validade') || null,
          escolhida: c.getBool('escolhida'),
        }
      })
      // valor e conteúdo aprovado (mesma regra de src/lib/pcp/requisicao.ts)
      let valor = 0
      let completo = itens.length > 0
      const escolhidas = []
      for (const it of itens) {
        const c = cots.find((x) => x.item === it.item && x.escolhida)
        if (!c) {
          completo = false
          continue
        }
        const q =
          it.quantidadeCompra !== null && it.quantidadeCompra !== undefined
            ? it.quantidadeCompra
            : c.unidade_compra === it.unidadeEstoque
              ? it.quantidadeEstoque
              : null
        if (q === null) {
          completo = false
          continue
        }
        valor += q * c.preco_compra
        escolhidas.push({
          item: c.item,
          p: c.preco_compra,
          u: c.unidade_compra,
          prazo: c.prazo_dias,
        })
      }
      const ordena = (a, b) => (a.item < b.item ? -1 : 1)
      const conteudo = JSON.stringify({
        fornecedor: r.getString('fornecedor'),
        data: r.getString('data_necessaria'),
        emergencial: r.getBool('emergencial'),
        itens: itens
          .map((i) => ({
            item: i.item,
            q: i.quantidadeEstoque,
            qc: i.quantidadeCompra,
            f: i.fatorUsado,
          }))
          .sort(ordena),
        cotacoes: escolhidas.slice().sort(ordena),
      })
      const apr = lista('pcp_aprovacoes_compra', 'requisicao = {:r}', '-created', { r: r.id }).map(
        (a) => ({
          aprovador: a.getString('aprovador'),
          decisao: a.getString('decisao'),
          valor: Number(a.get('valor') || 0),
          alcada_usada:
            a.get('alcada_usada') === null || a.get('alcada_usada') === ''
              ? null
              : Number(a.get('alcada_usada')),
          motivo: a.getString('motivo'),
          hora: a.getString('hora'),
          valida: a.getBool('valida'),
          confere: a.getString('hash') === conteudo,
        }),
      )
      return {
        id: r.id,
        fornecedor: r.getString('fornecedor'),
        itens: itens,
        data_necessaria: r.getString('data_necessaria'),
        emergencial: r.getBool('emergencial'),
        motivo_emergencia: r.getString('motivo_emergencia') || null,
        estado: r.getString('estado'),
        versao: Number(r.get('versao') || 1),
        criado_por: r.getString('criado_por'),
        criado_em: r.getString('criado_em'),
        cotacoes: cots,
        valor: completo ? Math.round(valor * 100) / 100 : null,
        aprovacoes: apr,
      }
    })
    const alcadas = lista('pcp_alcadas', '', 'limite')
    return e.json(200, {
      requisicoes: saida,
      alcadas_cadastradas: alcadas.length,
      tolerancia_percentual: tolerancia,
      pode_editar: acoes.indexOf('editar_requisicao') !== -1,
      pode_aprovar: acoes.indexOf('aprovar_compra') !== -1,
    })
  },
  $apis.requireAuth(),
)
