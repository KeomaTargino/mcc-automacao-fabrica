// pocketbase/hooks/pcp_exportacao.js — SPEC-3-016 CA-3-43 (RN-01, RN-02)
// GET /backend/v1/pcp/exportacao[?colecao=<nome>] — exportação dos dados COMPLEMENTARES do sistema.
// Sem "colecao": devolve só o RESUMO (coleção, quantidade de registros, se está no pacote, observação,
// data e versão do sistema), com identificação "Dados da American Goodies". Com "colecao": devolve o CSV
// daquela coleção (uma por chamada, para o navegador montar o pacote). Exige exportar_dados (403 sem
// pistas). Nada de segredo, senha ou chave: colunas sensíveis saem do CSV, e uma varredura procura os
// valores dos segredos do projeto e padrões de credencial; achou, a coleção sai do pacote e o resumo a
// marca (sem repetir o valor). Coleção vazia aparece com zero. As cópias das leituras do Omie e da
// Nuvemshop (pcp_dados, pcp_lotes, pcp_fontes, pcp_execucoes) entram só como contagem: relê-se a fonte.
// Só leitura; o arquivo nunca vai para o Git. Regras de src/lib/pcp/exportacao.ts.
routerAdd(
  'GET',
  '/backend/v1/pcp/exportacao',
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
      acoes.indexOf('exportar_dados') === -1
    ) {
      return e.forbiddenError('sem_permissao')
    }
    const COMPLEMENTARES = [
      'pcp_perfis',
      'pcp_parametros',
      'pcp_chaves_escrita',
      'pcp_transacoes_omie',
      'pcp_fornecedores_complemento',
      'pcp_conversoes',
      'pcp_excecoes_compra',
      'pcp_precos_compra',
      'pcp_requisicoes',
      'pcp_requisicao_origens',
      'pcp_cotacoes',
      'pcp_aprovacoes_compra',
      'pcp_alcadas',
      'pcp_entregas_compra',
      'pcp_pedidos_compra_vinculo',
      'pcp_recebimentos',
      'pcp_parcelas_compra',
      'pcp_notas_demo',
      'pcp_unidades',
      'pcp_nomes_canal',
      'pcp_tabelas_preco',
      'pcp_preparacao_pedido',
      'pcp_volumes',
      'pcp_pedidos_manuais',
      'pcp_liberacoes_faturamento',
      'pcp_gravacoes_venda',
      'pcp_parametros_alerta',
      'pcp_familias',
      'pcp_alertas',
      'pcp_alertas_lacunas',
      'pcp_alertas_historico',
      'pcp_alertas_regras',
      'pcp_historico_vendas_periodo',
      'pcp_historico_vendas_cobertura',
      'pcp_regra_sazonalidade',
      'pcp_loop_config',
      'pcp_loop_medicoes',
      'pcp_assistente_perguntas',
    ]
    const LEITURAS = ['pcp_dados', 'pcp_lotes', 'pcp_fontes', 'pcp_execucoes']
    const LIMITE = 20000
    const SENSIVEL =
      /(^|_)(password|passwordhash|senha|secret|segredo|token|tokenkey|apikey|api_key|app_key|app_secret|chave_api)($|_)/i
    const PADROES = [
      /\bapp_(key|secret)\b/i,
      /\bapi[_-]?key\b/i,
      /\bpassword\b/i,
      /\bbearer\s+[a-z0-9._-]{16,}/i,
      /\b[a-z0-9_-]{20,}\.[a-z0-9_-]{20,}\.[a-z0-9_-]{20,}\b/i,
    ]
    const segredos = []
    for (const n of [
      'OMIE_APP_KEY',
      'OMIE_APP_SECRET',
      'NUVEMSHOP_ACCESS_TOKEN',
      'NUVEMSHOP_TOKEN',
      'NUVEMSHOP_API_KEY',
      'NUVEMSHOP_USER_ID',
      'NUVEMSHOP_STORE_ID',
      'OMIE_TOKEN',
    ]) {
      try {
        const v = $secrets.get(n)
        if (v && String(v).length >= 6) segredos.push(String(v))
      } catch (_) {}
    }
    const varrer = (texto) => {
      for (const v of segredos) if (texto.indexOf(v) !== -1) return 'valor de segredo conhecido'
      for (const re of PADROES) if (re.test(texto)) return 'padrão de credencial'
      return null
    }
    const cel = (v) => {
      let s =
        v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
      if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = "'" + s
      return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
    }
    const contar = (nome) => {
      try {
        return Number($app.countRecords(nome))
      } catch (_) {
        return null
      }
    }
    const lerCsv = (nome) => {
      const col = $app.findCollectionByNameOrId(nome)
      const campos = col.fields.map((f) => f.name).filter((n) => !SENSIVEL.test(n))
      const linhas = []
      let pagina = 0
      for (;;) {
        const lote = $app.findRecordsByFilter(nome, '', 'created', 2000, pagina * 2000)
        for (const r of lote) linhas.push(campos.map((c) => cel(r.get(c))).join(';'))
        if (lote.length < 2000 || linhas.length >= LIMITE + 1) break
        pagina++
      }
      return {
        campos: campos,
        linhas: linhas,
        texto: [campos.join(';')].concat(linhas).join('\r\n'),
      }
    }

    const pedida = String(e.request.url.query().get('colecao') || '')
    if (pedida) {
      if (COMPLEMENTARES.indexOf(pedida) === -1)
        return e.json(422, { erro: 'dados_invalidos', motivos: ['coleção fora do pacote'] })
      try {
        const c = lerCsv(pedida)
        if (c.linhas.length > LIMITE)
          return e.json(200, {
            colecao: pedida,
            exportada: false,
            registros: contar(pedida),
            motivo: 'mais de ' + LIMITE + ' registros: exportar em partes (ainda não construído)',
          })
        const achado = varrer(c.texto)
        if (achado)
          return e.json(200, {
            colecao: pedida,
            exportada: false,
            registros: c.linhas.length,
            motivo: 'retirada do pacote: ' + achado,
          })
        return e.json(200, {
          colecao: pedida,
          exportada: true,
          registros: c.linhas.length,
          csv: c.texto,
        })
      } catch (err) {
        return e.json(200, {
          colecao: pedida,
          exportada: false,
          registros: null,
          motivo: 'falha na leitura',
        })
      }
    }

    const linhas = []
    for (const nome of COMPLEMENTARES) {
      const n = contar(nome)
      if (n === null)
        linhas.push({
          colecao: nome,
          registros: 0,
          exportada: false,
          motivo: 'coleção não encontrada ou ilegível',
        })
      else if (n > LIMITE)
        linhas.push({
          colecao: nome,
          registros: n,
          exportada: false,
          motivo: 'mais de ' + LIMITE + ' registros: exportar em partes (ainda não construído)',
        })
      else linhas.push({ colecao: nome, registros: n, exportada: true, motivo: null })
    }
    for (const nome of LEITURAS)
      linhas.push({
        colecao: nome,
        registros: contar(nome) || 0,
        exportada: false,
        motivo:
          'cópia das leituras do Omie/Nuvemshop: recuperável relendo a fonte; só a contagem entra',
      })
    return e.json(200, {
      identificacao: 'Dados da American Goodies (propriedade do cliente)',
      gerado_em: new Date().toISOString(),
      versao_sistema: 'ver rodapé da tela',
      completo: linhas
        .filter((l) => COMPLEMENTARES.indexOf(l.colecao) !== -1)
        .every((l) => l.exportada),
      linhas: linhas,
    })
  },
  $apis.requireAuth(),
)
