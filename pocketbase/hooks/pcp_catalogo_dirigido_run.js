// pocketbase/hooks/pcp_catalogo_dirigido_run.js — TEMPORÁRIO (4e0fcf1c, execução v3)
// Sincronização dirigida da LISTA COMPLETA (1.071 códigos do XLSX oficial do owner).
// A lista vem do REQUEST (máx. 40 por chamada). Pausa de 350ms entre consultas
// (≈2,8 req/s, dentro do limite documentado de 3 req/s) e detecção de 425
// (MISUSE_API_PROCESS — bloqueio por consumo indevido): aborta o restante do lote
// com pendência explícita, sem falso sucesso. Replay idempotente por chave
// omie:produtos:app1:<codigo> em pcp_dados (recurso produtos). NENHUM mutante.
routerAdd('POST', '/backend/v1/pcp/catalogo/dirigido-run', (e) => {
  const esperado = $secrets.get('PCP_DIAG_TOKEN') || ''
  const headers = e.requestInfo().headers || {}
  const authz = String(headers['authorization'] || '')
  const token = authz.replace(/^Bearer\s+/i, '').trim()
  if (!esperado || token !== esperado) return e.unauthorizedError('Token ausente ou invalido.')
  const appKey = $secrets.get('OMIE_APP_KEY')
  const appSecret = $secrets.get('OMIE_APP_SECRET')
  if (!appKey || !appSecret) return e.json(200, { ok: false, erro: 'credencial_ausente' })

  const body = e.requestInfo().body
  const codigos = Array.isArray(body.codigos)
    ? body.codigos.map((c) => String(c).trim().toUpperCase()).filter(Boolean)
    : []
  if (codigos.length === 0) return e.json(200, { ok: false, erro: 'lista_vazia' })
  if (codigos.length > 40) return e.json(200, { ok: false, erro: 'lote_maximo_40' })

  let fonte = null
  try {
    fonte = $app.findFirstRecordByFilter(
      'pcp_fontes',
      "fonte = 'omie' && recurso = 'produtos' && aplicativo_ref = 'app1'",
      {},
    )
  } catch (_) {}
  if (!fonte) return e.json(200, { ok: false, erro: 'fonte_produtos_ausente' })
  const loteAtivoId = fonte.getString('lote_ativo')
  if (!loteAtivoId) return e.json(200, { ok: false, erro: 'lote_ativo_ausente' })
  let lote = null
  try {
    lote = $app.findRecordById('pcp_lotes', loteAtivoId)
  } catch (_) {}
  if (!lote) return e.json(200, { ok: false, erro: 'lote_ativo_ausente' })

  const pausa = (ms) => {
    const fim = Date.now() + ms
    while (Date.now() < fim) {}
  }

  const consultar = (codigo) => {
    try {
      const res = $http.send({
        url: 'https://app.omie.com.br/api/v1/geral/produtos/',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          call: 'ConsultarProduto',
          app_key: appKey,
          app_secret: appSecret,
          param: [{ codigo: codigo }],
        }),
        timeout: 15,
      })
      if (res.statusCode === 425) return { bloqueado: true }
      if (res.statusCode < 200 || res.statusCode >= 300) return null
      const j = res.json
      if (!j || !j.descricao) return null
      return j
    } catch (_) {
      return null
    }
  }

  const encontrados = []
  const pendencias = []
  let bloqueado = false
  for (const codigo of codigos) {
    pausa(350)
    const j = consultar(codigo)
    if (j && j.bloqueado) {
      bloqueado = true
      pendencias.push(codigo + ' (API bloqueada — retry após a janela)')
      continue
    }
    if (!j) {
      pendencias.push(codigo)
      continue
    }
    const unidade =
      j.unidade === null || j.unidade === undefined || j.unidade === '' ? null : String(j.unidade)
    const inativo = j.inativo === true || j.inativo === 'S' || j.inativo === 'true'
    const linha = {
      codigo: codigo,
      descricao: String(j.descricao || ''),
      unidade: unidade,
      ativo: !inativo,
      origem: 'consulta_dirigida',
    }
    const chave = 'omie:produtos:app1:' + codigo
    let rec = null
    try {
      rec = $app.findFirstRecordByFilter('pcp_dados', 'chave_origem = {:k} && lote = {:l}', {
        k: chave,
        l: loteAtivoId,
      })
    } catch (_) {}
    const conteudo = JSON.stringify(linha)
    if (rec) {
      if (rec.getString('conteudo') !== conteudo) {
        rec.set('conteudo', conteudo)
        $app.save(rec)
      }
    } else {
      const col = $app.findCollectionByNameOrId('pcp_dados')
      const novo = new Record(col)
      novo.set('lote', loteAtivoId)
      novo.set('chave_origem', chave)
      novo.set('conteudo', conteudo)
      $app.save(novo)
    }
    encontrados.push(linha)
  }

  return e.json(200, {
    ok: true,
    bloqueado: bloqueado,
    lote: loteAtivoId,
    alvo: codigos.length,
    encontrados: encontrados.length,
    pendencias_count: pendencias.length,
    pendencias: pendencias,
    amostra: encontrados.slice(0, 3),
  })
})
