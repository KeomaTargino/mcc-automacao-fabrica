// pocketbase/hooks/pcp_catalogo_dirigido_run.js — TEMPORÁRIO (4e0fcf1c, execução)
// Executa a sincronização dirigida dos 91 códigos server-side (token efêmero), em
// 3 lotes com pausa, gravando em pcp_dados (recurso produtos, replay idempotente).
// NENHUM mutante do Omie. Removida após a execução provada.
routerAdd('GET', '/backend/v1/pcp/catalogo/dirigido-run', (e) => {
  const esperado = $secrets.get('PCP_DIAG_TOKEN') || ''
  const headers = e.requestInfo().headers || {}
  const authz = String(headers['authorization'] || '')
  const token = authz.replace(/^Bearer\s+/i, '').trim()
  if (!esperado || token !== esperado) return e.unauthorizedError('Token ausente ou invalido.')
  const appKey = $secrets.get('OMIE_APP_KEY')
  const appSecret = $secrets.get('OMIE_APP_SECRET')
  if (!appKey || !appSecret) return e.json(200, { ok: false, erro: 'credencial_ausente' })

  const CODIGOS = [
    'M043024',
    'M043023',
    'M092003',
    'M023005',
    'M02300500',
    'M023008',
    'M02300800',
    'M011021',
    'M011026',
    'M092001',
    'M021009',
    'M023006',
    'M02300600',
    'M043077',
    'M021001',
    'M043090',
    'M043099',
    'M011002',
    'M021008',
    'M021002',
    'M011001',
    'M011003',
    'M011005',
    'M021007',
    'M011008',
    'M011010',
    'M021003',
    'M011015',
    'M011018',
    'M011019',
    'M092006',
    'M021004',
    'M043035',
    'M043096',
    'M043100',
    'H022402',
    'M043097',
    'M023003',
    'M02300300',
    'M043057',
    'M023004',
    'M043049',
    'M043050',
    'M043052',
    'M043053',
    'M031001',
    'M023009',
    'M02300900',
    'M043034',
    'M023007',
    'M043094',
    'A073087',
    'M011009',
    'M043063',
    'M021005',
    'M011017',
    'M092009',
    'M043033',
    'A051010',
    'A051024',
    'A051026',
    'M092010',
    'M043093',
    'M043103',
    'A051025',
    'M092008',
    'M092007',
    'M043006',
    'M023001',
    'M02300100',
    'M023002',
    'M02300200',
    'M031004',
    'M043017',
    'A051008',
    'A051015',
    'M043101',
    'M043016',
    'M043015',
    'M043091',
    'M031005',
    'M043008',
    'M043067',
    'M084213',
    'M084214',
    'M084215',
    'M084216',
    'M084217',
    'M084219',
    'M084220',
    'M084221',
  ]

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

  const encontrados = []
  const pendencias = []
  for (const codigo of CODIGOS) {
    const j = consultar(codigo)
    if (!j) {
      pendencias.push('produto não encontrado no Omie por código ' + codigo)
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
    lote: loteAtivoId,
    alvo: CODIGOS.length,
    encontrados: encontrados.length,
    pendencias_count: pendencias.length,
    pendencias: pendencias,
    amostra: encontrados.slice(0, 5),
  })
})
