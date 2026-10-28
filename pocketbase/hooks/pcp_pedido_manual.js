// pocketbase/hooks/pcp_pedido_manual.js — SPEC-3-009 CA-3-28
// POST /backend/v1/pcp/faturamento/pedido/manual { cliente_omie, data, itens:[{item,quantidade}], motivo, referencia }
// Registra um pedido MANUAL (e-mail, WhatsApp) marcado como "manual", com motivo obrigatório. Antes de
// criar, procura o mesmo pedido: a MESMA referência (código de integração ou número do canal) de outro
// pedido do lote do Omie ou de outro manual = duplicata, registrado como bloqueado; mesmo cliente, data e
// itens sem referência que os distinga = possível duplicata, "a revisar". Nunca junta por cliente e
// valor. Exige preparar_pedido E a área faturamento. Não grava no Omie (a gravação é outra rota, atrás da
// chave). Regras de src/lib/pcp/preparacao-pedido.ts.
routerAdd(
  'POST',
  '/backend/v1/pcp/faturamento/pedido/manual',
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
      acoes.indexOf('preparar_pedido') === -1 ||
      perfil.getStringSlice('areas').indexOf('faturamento') === -1
    ) {
      return e.forbiddenError('sem_permissao')
    }
    const b = e.requestInfo().body || {}
    const cliente = String(b.cliente_omie || '').trim()
    const data = String(b.data || '')
    const motivo = String(b.motivo || '').trim()
    const ref = String(b.referencia || '').trim()
    const itens = (Array.isArray(b.itens) ? b.itens : []).map((i) => ({
      item: String((i && i.item) || '')
        .trim()
        .toUpperCase(),
      quantidade: Number(i && i.quantidade),
    }))
    const motivos = []
    if (!cliente) motivos.push('cliente obrigatório')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) motivos.push('data inválida')
    if (itens.length === 0) motivos.push('o pedido precisa de ao menos um item')
    for (const i of itens)
      if (!i.item || !isFinite(i.quantidade) || i.quantidade <= 0) {
        motivos.push('item e quantidade maior que zero são obrigatórios')
        break
      }
    if (motivo.length < 3) motivos.push('informe por que o pedido é manual (e-mail, WhatsApp…)')
    if (motivos.length > 0) return e.json(422, { erro: 'dados_invalidos', motivos: motivos })

    const assin = (l) =>
      l
        .map((i) => i.item + 'x' + i.quantidade)
        .sort()
        .join('|')
    const minha = assin(itens)
    // candidatos: pedidos do lote ativo do Omie e outros manuais
    const cand = []
    try {
      const f = $app.findFirstRecordByFilter(
        'pcp_fontes',
        "fonte = 'omie' && recurso = 'pedidos' && aplicativo_ref = 'app1'",
      )
      const lote = f.getString('lote_ativo')
      if (lote) {
        for (const r of $app.findRecordsByFilter('pcp_dados', 'lote = {:l}', '-id', 300, 0, {
          l: lote,
        })) {
          try {
            const it = JSON.parse(r.getString('conteudo') || '{}') || {}
            const cab = it.cabecalho || {}
            const dm = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(cab.data_previsao || ''))
            cand.push({
              id: String(cab.codigo_pedido || ''),
              cliente:
                cab.codigo_cliente === undefined || cab.codigo_cliente === null
                  ? ''
                  : String(cab.codigo_cliente),
              data: dm ? dm[3] + '-' + dm[2] + '-' + dm[1] : '',
              refs: [
                String(cab.codigo_pedido_integracao || '').trim(),
                String((it.informacoes_adicionais || {}).numero_pedido_cliente || '').trim(),
              ].filter((x) => x),
              sig: assin(
                (it.det || []).map((d) => ({
                  item: String(
                    (d.produto || {}).codigo || (d.produto || {}).codigo_produto || '',
                  ).toUpperCase(),
                  quantidade: Number((d.produto || {}).quantidade),
                })),
              ),
            })
          } catch (_) {}
        }
      }
    } catch (_) {}
    for (const m of $app.findRecordsByFilter('pcp_pedidos_manuais', '', 'created', 2000, 0)) {
      let l = []
      try {
        l = JSON.parse(m.getString('itens') || '[]') || []
      } catch (_) {}
      const r = m.getString('referencia').trim()
      cand.push({
        id: m.getString('pedido_id'),
        cliente: m.getString('cliente_omie'),
        data: m.getString('data'),
        refs: r ? [r] : [],
        sig: assin(
          l.map((i) => ({ item: String(i.item).toUpperCase(), quantidade: Number(i.quantidade) })),
        ),
      })
    }
    let dup = { situacao: 'nenhuma' }
    if (ref) {
      const igual = cand.find((o) => o.refs.indexOf(ref) !== -1)
      if (igual)
        dup = {
          situacao: 'duplicata',
          com: igual.id,
          motivo: 'mesma referência do pedido ' + igual.id,
        }
    }
    if (dup.situacao === 'nenhuma') {
      const par = cand.find(
        (o) =>
          o.cliente === cliente &&
          o.data === data &&
          o.sig === minha &&
          (!ref || o.refs.length === 0),
      )
      if (par)
        dup = {
          situacao: 'possivel',
          com: par.id,
          motivo:
            'mesmo cliente, data e itens do pedido ' + par.id + ', sem referência que os distinga',
        }
    }
    const estado =
      dup.situacao === 'duplicata'
        ? 'bloqueado_duplicata'
        : dup.situacao === 'possivel'
          ? 'a_revisar'
          : 'registrado'
    const pedidoId = 'M' + Date.now().toString(36).toUpperCase()
    const r = new Record($app.findCollectionByNameOrId('pcp_pedidos_manuais'))
    r.set('pedido_id', pedidoId)
    r.set('cliente_omie', cliente)
    r.set('data', data)
    r.set('itens', JSON.stringify(itens))
    r.set('motivo', motivo)
    r.set('referencia', ref)
    r.set('codigo_integracao', 'MAN-' + pedidoId)
    r.set('estado', estado)
    r.set('duplicata_com', dup.com || '')
    r.set('duplicata_motivo', dup.motivo || '')
    r.set('criado_por', auth.getString('email') || auth.id)
    $app.save(r)
    return e.json(200, { ok: true, pedido_id: pedidoId, estado: estado, duplicata: dup })
  },
  $apis.requireAuth(),
)
