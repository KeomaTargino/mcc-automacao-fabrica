// pocketbase/hooks/pcp_catalogo_dirigido.js — 4e0fcf1c (21/10/2026)
// Sincronização do catálogo por CONSULTA DIRIGIDA: a listagem geral/produtos do Omie
// retorna 0 (provado), mas ConsultarProduto responde por código (M011001/M043024
// provados). Recebe um lote de códigos (máx. 40), consulta o Omie um a um, normaliza
// com catalogo-dirigido (unidade null preservada; não encontrado = pendência explícita)
// e grava/atualiza em pcp_dados sob o recurso 'produtos' com chave
// omie:produtos:app1:<codigo>. Replay idempotente por código. Acesso: perfil técnico
// (pode_atualizar_fontes). NENHUM mutante do Omie (só leitura).
routerAdd(
  'POST',
  '/backend/v1/pcp/catalogo/dirigido',
  (e) => {
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Sessão ausente ou expirada.')
    let perfil = null
    try {
      perfil = $app.findFirstRecordByFilter('pcp_perfis', 'usuario = {:u}', { u: auth.id })
    } catch (_) {}
    if (!perfil || !perfil.getBool('ativo') || !perfil.getBool('pode_atualizar_fontes')) {
      return e.forbiddenError('sem_permissao_tecnica')
    }
    const body = e.requestInfo().body
    const codigos = Array.isArray(body.codigos)
      ? body.codigos.map((c) => String(c).trim().toUpperCase()).filter(Boolean)
      : []
    if (codigos.length === 0) return e.badRequestError('lista de códigos vazia')
    if (codigos.length > 40) return e.badRequestError('lote máximo: 40 códigos por chamada')

    const appKey = $secrets.get('OMIE_APP_KEY')
    const appSecret = $secrets.get('OMIE_APP_SECRET')
    if (!appKey || !appSecret) return e.badRequestError('credencial_ausente')

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
        if (res.statusCode < 200 || res.statusCode >= 300) return null
        const j = res.json
        if (!j || !j.descricao) return null
        return j
      } catch (_) {
        return null
      }
    }

    let fonte = null
    try {
      fonte = $app.findFirstRecordByFilter(
        'pcp_fontes',
        "fonte = 'omie' && recurso = 'produtos' && aplicativo_ref = 'app1'",
        {},
      )
    } catch (_) {}
    if (!fonte) return e.badRequestError('fonte_produtos_ausente')
    const loteAtivoId = fonte.getString('lote_ativo')
    if (!loteAtivoId) return e.badRequestError('lote_ativo_ausente')
    let lote = null
    try {
      lote = $app.findRecordById('pcp_lotes', loteAtivoId)
    } catch (_) {}
    if (!lote) return e.badRequestError('lote_ativo_ausente')

    const resultados = []
    for (const codigo of codigos) {
      const j = consultar(codigo)
      if (!j) {
        resultados.push({
          codigo: codigo,
          estado: 'nao_encontrado',
          pendencia: 'produto não encontrado no Omie por código ' + codigo,
        })
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
      resultados.push({ codigo: codigo, estado: 'ok', linha: linha })
    }

    const ok = resultados.filter((r) => r.estado === 'ok').length
    const pend = resultados.filter((r) => r.estado !== 'ok')
    return e.json(200, {
      ok: true,
      lote: loteAtivoId,
      consultados: codigos.length,
      encontrados: ok,
      pendencias: pend.map((p) => p.pendencia),
      resultados: resultados,
    })
  },
  $apis.requireAuth(),
)
