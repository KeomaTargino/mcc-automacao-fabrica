// pocketbase/hooks/pcp_vendas_carregar.js — SPEC-3-012 CA-3-35 (P3.12-04)
// POST /backend/v1/pcp/vendas/carregar { periodo: 'AAAA-MM' }
// Lê do Omie UMA PÁGINA por chamada das vendas FATURADAS do mês (ListarPedidos com data_faturamento_de/
// ate, mapa aprovado em 21/10: só pedido faturado com data de faturamento; cancelado, denegado e
// devolvido ficam de fora; item sem código ou sem quantidade válida é ignorado, nunca vira zero) e soma
// por produto e página. A cada chamada vem a página seguinte à última lida (sem buracos); reler uma
// página substitui as linhas dela (idempotente). O mês só conta como lido quando a última página
// entrou. Só LEITURA no Omie. Exige editar_parametros (403 sem pistas). Bloqueio por consumo (HTTP 425
// ou "consumo redundante"): não repete, guarda a hora da próxima tentativa (+12 h) e mantém o que já
// estava lido. Quem chama volta com a próxima página depois de uma pausa; nada roda em laço. Não altera
// o baseline90-v1 nem grava no Omie.
routerAdd(
  'POST',
  '/backend/v1/pcp/vendas/carregar',
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
    const b = e.requestInfo().body || {}
    const periodo = String(b.periodo || '')
    const m = /^(\d{4})-(\d{2})$/.exec(periodo)
    if (!m || Number(m[2]) < 1 || Number(m[2]) > 12)
      return e.json(422, { erro: 'dados_invalidos', motivos: ['período deve ser AAAA-MM'] })
    const APP = 'app1'
    let cob = null
    try {
      cob = $app.findFirstRecordByFilter(
        'pcp_historico_vendas_cobertura',
        'aplicativo = {:a} && periodo = {:p}',
        { a: APP, p: periodo },
      )
    } catch (_) {}
    if (
      cob &&
      cob.getString('proxima_tentativa') &&
      new Date(cob.getString('proxima_tentativa')).getTime() > Date.now()
    ) {
      return e.json(423, {
        erro: 'aguardando',
        proxima_tentativa: cob.getString('proxima_tentativa'),
        motivo: 'o Omie pediu para esperar; nada foi consultado',
      })
    }
    if (cob && cob.getBool('completo')) {
      return e.json(200, {
        periodo: periodo,
        completo: true,
        motivo: 'mês já lido por inteiro; nada foi consultado',
      })
    }
    const pagina = (cob ? Number(cob.get('ultima_pagina') || 0) : 0) + 1
    const appKey = $secrets.get('OMIE_APP_KEY')
    const appSecret = $secrets.get('OMIE_APP_SECRET')
    if (!appKey || !appSecret) return e.badRequestError('credencial_ausente')
    const ultimoDia = new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)).getUTCDate()
    const de = '01/' + m[2] + '/' + m[1]
    const ate = String(ultimoDia).padStart(2, '0') + '/' + m[2] + '/' + m[1]
    let status = 0
    let j = null
    try {
      const res = $http.send({
        url: 'https://app.omie.com.br/api/v1/produtos/pedido/',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          call: 'ListarPedidos',
          app_key: appKey,
          app_secret: appSecret,
          param: [
            {
              pagina: pagina,
              registros_por_pagina: 20,
              apenas_resumo: 'N',
              data_faturamento_de: de,
              data_faturamento_ate: ate,
            },
          ],
        }),
        timeout: 30,
      })
      status = res.statusCode
      j = res.json
    } catch (_) {
      return e.json(200, {
        periodo: periodo,
        completo: false,
        inconclusivo: true,
        motivo: 'consulta sem resposta; nada foi gravado',
      })
    }
    const fault = String((j && j.faultstring) || '').toLowerCase()
    if (status === 425 || fault.indexOf('consumo redundante') !== -1) {
      const prox = new Date(Date.now() + 12 * 3600000).toISOString()
      if (!cob) {
        cob = new Record($app.findCollectionByNameOrId('pcp_historico_vendas_cobertura'))
        cob.set('aplicativo', APP)
        cob.set('periodo', periodo)
        cob.set('ultima_pagina', 0)
        cob.set('completo', false)
      }
      cob.set('proxima_tentativa', prox)
      $app.save(cob)
      return e.json(200, {
        periodo: periodo,
        completo: false,
        bloqueado: true,
        proxima_tentativa: prox,
      })
    }
    if (status < 200 || status >= 300 || !j || !Array.isArray(j.pedido_venda_produto)) {
      return e.json(200, {
        periodo: periodo,
        completo: false,
        inconclusivo: true,
        motivo: 'resposta inesperada do Omie; nada foi gravado',
      })
    }
    const total = Number(j.total_de_paginas || 0)
    const soma = {}
    const norm = (c) =>
      String(c || '')
        .trim()
        .toUpperCase()
    const sim = (x) => String(x || '').toUpperCase() === 'S'
    for (const p of j.pedido_venda_produto) {
      const i = p.infoCadastro || {}
      if (
        !sim(i.faturado) ||
        sim(i.cancelado) ||
        sim(i.denegado) ||
        sim(i.devolvido) ||
        sim(i.devolvido_parcial)
      )
        continue
      if (!/^\d{2}\/\d{2}\/\d{4}$/.test(String(i.dFat || ''))) continue
      if (String(i.dFat).slice(3) !== m[2] + '/' + m[1]) continue
      for (const d of p.det || []) {
        const pr = d.produto || {}
        const cod = norm(pr.codigo || pr.codigo_produto)
        const q = Number(pr.quantidade)
        if (!cod || !isFinite(q) || q <= 0) continue
        soma[cod] = Math.round(((soma[cod] || 0) + q) * 1e6) / 1e6
      }
    }
    $app.runInTransaction((tx) => {
      for (const r of tx.findRecordsByFilter(
        'pcp_historico_vendas_periodo',
        'aplicativo = {:a} && periodo = {:p} && pagina = {:g}',
        'produto',
        20000,
        0,
        { a: APP, p: periodo, g: pagina },
      ))
        tx.delete(r)
      const col = tx.findCollectionByNameOrId('pcp_historico_vendas_periodo')
      for (const k of Object.keys(soma)) {
        const r = new Record(col)
        r.set('aplicativo', APP)
        r.set('periodo', periodo)
        r.set('pagina', pagina)
        r.set('produto', k)
        r.set('quantidade', soma[k])
        tx.save(r)
      }
      let c = null
      try {
        c = tx.findFirstRecordByFilter(
          'pcp_historico_vendas_cobertura',
          'aplicativo = {:a} && periodo = {:p}',
          { a: APP, p: periodo },
        )
      } catch (_) {}
      if (!c) {
        c = new Record(tx.findCollectionByNameOrId('pcp_historico_vendas_cobertura'))
        c.set('aplicativo', APP)
        c.set('periodo', periodo)
      }
      c.set('ultima_pagina', pagina)
      c.set('total_paginas', total)
      c.set('completo', total > 0 ? pagina >= total : true)
      c.set('lido_em', new Date().toISOString())
      c.set('proxima_tentativa', '')
      tx.save(c)
    })
    return e.json(200, {
      periodo: periodo,
      pagina: pagina,
      total_paginas: total,
      completo: total > 0 ? pagina >= total : true,
      produtos_na_pagina: Object.keys(soma).length,
    })
  },
  $apis.requireAuth(),
)
