// pocketbase/hooks/pcp_pedidos_preparacao.js — SPEC-3-008 CA-3-25 e SPEC-3-009 CA-3-26 a CA-3-29
// GET /backend/v1/pcp/faturamento/pedidos — a fila de preparação. Cada pedido do lote ativo do Omie e cada
// pedido manual aparece com: unidade, tabela vigente, subtotal RECALCULADO ao lado do subtotal do pedido,
// origem (SPEC-3-008) e, agora, frete, volumes, duplicata e o selo "apto" / "bloqueado: motivo" /
// "liberado". Só leitura de dados do Omie; nada é trocado no pedido, no preço ou no cliente. Exige
// consultar_faturamento E a área faturamento. Única escrita: se o conteúdo de um pedido liberado mudou
// depois da liberação, a liberação é desfeita e registrada (CA-3-27).
// Campos do pedido do Omie lidos e AINDA NÃO conferidos numa amostra real (chave bloqueada, CL-PEND-006):
// cabecalho.codigo_cliente, det[].produto.valor_unitario, total_pedido.valor_total_pedido,
// informacoes_adicionais.numero_pedido_cliente. Campo ausente vira "pendente" (null), nunca zero nem
// palpite. Duplicata só por referência comprovada; pedido parecido (cliente, data e itens) vai para
// revisão; o valor nunca entra na conta. Regras de src/lib/pcp/unidades.ts e preparacao-pedido.ts.
routerAdd(
  'GET',
  '/backend/v1/pcp/faturamento/pedidos',
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
      acoes.indexOf('consultar_faturamento') === -1 ||
      perfil.getStringSlice('areas').indexOf('faturamento') === -1
    ) {
      return e.forbiddenError('sem_permissao')
    }
    const pode = (a) => acoes.indexOf(a) !== -1
    const lote = (fonteNome) => {
      try {
        const f = $app.findFirstRecordByFilter(
          'pcp_fontes',
          "fonte = {:f} && recurso = 'pedidos' && aplicativo_ref = 'app1'",
          { f: fonteNome },
        )
        return { id: f.getString('lote_ativo'), ultimo: f.getString('ultimo_sucesso') || null }
      } catch (_) {
        return { id: '', ultimo: null }
      }
    }
    const omie = lote('omie')
    const manuais = $app.findRecordsByFilter('pcp_pedidos_manuais', '', 'created', 2000, 0)
    if (!omie.id && manuais.length === 0) {
      return e.json(200, {
        disponivel: false,
        motivo:
          'pedidos do Omie ainda sem leitura ativa; a lista aparece quando a leitura estiver liberada',
      })
    }
    // pedidos da Nuvemshop do lote: id e número → pago?
    const nuvem = {}
    const nl = lote('nuvemshop')
    if (nl.id) {
      for (const r of $app.findRecordsByFilter('pcp_dados', 'lote = {:l}', 'id', 10000, 0, {
        l: nl.id,
      })) {
        try {
          const it = JSON.parse(r.getString('conteudo') || '{}') || {}
          const pago = String(it.pagamento || '').toLowerCase() === 'paid'
          if (it.pedido_id) nuvem[String(it.pedido_id)] = pago
          if (it.numero) nuvem[String(it.numero)] = pago
        } catch (_) {}
      }
    }
    // unidades vigentes e tabela
    const maior = {}
    const un = {}
    for (const r of $app.findRecordsByFilter('pcp_unidades', '', '-versao', 20000, 0)) {
      const c = r.getString('cliente_omie')
      const v = Number(r.get('versao') || 0)
      if (!maior[c] || v > maior[c]) {
        maior[c] = v
        un[c] = {
          unidade: r.getString('unidade'),
          nome: r.getString('nome_fantasia_operacional'),
          ativo: r.getBool('ativo'),
        }
      }
    }
    const tabela = $app
      .findRecordsByFilter('pcp_tabelas_preco', '', 'chave', 20000, 0)
      .map((r) => ({
        chave: r.getString('chave'),
        item: r.getString('item'),
        preco: Number(r.get('preco') || 0),
        vig: r.getString('vigencia_inicio'),
        versao: Number(r.get('versao') || 0),
      }))
    const precoVig = (chave, item, data) => {
      const pega = (c) => {
        let m = null
        for (const p of tabela) {
          if (
            p.chave === c &&
            p.item === item &&
            p.vig <= data &&
            (m === null || p.vig > m.vig || (p.vig === m.vig && p.versao > m.versao))
          )
            m = p
        }
        return m
      }
      return pega(chave) || pega('*')
    }
    const num = (v) =>
      v === null || v === undefined || v === '' || !isFinite(Number(v)) ? null : Number(v)
    const dataIso = (v) => {
      const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(v || ''))
      return m ? m[3] + '-' + m[2] + '-' + m[1] : new Date().toISOString().slice(0, 10)
    }

    // Entradas normalizadas: pedidos do Omie e pedidos manuais.
    const entradas = []
    if (omie.id) {
      const regs = $app.findRecordsByFilter('pcp_dados', 'lote = {:l}', '-id', 300, 0, {
        l: omie.id,
      })
      for (const r of regs) {
        let it = {}
        try {
          it = JSON.parse(r.getString('conteudo') || '{}') || {}
        } catch (_) {
          continue
        }
        const cab = it.cabecalho || {}
        const pedidoId = String(cab.codigo_pedido || '')
        if (!pedidoId) continue
        const ref = String(cab.codigo_pedido_integracao || '').trim()
        const refCliente = String(
          (it.informacoes_adicionais || {}).numero_pedido_cliente || '',
        ).trim()
        let origem = 'omie'
        let situacao = null
        if (ref) {
          if (nuvem[ref] !== undefined) {
            origem = 'nuvemshop'
            situacao = nuvem[ref] ? 'confirmado' : 'intencao'
          } else {
            origem = 'a_confirmar'
          }
        }
        const itens = []
        for (const d of it.det || []) {
          const p = d.produto || {}
          const cod = String(p.codigo || p.codigo_produto || '').toUpperCase()
          const q = num(p.quantidade)
          if (!cod || q === null) continue
          itens.push({ item: cod, quantidade: q, preco_pedido: num(p.valor_unitario) })
        }
        entradas.push({
          pedido_id: pedidoId,
          cliente:
            cab.codigo_cliente === undefined || cab.codigo_cliente === null
              ? ''
              : String(cab.codigo_cliente),
          data: dataIso(cab.data_previsao || (it.infoCadastro || {}).dInc),
          refs: [ref, refCliente].filter((x) => x),
          origem: origem,
          situacao: situacao,
          itens: itens,
          sub_pedido: num((it.total_pedido || {}).valor_total_pedido),
          manual: null,
        })
      }
    }
    for (const m of manuais) {
      let itens = []
      try {
        itens = JSON.parse(m.getString('itens') || '[]') || []
      } catch (_) {}
      const ref = m.getString('referencia').trim()
      entradas.push({
        pedido_id: m.getString('pedido_id'),
        cliente: m.getString('cliente_omie'),
        data: m.getString('data'),
        refs: ref ? [ref] : [],
        origem: 'manual',
        situacao: null,
        itens: itens.map((i) => ({
          item: String(i.item || '').toUpperCase(),
          quantidade: Number(i.quantidade),
          preco_pedido: null,
        })),
        sub_pedido: null,
        manual: m,
      })
    }
    const assin = (x) =>
      x.itens
        .map((i) => i.item + 'x' + i.quantidade)
        .sort()
        .join('|')
    const duplicata = (x) => {
      if (!x.manual) return { situacao: 'nenhuma' }
      const ref = x.refs[0] || ''
      const outros = entradas.filter((o) => o.pedido_id !== x.pedido_id)
      if (ref) {
        const igual = outros.find((o) => o.refs.indexOf(ref) !== -1)
        if (igual)
          return {
            situacao: 'duplicata',
            com: igual.pedido_id,
            motivo: 'mesma referência do pedido ' + igual.pedido_id,
          }
      }
      const parecido = outros.find(
        (o) =>
          o.cliente === x.cliente &&
          o.data === x.data &&
          assin(o) === assin(x) &&
          (!ref || o.refs.length === 0),
      )
      if (parecido)
        return {
          situacao: 'possivel',
          com: parecido.pedido_id,
          motivo:
            'mesmo cliente, data e itens do pedido ' +
            parecido.pedido_id +
            ', sem referência que os distinga',
        }
      return { situacao: 'nenhuma' }
    }

    const preps = {}
    for (const r of $app.findRecordsByFilter('pcp_preparacao_pedido', '', 'pedido_id', 20000, 0))
      preps[r.getString('pedido_id')] = r
    const gravs = {}
    for (const r of $app.findRecordsByFilter('pcp_gravacoes_venda', '', 'created', 20000, 0)) {
      const k = r.getString('pedido_id')
      if (!gravs[k]) gravs[k] = []
      gravs[k].push({ operacao: r.getString('operacao'), estado: r.getString('estado') })
    }
    let chave = { ligada: false, escopo: null }
    try {
      const c = $app.findFirstRecordByFilter('pcp_chaves_escrita', 'chave = {:c}', {
        c: 'omie_pedido_venda_escrita',
      })
      chave = { ligada: c.getBool('ligada'), escopo: c.getString('escopo') || null }
    } catch (_) {}

    const pedidos = []
    let semUnidade = 0
    let aRevisar = 0
    let aptos = 0
    let bloqueados = 0
    for (const x of entradas) {
      const u = x.cliente ? un[x.cliente] : null
      const itens = []
      const semPreco = []
      let total = 0
      let diferente = false
      for (const i of x.itens) {
        const pt = u ? precoVig(x.cliente, i.item, x.data) : null
        if (!pt) semPreco.push(i.item)
        else total += i.quantidade * pt.preco
        const dif = !!pt && i.preco_pedido !== null && Math.abs(i.preco_pedido - pt.preco) > 0.005
        if (dif) diferente = true
        itens.push({
          item: i.item,
          quantidade: i.quantidade,
          preco_pedido: i.preco_pedido,
          preco_tabela: pt ? pt.preco : null,
          diferente_da_tabela: dif,
          sem_preco: !pt,
        })
      }
      const recal =
        u && itens.length > 0 && semPreco.length === 0 ? Math.round(total * 100) / 100 : null
      const motivosPrep = []
      if (!u || !u.ativo) {
        motivosPrep.push('Unidade não cadastrada')
        semUnidade++
      }
      if (x.origem === 'a_confirmar') motivosPrep.push('Origem a confirmar')
      if (x.situacao === 'intencao') motivosPrep.push('Pedido ainda não pago (intenção)')
      const prep = preps[x.pedido_id] || null
      const modalidade = prep ? prep.getString('frete_modalidade') : ''
      const volQtd = prep ? Number(prep.get('volumes_quantidade') || 0) : 0
      const peso = prep ? Number(prep.get('peso_bruto') || 0) : 0
      const motivos = motivosPrep.slice()
      if (!modalidade) motivos.push('frete não definido')
      if (!volQtd) motivos.push('volumes não conferidos')
      if (semPreco.length > 0) motivos.push('item sem preço na tabela')
      if (diferente) motivos.push('preço diferente da tabela: diferença aberta')
      const dup = duplicata(x)
      const dec = x.manual ? x.manual.getString('decisao') : ''
      if (dup.situacao === 'duplicata') motivos.push('duplicata: ' + dup.motivo)
      if (dup.situacao === 'possivel') {
        if (!dec) {
          motivos.push('possível duplicata: a revisar (' + dup.motivo + ')')
          aRevisar++
        } else if (dec === 'e_duplicata') {
          motivos.push(
            'duplicata decidida pelo faturamento: ' + x.manual.getString('decisao_motivo'),
          )
        }
      }
      const hash = JSON.stringify({
        p: x.pedido_id,
        c: x.cliente,
        o: x.origem,
        u: u ? u.unidade : null,
        i: itens.map((i) => [i.item, i.quantidade, i.preco_pedido, i.preco_tabela]),
        f: modalidade
          ? { modalidade: modalidade, transportadora: prep.getString('transportadora') }
          : null,
        v: volQtd ? [volQtd, peso > 0 ? peso : null] : null,
      })
      let liberacao = null
      let estado = motivos.length > 0 ? 'bloqueado' : 'apto'
      if (prep && prep.getString('liberacao_hash') !== '') {
        if (motivos.length === 0 && prep.getString('liberacao_hash') === hash) {
          estado = 'liberado'
          liberacao = { por: prep.getString('liberado_por'), em: prep.getString('liberado_em') }
        } else {
          // mudou depois da liberação: desfaz e registra
          try {
            const ev = new Record($app.findCollectionByNameOrId('pcp_liberacoes_faturamento'))
            ev.set('pedido_id', x.pedido_id)
            ev.set('evento', 'desfeita')
            ev.set('hash', prep.getString('liberacao_hash'))
            ev.set('por', 'sistema')
            ev.set('em', new Date().toISOString())
            ev.set('motivo', 'conteúdo do pedido mudou depois da liberação')
            $app.save(ev)
            prep.set('liberacao_hash', '')
            prep.set('liberado_por', '')
            prep.set('versao', Number(prep.get('versao') || 0) + 1)
            $app.save(prep)
          } catch (_) {}
        }
      }
      // Selo "apto" que a liberação confere: o hash visto pela fila, com a hora da leitura.
      if (prep) {
        try {
          const seloAtual = estado === 'bloqueado' ? '' : hash
          const velho =
            !prep.getString('apto_em') ||
            Date.now() - new Date(prep.getString('apto_em')).getTime() > 120000
          if (
            prep.getString('estado_fila') !== estado ||
            prep.getString('apto_hash') !== seloAtual ||
            (seloAtual && velho)
          ) {
            prep.set('estado_fila', estado)
            prep.set('origem', x.origem)
            prep.set('unidade', u ? u.unidade : '')
            prep.set('situacao_canal', x.situacao || '')
            prep.set('apto_hash', seloAtual)
            prep.set('apto_em', new Date().toISOString())
            $app.save(prep)
          }
        } catch (_) {}
      }
      if (estado === 'apto') aptos++
      else if (estado === 'bloqueado') bloqueados++
      const paraLancar = []
      if (estado === 'liberado') {
        paraLancar.push({
          operacao: 'alterar_volumes_frete',
          cabecalho: {
            codigo_pedido_integracao: x.manual
              ? x.manual.getString('codigo_integracao')
              : x.refs[0] || null,
          },
          frete: {
            modalidade: modalidade,
            quantidade_volumes: volQtd,
            peso_bruto: peso > 0 ? peso : null,
          },
        })
      }
      pedidos.push({
        pedido_id: x.pedido_id,
        cliente_omie: x.cliente || null,
        unidade: u ? u.unidade : null,
        nome_fantasia_operacional: u ? u.nome : null,
        data: x.data,
        origem: x.origem,
        situacao_canal: x.situacao,
        apto_para_preparar: motivosPrep.length === 0,
        motivos: motivosPrep,
        itens: itens,
        subtotal_recalculado: recal,
        subtotal_pedido: x.sub_pedido,
        diferenca:
          recal !== null && x.sub_pedido !== null
            ? Math.round((x.sub_pedido - recal) * 100) / 100
            : null,
        subtotal_pendente: semPreco,
        manual: !!x.manual,
        motivo_manual: x.manual ? x.manual.getString('motivo') : null,
        referencia: x.refs[0] || null,
        frete: modalidade
          ? { modalidade: modalidade, transportadora: prep.getString('transportadora') }
          : null,
        volumes: volQtd
          ? {
              quantidade: volQtd,
              peso_bruto: peso > 0 ? peso : null,
              por: prep.getString('volumes_por'),
              em: prep.getString('volumes_em'),
            }
          : null,
        versao_prep: prep ? Number(prep.get('versao') || 0) : 0,
        estado: estado,
        motivos_fila: motivos,
        duplicata: dup,
        decisao_duplicata: dec || null,
        liberacao: liberacao,
        gravacoes: gravs[x.pedido_id] || [],
        para_lancar: paraLancar,
        hash_visto: hash,
      })
    }
    let nomesARevisar = 0
    for (const n of $app.findRecordsByFilter(
      'pcp_nomes_canal',
      "estado = 'a_revisar'",
      'created',
      5000,
      0,
    ))
      nomesARevisar++
    return e.json(200, {
      disponivel: true,
      omie_lote: !!omie.id,
      ultimo_sucesso: omie.ultimo,
      pedidos: pedidos,
      totais: {
        pedidos: pedidos.length,
        sem_unidade: semUnidade,
        nomes_a_revisar: nomesARevisar,
        aptos: aptos,
        bloqueados: bloqueados,
        duplicatas_a_revisar: aRevisar,
      },
      chave: chave,
      pode: {
        preparar: pode('preparar_pedido'),
        conferir_volumes: pode('conferir_volumes'),
        liberar: pode('liberar_faturamento'),
      },
      aviso:
        'campos do pedido ainda não conferidos numa amostra real; campo ausente aparece como pendente. Marcador do Lunet ainda não identificado.',
    })
  },
  $apis.requireAuth(),
)
