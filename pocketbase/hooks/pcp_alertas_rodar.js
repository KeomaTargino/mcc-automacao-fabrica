// pocketbase/hooks/pcp_alertas_rodar.js — SPEC-3-010 CA-3-31/32 (RN-03, RN-04, RN-05, RN-07)
// POST /backend/v1/pcp/alertas/rodar — a rodada de alertas sobre os dados que o sistema já guarda.
// Exige editar_parametros (403 sem pistas). SÓ LÊ dados locais e SÓ ESCREVE alertas e lacunas: não compra,
// não publica ordem, não muda parâmetro, não grava no Omie e não gera ação financeira.
// Regras de src/lib/pcp/alertas.ts (esta rota as repete, pois hooks não compartilham código).
// Fontes ligadas hoje: compra aprovada sem pedido (pcp_requisicoes + vínculo), entrega atrasada
// (pcp_entregas_compra), preço fora da tolerância (cotações escolhidas contra o último preço) e pedido
// manual parado (pcp_pedidos_manuais + preparação). AINDA SEM FONTE LIGADA: ruptura prevista (saldo e
// consumo reais dependem da leitura do Omie, CL-PEND-006), produção atrasada (programação), divergência
// de conferência e intenção da Nuvemshop (o pedido não traz data conhecida); a resposta os lista em
// fontes_pendentes e nenhum alerta é inventado. Sem parâmetros aprovados: nada é calculado.
// A mesma chave (regra + item + referência) atualiza o alerta aberto em vez de criar outro.
routerAdd(
  'POST',
  '/backend/v1/pcp/alertas/rodar',
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
      acoes.indexOf('editar_parametros') === -1
    ) {
      return e.forbiddenError('sem_permissao')
    }
    const agora = new Date()
    const DIA = 86400000
    const HORA = 3600000
    const lp = $app.findRecordsByFilter('pcp_parametros_alerta', '', '-versao', 1, 0)
    const fontesPendentes = [
      'estoque: saldo e consumo reais aguardam a leitura do Omie (CL-PEND-006)',
      'produção: programação ainda não ligada à rodada',
      'divergência: conferências ainda não ligadas à rodada',
      'pedido (intenção da Nuvemshop): pedido sem data conhecida',
    ]
    if (lp.length === 0) {
      return e.json(200, {
        executou: false,
        motivo: 'sem parâmetros de alerta aprovados; nada foi calculado',
        fontes_pendentes: fontesPendentes,
      })
    }
    let doc = { itens: [], gravidade: {} }
    try {
      doc = JSON.parse(lp[0].getString('parametros') || '{}') || doc
    } catch (_) {}
    const versao = Number(lp[0].get('versao') || 0)
    const grav = doc.gravidade || {}
    const norm = (c) =>
      String(c || '')
        .trim()
        .toUpperCase()
    const familias = {}
    for (const r of $app.findRecordsByFilter('pcp_familias', '', 'familia', 20000, 0)) {
      familias[norm(r.getString('produto'))] = norm(r.getString('familia'))
    }
    const CAMPOS = [
      'estoqueMinimo',
      'prazoFornecedorDias',
      'toleranciaPrecoPct',
      'atrasoAceitoDias',
      'tempoMaxParadoHoras',
      'compraSemPedidoDias',
    ]
    const efetivo = (produto) => {
      const p = norm(produto)
      const doProduto = (doc.itens || []).find((i) => i.escopo === 'produto' && norm(i.chave) === p)
      const fam = familias[p]
      const daFamilia = fam
        ? (doc.itens || []).find((i) => i.escopo === 'familia' && norm(i.chave) === fam)
        : null
      const r = {}
      for (const c of CAMPOS) {
        let v =
          doProduto && doProduto[c] !== undefined
            ? doProduto[c]
            : daFamilia && daFamilia[c] !== undefined
              ? daFamilia[c]
              : null
        r[c] = typeof v === 'number' && isFinite(v) && v >= 0 ? v : null
        v = null
      }
      return r
    }
    const geral = (campo) => {
      const g = (doc.itens || []).find(
        (i) => i.escopo === 'familia' && String(i.chave).trim() === '*',
      )
      const v = g ? g[campo] : null
      return typeof v === 'number' && isFinite(v) && v >= 0 ? v : null
    }
    const gerados = []
    const lacunas = {}
    const lac = (regra, item, campo, motivo) => {
      lacunas[regra + '|' + norm(item) + '|' + campo] = {
        regra: regra,
        item: norm(item),
        campo: campo,
        motivo: motivo,
      }
    }
    const velha = (d) => agora.getTime() - d.getTime() > 24 * HORA
    const gerar = (tipo, item, ref, gravidade, regra, valores, dadoEm) => {
      gerados.push({
        chave: tipo + '|' + norm(item) + '|' + ref,
        tipo: tipo,
        item: norm(item),
        referencia: ref,
        gravidade: gravidade,
        regra: regra,
        valores: valores,
        dadoEm: dadoEm,
      })
    }
    const diaIso = (v) => {
      const s = String(v || '')
      let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
      if (m) return m[1] + '-' + m[2] + '-' + m[3]
      m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s)
      return m ? m[3] + '-' + m[2] + '-' + m[1] : null
    }
    const hojeMs = new Date(agora.toISOString().slice(0, 10)).getTime()

    // RN-03a: compra aprovada sem pedido além do prazo
    for (const req of $app.findRecordsByFilter(
      'pcp_requisicoes',
      "estado = 'aprovada'",
      'created',
      2000,
      0,
    )) {
      let itens = []
      try {
        itens = JSON.parse(req.getString('itens') || '[]') || []
      } catch (_) {}
      let temPedido = false
      try {
        $app.findFirstRecordByFilter('pcp_pedidos_compra_vinculo', 'requisicao = {:r}', {
          r: req.id,
        })
        temPedido = true
      } catch (_) {}
      if (temPedido) continue
      let aprovadaEm = null
      const ap = $app.findRecordsByFilter(
        'pcp_aprovacoes_compra',
        "requisicao = {:r} && valida = true && decisao = 'aprovada'",
        '-created',
        1,
        0,
        { r: req.id },
      )
      if (ap.length > 0)
        aprovadaEm = new Date(ap[0].getString('hora') || ap[0].getString('created'))
      if (!aprovadaEm || isNaN(aprovadaEm.getTime())) continue
      for (const it of itens) {
        const ef = efetivo(it.item)
        if (ef.compraSemPedidoDias === null) {
          lac('compra', it.item, 'compraSemPedidoDias', 'prazo para lançar o pedido não cadastrado')
          continue
        }
        if (!grav.compra) {
          lac(
            'compra',
            it.item,
            'gravidade',
            'gravidade do alerta compra não definida na versão aprovada',
          )
          continue
        }
        const dias = Math.floor((agora.getTime() - aprovadaEm.getTime()) / DIA)
        if (dias <= ef.compraSemPedidoDias) continue
        gerar(
          'compra',
          it.item,
          'sem-pedido:' + req.id,
          grav.compra,
          'compra aprovada sem pedido além do prazo',
          {
            aprovadaEm: aprovadaEm.toISOString(),
            diasSemPedido: dias,
            prazoDias: ef.compraSemPedidoDias,
          },
          aprovadaEm,
        )
      }
    }

    // RN-03b: entrega atrasada além do atraso aceito
    for (const en of $app.findRecordsByFilter(
      'pcp_entregas_compra',
      'cancelado = false',
      'created',
      20000,
      0,
    )) {
      const item = en.getString('produto_id')
      const restante =
        Number(en.get('quantidade_pedida') || 0) - Number(en.get('quantidade_recebida') || 0)
      const prev = diaIso(en.getString('data_prevista'))
      if (restante <= 0 || !prev) continue
      const ef = efetivo(item)
      if (ef.atrasoAceitoDias === null) {
        lac('compra', item, 'atrasoAceitoDias', 'atraso aceito de entrega não cadastrado')
        continue
      }
      if (!grav.compra) {
        lac(
          'compra',
          item,
          'gravidade',
          'gravidade do alerta compra não definida na versão aprovada',
        )
        continue
      }
      const atraso = Math.round((hojeMs - new Date(prev).getTime()) / DIA)
      if (atraso <= ef.atrasoAceitoDias) continue
      const dado = en.getString('lido_em') ? new Date(en.getString('lido_em')) : agora
      gerar(
        'compra',
        item,
        'entrega:' + en.getString('pedido_id'),
        grav.compra,
        'entrega atrasada além do atraso aceito',
        {
          dataPrevista: prev,
          diasDeAtraso: atraso,
          atrasoAceitoDias: ef.atrasoAceitoDias,
          restante: restante,
        },
        dado,
      )
    }

    // RN-04: preço acima da tolerância sobre o último preço
    for (const c of $app.findRecordsByFilter(
      'pcp_cotacoes',
      'escolhida = true',
      'created',
      5000,
      0,
    )) {
      const item = c.getString('item')
      const ef = efetivo(item)
      if (ef.toleranciaPrecoPct === null) {
        lac('preco', item, 'toleranciaPrecoPct', 'tolerância de preço não cadastrada')
        continue
      }
      const preco = Number(c.get('preco_estoque') || 0)
      const ultimo = Number(c.get('ultimo_preco') || 0)
      if (!(preco > 0)) {
        lac('preco', item, 'preco', 'preço sem fator confirmado: não é comparado')
        continue
      }
      if (!(ultimo > 0)) {
        lac('preco', item, 'historico', 'sem histórico para comparar')
        continue
      }
      if (!grav.preco) {
        lac('preco', item, 'gravidade', 'gravidade do alerta preco não definida na versão aprovada')
        continue
      }
      const dif = Math.round(((preco - ultimo) / ultimo) * 1e4) / 100
      if (dif <= ef.toleranciaPrecoPct) continue
      gerar(
        'preco',
        item,
        c.getString('requisicao'),
        grav.preco,
        'preço acima da tolerância sobre o histórico',
        {
          preco: preco,
          ultimoPreco: ultimo,
          diferencaPct: dif,
          toleranciaPct: ef.toleranciaPrecoPct,
        },
        new Date(c.getString('updated') || agora.toISOString()),
      )
    }

    // RN-05: pedido manual parado (não liberado) além do tempo máximo
    const tempoMax = geral('tempoMaxParadoHoras')
    for (const m of $app.findRecordsByFilter('pcp_pedidos_manuais', '', 'created', 2000, 0)) {
      const id = m.getString('pedido_id')
      let liberado = false
      try {
        liberado =
          $app
            .findFirstRecordByFilter('pcp_preparacao_pedido', 'pedido_id = {:p}', { p: id })
            .getString('liberacao_hash') !== ''
      } catch (_) {}
      if (liberado) continue
      if (tempoMax === null) {
        lac(
          'pedido',
          id,
          'tempoMaxParadoHoras',
          'tempo máximo parado não cadastrado (parâmetro geral)',
        )
        continue
      }
      if (!grav.pedido) {
        lac('pedido', id, 'gravidade', 'gravidade do alerta pedido não definida na versão aprovada')
        continue
      }
      const desde = new Date(m.getString('created'))
      const horas = Math.floor((agora.getTime() - desde.getTime()) / HORA)
      if (horas <= tempoMax) continue
      gerar(
        'pedido',
        id,
        'bloqueado_para_faturar',
        grav.pedido,
        'pedido bloqueado para faturar além do tempo máximo',
        { desde: desde.toISOString(), horasParado: horas, tempoMaxHoras: tempoMax },
        desde,
      )
    }

    // Rodada: a mesma chave atualiza o alerta aberto; senão abre um novo.
    let criados = 0
    let atualizados = 0
    const vistos = {}
    $app.runInTransaction((tx) => {
      for (const g of gerados) {
        if (vistos[g.chave]) continue
        vistos[g.chave] = true
        let aberto = null
        const ab = tx.findRecordsByFilter(
          'pcp_alertas',
          "chave = {:c} && estado = 'aberto'",
          '-ocorrencia',
          1,
          0,
          { c: g.chave },
        )
        if (ab.length > 0) aberto = ab[0]
        const campos = (r) => {
          r.set('tipo', g.tipo)
          r.set('item', g.item)
          r.set('referencia', g.referencia)
          r.set('gravidade', g.gravidade)
          r.set('regra', g.regra)
          r.set('valores', JSON.stringify(g.valores))
          r.set('versao_parametros', versao)
          r.set('dado_em', g.dadoEm.toISOString())
          r.set('fonte_desatualizada', velha(g.dadoEm))
          r.set('atualizado_em', agora.toISOString())
        }
        if (aberto) {
          campos(aberto)
          aberto.set('atualizacoes', Number(aberto.get('atualizacoes') || 0) + 1)
          tx.save(aberto)
          atualizados++
        } else {
          const todas = tx.findRecordsByFilter('pcp_alertas', 'chave = {:c}', '-ocorrencia', 1, 0, {
            c: g.chave,
          })
          const r = new Record(tx.findCollectionByNameOrId('pcp_alertas'))
          r.set('chave', g.chave)
          r.set('ocorrencia', (todas.length > 0 ? Number(todas[0].get('ocorrencia') || 0) : 0) + 1)
          r.set('estado', 'aberto')
          r.set('aberto_em', agora.toISOString())
          r.set('atualizacoes', 0)
          campos(r)
          tx.save(r)
          criados++
        }
      }
      for (const l of tx.findRecordsByFilter('pcp_alertas_lacunas', '', 'regra', 5000, 0))
        tx.delete(l)
      const col = tx.findCollectionByNameOrId('pcp_alertas_lacunas')
      for (const k of Object.keys(lacunas)) {
        const r = new Record(col)
        r.set('regra', lacunas[k].regra)
        r.set('item', lacunas[k].item)
        r.set('campo', lacunas[k].campo)
        r.set('motivo', lacunas[k].motivo)
        tx.save(r)
      }
    })
    return e.json(200, {
      executou: true,
      versao_parametros: versao,
      hora: agora.toISOString(),
      criados: criados,
      atualizados: atualizados,
      lacunas: Object.keys(lacunas).length,
      fontes_pendentes: fontesPendentes,
      acoes_executadas: 0,
    })
  },
  $apis.requireAuth(),
)
