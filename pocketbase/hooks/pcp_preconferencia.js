// pocketbase/hooks/pcp_preconferencia.js — SPEC-3-007 CA-3-22 (RN-05)
// POST /backend/v1/pcp/compras/preconferencia { pedido, nota: { demonstracao: true, emitente, numero,
//   serie, itens: [{ item, quantidade, unidade, valor }], duplicatas: [{ numero, vencimento, valor }] } }
// Compara a nota de DEMONSTRAÇÃO com o pedido, o recebimento e as parcelas e deixa pendente o que não
// bate. Nota real NUNCA entra (422): leitura de nota real e escrita do recebimento no Omie estão em
// revisão (CL-PEND-007) e não existem aqui. Exige conferir_recebimento E a área recebimento. Não
// ajusta estoque, não classifica a nota e não lança no financeiro. Regras de src/lib/pcp/recebimento.ts.
routerAdd(
  'POST',
  '/backend/v1/pcp/compras/preconferencia',
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
      acoes.indexOf('conferir_recebimento') === -1 ||
      perfil.getStringSlice('areas').indexOf('recebimento') === -1
    ) {
      return e.forbiddenError('sem_permissao')
    }
    const body = e.requestInfo().body || {}
    const nota = body.nota || {}
    if (nota.demonstracao !== true) {
      return e.json(422, {
        erro: 'nota_real_nao_entra',
        motivo:
          'só nota de demonstração marcada; a leitura de nota real está em revisão (CL-PEND-007)',
      })
    }
    const pedidoId = String(body.pedido || '').trim()
    const norm = (c) =>
      String(c || '')
        .trim()
        .toUpperCase()
    const arred = (n) => Math.round(n * 1e6) / 1e6
    const EPS = 1e-6

    // pedido aprovado e ligado
    let pedido = null
    const aprovadas = $app.findRecordsByFilter(
      'pcp_requisicoes',
      "estado = 'aprovada'",
      '-created',
      2000,
      0,
    )
    for (const r of aprovadas) {
      try {
        const v = $app.findFirstRecordByFilter(
          'pcp_pedidos_compra_vinculo',
          "requisicao = {:r} && estado = 'ligado'",
          { r: r.id },
        )
        if ((v.getString('numero_omie') || r.id) === pedidoId) {
          pedido = {
            fornecedor: r.getString('fornecedor'),
            itens: JSON.parse(r.getString('itens') || '[]') || [],
          }
          break
        }
      } catch (_) {}
    }
    if (!pedido)
      return e.json(422, {
        erro: 'dados_invalidos',
        motivos: ['pedido não é um pedido aprovado e ligado'],
      })

    const pend = []
    const avisos = []
    const notaPorItem = {}
    for (const i of Array.isArray(nota.itens) ? nota.itens : []) {
      notaPorItem[norm(i.item)] = arred(
        (notaPorItem[norm(i.item)] || 0) + Number(i.quantidade || 0),
      )
    }
    const recPorItem = {}
    const recs = $app.findRecordsByFilter('pcp_recebimentos', '', 'created', 5000, 0)
    for (const r of recs) {
      let linhas = []
      try {
        linhas = JSON.parse(r.getString('linhas') || '[]') || []
      } catch (_) {}
      for (const l of linhas) {
        for (const g of l.ligacoes || []) {
          if (g.pedidoId === pedidoId)
            recPorItem[norm(l.item)] = arred((recPorItem[norm(l.item)] || 0) + g.quantidade)
        }
      }
    }
    const pedidoPorItem = {}
    for (const l of pedido.itens) pedidoPorItem[norm(l.item)] = l.quantidadeEstoque
    for (const item of Object.keys(notaPorItem)) {
      const qNota = notaPorItem[item]
      const qPed = pedidoPorItem[item]
      if (qPed === undefined) {
        pend.push({
          tipo: 'item_nao_pedido',
          item: item,
          esperado: null,
          encontrado: qNota,
          mensagem: 'item ' + item + ' está na nota e não está no pedido',
        })
        continue
      }
      const qRec = recPorItem[item]
      if (qRec === undefined) {
        pend.push({
          tipo: 'item_nao_recebido',
          item: item,
          esperado: qPed,
          encontrado: null,
          mensagem: 'item ' + item + ' está na nota e ainda não foi recebido',
        })
      }
      const refs = [
        ['pedido', qPed],
        ['recebimento', qRec],
      ]
      for (const par of refs) {
        const ref = par[1]
        if (ref !== undefined && Math.abs(qNota - ref) > EPS) {
          const d = Math.abs(arred(qNota - ref))
          pend.push({
            tipo: 'quantidade',
            item: item,
            esperado: ref,
            encontrado: qNota,
            diferenca: d,
            mensagem:
              'item ' +
              item +
              ': nota ' +
              qNota +
              ' contra ' +
              par[0] +
              ' ' +
              ref +
              ' (diferença de ' +
              d +
              ')',
          })
        }
      }
    }
    const parcelas = $app.findRecordsByFilter(
      'pcp_parcelas_compra',
      'pedido = {:p}',
      'numero',
      200,
      0,
      { p: pedidoId },
    )
    if (parcelas.length > 0) {
      const totalP = arred(parcelas.reduce((s, p) => s + Number(p.get('valor') || 0), 0))
      const totalN = arred(
        (Array.isArray(nota.duplicatas) ? nota.duplicatas : []).reduce(
          (s, d) => s + Number(d.valor || 0),
          0,
        ),
      )
      if (Math.abs(totalP - totalN) > 0.005) {
        pend.push({
          tipo: 'total_duplicatas',
          esperado: totalP,
          encontrado: totalN,
          diferenca: Math.abs(arred(totalP - totalN)),
          mensagem:
            'duplicatas da nota somam ' + totalN + ' e as parcelas do pedido somam ' + totalP,
        })
      }
      if (parcelas.every((p) => p.getBool('pago_antecipado')))
        avisos.push('já paga: não lançar nova conta a pagar')
    }
    const estado = pend.length === 0 ? 'conferida' : 'pendente'
    const rec = new Record($app.findCollectionByNameOrId('pcp_notas_demo'))
    rec.set('pedido', pedidoId)
    rec.set('demonstracao', true)
    rec.set('nota', JSON.stringify(nota))
    rec.set('estado', estado)
    rec.set('pendencias', JSON.stringify(pend))
    rec.set('avisos', JSON.stringify(avisos))
    rec.set('conferida_por', auth.getString('email') || auth.id)
    rec.set('conferida_em', new Date().toISOString())
    $app.save(rec)
    return e.json(200, { ok: true, estado: estado, pendencias: pend, avisos: avisos })
  },
  $apis.requireAuth(),
)
