// pocketbase/hooks/pcp_assistente.js — SPEC-3-015 CA-3-41/42 (RN-01 a RN-05)
// POST /backend/v1/pcp/assistente { pergunta }
// Assistente de consulta SOMENTE LEITURA com a IA nativa do Skip ($ai.chat, modelo "fast"; sem provedor
// externo). Exige a ação consultar_assistente (403 sem pistas). Ordem: (1) pedido de ação (comprar,
// aprovar, publicar, liberar, enviar ao Omie, gravar…) é recusado ANTES de chamar a IA, com a tela certa;
// (2) as ferramentas oferecidas à IA são só as da área de quem pergunta; ferramenta fora da área nunca
// roda e a IA não é avisada de que existe; sem nenhuma ferramenta permitida, "sem acesso"; (3) até 4
// rodadas de IA com as ferramentas (todas só leem tabelas locais, com o recorte da área); (4) a resposta
// precisa vir em JSON {resposta, fontes:[{nome, periodo}], sugestao} e cada fonte tem de ser uma
// ferramenta realmente consultada com acesso; senão é descartada: "não consegui responder com fonte";
// (5) tudo fica registrado (pcp_assistente_perguntas). Nenhuma ferramenta grava, e o assistente não
// executa nada. Regras de src/lib/pcp/assistente.ts. IA indisponível: mensagem, nada inventado.
// As ferramentas leem as mesmas tabelas das telas, com o mesmo recorte de área (não chamam as rotas pela
// rede: ficou como leitura direta no servidor, sem conta de serviço e sem ampliar acesso).
routerAdd(
  'POST',
  '/backend/v1/pcp/assistente',
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
      acoes.indexOf('consultar_assistente') === -1
    ) {
      return e.forbiddenError('sem_permissao')
    }
    const areas = perfil.getStringSlice('areas')
    const pergunta = String((e.requestInfo().body || {}).pergunta || '')
      .trim()
      .slice(0, 1000)
    if (pergunta.length < 3)
      return e.json(422, { erro: 'dados_invalidos', motivos: ['escreva a pergunta'] })
    const quem = auth.getString('email') || auth.id
    const registrar = (resultado, ferramentas, fontes, resposta, chamadas) => {
      try {
        const r = new Record($app.findCollectionByNameOrId('pcp_assistente_perguntas'))
        r.set('usuario', quem)
        r.set('pergunta', pergunta)
        r.set('resultado', resultado)
        r.set('ferramentas', JSON.stringify(ferramentas))
        r.set('fontes', JSON.stringify(fontes))
        r.set('resposta', String(resposta || '').slice(0, 4000))
        r.set('chamadas_ia', chamadas)
        $app.save(r)
      } catch (_) {}
    }

    // (1) pedido de ação
    const ACOES = [
      [
        /\b(compre|comprem|comprar|solicite\s+(a\s+)?compra)\b/i,
        'comprar',
        'Compras > Requisições',
      ],
      [/\b(aprove|aprovem|aprovar)\b/i, 'aprovar', 'Compras > Requisições (aprovação por alçada)'],
      [
        /\b(publique|publiquem|publicar)\b/i,
        'publicar',
        'Planejamento (publicação da programação)',
      ],
      [/\b(libere|liberem|liberar)\b/i, 'liberar', 'Preparação de pedidos (liberar para faturar)'],
      [
        /\b(envie|enviem|enviar|mande|mandar)\b.*\bomie\b|\bomie\b.*\b(envie|enviar|grave|gravar)\b/i,
        'enviar ao Omie',
        'Envio ao Omie (autorização do dono)',
      ],
      [
        /\b(grave|gravem|gravar|lance|lancem|lan[cç]ar)\b/i,
        'gravar ou lançar',
        'a tela de origem do dado (Compras, Preparação ou Envio ao Omie)',
      ],
      [
        /\b(reprograme|reprogramar|cancele|cancelar|apague|apagar|exclua|excluir|altere|alterar|mude|mudar)\b/i,
        'alterar',
        'a tela de origem do dado',
      ],
    ]
    for (const a of ACOES) {
      if (a[0].test(pergunta)) {
        const texto =
          'O assistente só consulta e não executa: não consegue ' +
          a[1] +
          '. Faça isso em ' +
          a[2] +
          '.'
        registrar('acao_recusada', [], [], texto, 0)
        return e.json(200, { tipo: 'acao_recusada', texto: texto, acao: a[1], tela: a[2] })
      }
    }

    // (2) ferramentas da área
    const AREAS_FERR = {
      consultar_alertas: ['planejamento', 'compras', 'faturamento'],
      consultar_compras: ['compras'],
      consultar_pedidos: ['faturamento'],
      consultar_producao: ['planejamento', 'apontar_producao'],
    }
    const permitidas = Object.keys(AREAS_FERR).filter((f) =>
      AREAS_FERR[f].some((a) => areas.indexOf(a) !== -1),
    )
    if (permitidas.length === 0) {
      registrar('sem_acesso', [], [], 'sem acesso', 0)
      return e.json(200, { tipo: 'sem_acesso', texto: 'sem acesso' })
    }
    const AREA_ALERTA = {
      estoque: 'planejamento',
      producao: 'planejamento',
      divergencia: 'planejamento',
      compra: 'compras',
      preco: 'compras',
      pedido: 'faturamento',
    }
    const gestao =
      areas.indexOf('planejamento') !== -1 &&
      areas.indexOf('compras') !== -1 &&
      areas.indexOf('faturamento') !== -1

    const executar = (nome) => {
      if (nome === 'consultar_alertas') {
        const cont = {}
        let atual = null
        let total = 0
        for (const r of $app.findRecordsByFilter(
          'pcp_alertas',
          "estado != 'tratado'",
          '-atualizado_em',
          800,
          0,
        )) {
          const t = r.getString('tipo')
          if (!AREA_ALERTA[t] || !(gestao || areas.indexOf(AREA_ALERTA[t]) !== -1)) continue
          const k = t + ' (' + r.getString('gravidade') + ')'
          cont[k] = (cont[k] || 0) + 1
          total++
          if (!atual || r.getString('atualizado_em') > atual) atual = r.getString('atualizado_em')
        }
        return {
          ferramenta: nome,
          acesso: true,
          semDados: total === 0,
          falta: 'nenhum alerta aberto na sua área',
          fonte: 'alertas do sistema',
          periodo: 'situação atual (alertas não tratados)',
          atualizadoEm: atual,
          limites: ['só alertas não tratados da área de quem pergunta'],
          dados: { abertos: total, por_tipo_e_gravidade: cont },
        }
      }
      if (nome === 'consultar_compras') {
        const cont = {}
        let atual = null
        let total = 0
        const ultimas = []
        for (const r of $app.findRecordsByFilter('pcp_requisicoes', '', '-created', 300, 0)) {
          const s = r.getString('estado')
          cont[s] = (cont[s] || 0) + 1
          total++
          if (!atual || r.getString('updated') > atual) atual = r.getString('updated')
          if (ultimas.length < 8)
            ultimas.push({
              id: r.id,
              fornecedor: r.getString('fornecedor'),
              estado: s,
              data_necessaria: r.getString('data_necessaria'),
            })
        }
        return {
          ferramenta: nome,
          acesso: true,
          semDados: total === 0,
          falta: 'nenhuma requisição de compra registrada',
          fonte: 'requisições de compra do sistema',
          periodo: 'situação atual (últimas 300 requisições)',
          atualizadoEm: atual,
          limites: ['não inclui pedidos de compra lidos do Omie (leitura ainda bloqueada)'],
          dados: { total: total, por_estado: cont, ultimas: ultimas },
        }
      }
      if (nome === 'consultar_pedidos') {
        const cont = {}
        let atual = null
        let total = 0
        for (const r of $app.findRecordsByFilter(
          'pcp_preparacao_pedido',
          '',
          '-updated',
          2000,
          0,
        )) {
          const s =
            r.getString('liberacao_hash') !== ''
              ? 'liberado'
              : r.getString('estado_fila') || 'em preparação'
          cont[s] = (cont[s] || 0) + 1
          total++
          if (!atual || r.getString('updated') > atual) atual = r.getString('updated')
        }
        const man = {}
        for (const r of $app.findRecordsByFilter('pcp_pedidos_manuais', '', '-created', 500, 0))
          man[r.getString('estado')] = (man[r.getString('estado')] || 0) + 1
        return {
          ferramenta: nome,
          acesso: true,
          semDados: total === 0 && Object.keys(man).length === 0,
          falta: 'nenhum pedido com preparação registrada',
          fonte: 'preparação de pedidos do faturamento',
          periodo: 'situação atual',
          atualizadoEm: atual,
          limites: ['só pedidos que já tiveram frete, volumes ou liberação registrados'],
          dados: { preparacao_por_estado: cont, manuais_por_estado: man },
        }
      }
      return {
        ferramenta: nome,
        acesso: true,
        semDados: true,
        falta: 'apontamentos e ordens de produção não são guardados no servidor',
        fonte: 'apontamentos de produção',
        periodo: 'indisponível',
        atualizadoEm: null,
        limites: ['fonte de produção não ligada'],
        dados: null,
      }
    }

    const DESC = {
      consultar_alertas:
        'Conta os alertas não tratados da área de quem pergunta, por tipo e gravidade.',
      consultar_compras:
        'Situação das requisições de compra: totais por estado e as mais recentes.',
      consultar_pedidos:
        'Situação da preparação de pedidos para faturar: totais por estado e pedidos manuais.',
      consultar_producao:
        'Produção do período (planejado, produzido, conferido). Pode não haver fonte.',
    }
    const tools = permitidas.map((f) => ({
      type: 'function',
      function: {
        name: f,
        description: DESC[f],
        parameters: { type: 'object', properties: {}, additionalProperties: false },
      },
    }))
    const sistema =
      'Você é o assistente de CONSULTA do PCP da American Goodies. Responda em português, curto e objetivo. ' +
      'Você SÓ LÊ: use as ferramentas para buscar números; nunca invente dado e nunca diga que executou algo (comprar, aprovar, liberar, publicar, enviar ao Omie, gravar). ' +
      'Se uma sugestão for útil, marque sugestao=true e diga que é só uma sugestão. Se as ferramentas não trouxerem dados suficientes, diga que não há dados e o que falta. ' +
      'Nunca chame a diferença de consumo de perda ou desperdício. Quando terminar, responda SOMENTE com um JSON: {"resposta":"...","fontes":[{"nome":"<campo fonte devolvido pela ferramenta>","periodo":"<campo periodo devolvido>"}],"sugestao":false}.'
    const msgs = [
      { role: 'system', content: sistema },
      { role: 'user', content: pergunta },
    ]
    const resultados = []
    let chamadas = 0
    let final = null
    try {
      for (let rodada = 0; rodada < 4; rodada++) {
        chamadas++
        const rep = $ai.chat({ model: 'fast', messages: msgs, tools: tools, tool_choice: 'auto' })
        const m = rep.choices[0].message
        const pedidos = m.tool_calls || []
        if (pedidos.length === 0) {
          final = m.content || ''
          break
        }
        msgs.push({ role: 'assistant', content: m.content || '', tool_calls: pedidos })
        for (const t of pedidos) {
          const nome = t.function && t.function.name
          let saida
          if (permitidas.indexOf(nome) === -1) {
            saida = { erro: 'ferramenta indisponível' }
          } else {
            let r = resultados.find((x) => x.ferramenta === nome)
            if (!r) {
              r = executar(nome)
              resultados.push(r)
            }
            saida = {
              fonte: r.fonte,
              periodo: r.periodo,
              atualizado_em: r.atualizadoEm,
              sem_dados: !!r.semDados,
              falta: r.semDados ? r.falta : undefined,
              limites: r.limites,
              dados: r.dados,
            }
          }
          msgs.push({ role: 'tool', tool_call_id: t.id, content: JSON.stringify(saida) })
        }
      }
    } catch (err) {
      registrar(
        'erro_ia',
        resultados.map((x) => x.ferramenta),
        [],
        String(err && err.message ? err.message : err).slice(0, 300),
        chamadas,
      )
      return e.json(200, {
        tipo: 'erro_ia',
        texto: 'O assistente está indisponível agora; as telas seguem funcionando.',
      })
    }
    const usadas = resultados.map((x) => x.ferramenta)
    if (final === null) {
      registrar('sem_fonte', usadas, [], '', chamadas)
      return e.json(200, { tipo: 'sem_fonte', texto: 'não consegui responder com fonte' })
    }
    if (resultados.length > 0 && resultados.every((x) => x.semDados)) {
      const falta = resultados.map((x) => x.falta)
      registrar('sem_dados', usadas, [], 'Não há dados suficientes', chamadas)
      return e.json(200, {
        tipo: 'sem_dados',
        texto: 'Não há dados suficientes para responder.',
        falta: falta,
        ferramentas: usadas,
      })
    }
    let j = null
    try {
      const mm = /\{[\s\S]*\}/.exec(final)
      j = mm ? JSON.parse(mm[0]) : null
    } catch (_) {}
    const comDados = resultados.filter((x) => x.acesso && !x.semDados)
    const validas =
      j && Array.isArray(j.fontes)
        ? j.fontes.filter(
            (f) => f && f.nome && f.periodo && comDados.some((c) => c.fonte === f.nome),
          )
        : []
    if (!j || typeof j.resposta !== 'string' || j.resposta.trim() === '' || validas.length === 0) {
      registrar('sem_fonte', usadas, [], final, chamadas)
      return e.json(200, { tipo: 'sem_fonte', texto: 'não consegui responder com fonte' })
    }
    const fontes = validas.map((f) => ({
      nome: f.nome,
      periodo: f.periodo,
      atualizadoEm: comDados.find((c) => c.fonte === f.nome).atualizadoEm,
    }))
    const limites = []
    for (const f of validas)
      for (const l of comDados.find((c) => c.fonte === f.nome).limites)
        if (limites.indexOf(l) === -1) limites.push(l)
    const texto = (j.sugestao ? 'Sugestão (nada foi executado): ' : '') + j.resposta.trim()
    registrar('respondida', usadas, fontes, texto, chamadas)
    return e.json(200, {
      tipo: 'respondida',
      texto: texto,
      fontes: fontes,
      limites: limites,
      sugestao: !!j.sugestao,
      ferramentas: usadas,
    })
  },
  $apis.requireAuth(),
)
