// pocketbase/hooks/pcp_programacao_publicar.js — patch de 02/11/2026
// POST /backend/v1/pcp/producao/programacao/publicar { versao_esperada, linhas: [{produto, quantidade, data, recurso}] }
// Guarda a programação no servidor, uma versão por publicação. Exige a ação publicar_programacao
// (403 sem pistas). Versão esperada diferente da atual = 409 e nada é sobrescrito. Gera uma ordem por
// linha (OP-<versão>-<seq>). Regras de src/lib/pcp/producao-servidor.ts. Não chama o Omie.
routerAdd(
  'POST',
  '/backend/v1/pcp/producao/programacao/publicar',
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
      acoes.indexOf('publicar_programacao') === -1 ||
      perfil.getStringSlice('areas').indexOf('planejamento') === -1
    ) {
      return e.forbiddenError('sem_permissao')
    }
    const b = e.requestInfo().body || {}
    const linhas = Array.isArray(b.linhas) ? b.linhas : []
    const motivos = []
    if (linhas.length === 0) motivos.push('programação vazia')
    linhas.forEach((l, i) => {
      const n = i + 1
      if (!String((l && l.produto) || '').trim())
        motivos.push('linha ' + n + ': produto obrigatório')
      const q = Number(l && l.quantidade)
      if (!isFinite(q) || q <= 0)
        motivos.push('linha ' + n + ': quantidade precisa ser maior que zero')
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String((l && l.data) || '')))
        motivos.push('linha ' + n + ': data inválida')
      if (!String((l && l.recurso) || '').trim())
        motivos.push('linha ' + n + ': recurso obrigatório')
    })
    if (motivos.length > 0) return e.json(422, { erro: 'dados_invalidos', motivos: motivos })

    let resultado = null
    $app.runInTransaction((tx) => {
      const todas = tx.findRecordsByFilter('pcp_programacoes', '', '-versao', 1, 0)
      const atual = todas.length > 0 ? Number(todas[0].get('versao')) : 0
      if (Number(b.versao_esperada) !== atual) {
        resultado = { http: 409, corpo: { erro: 'conflito_de_versao', versao_atual: atual } }
        return
      }
      const versao = atual + 1
      const ops = linhas.map((l, i) => ({
        op_id: 'OP-' + versao + '-' + String(i + 1).padStart(3, '0'),
        versao_op: versao,
        produto: String(l.produto).trim().toUpperCase(),
        quantidade: Number(l.quantidade),
        data: String(l.data),
        recurso: String(l.recurso).trim(),
      }))
      const r = new Record(tx.findCollectionByNameOrId('pcp_programacoes'))
      r.set('versao', versao)
      r.set(
        'linhas',
        JSON.stringify(
          linhas.map((l) => ({
            produto: String(l.produto).trim().toUpperCase(),
            quantidade: Number(l.quantidade),
            data: String(l.data),
            recurso: String(l.recurso).trim(),
          })),
        ),
      )
      r.set('ops', JSON.stringify(ops))
      r.set('publicada_por', auth.getString('email') || auth.id)
      r.set('publicada_em', new Date().toISOString())
      tx.save(r)
      resultado = { http: 200, corpo: { ok: true, versao: versao, ops: ops } }
    })
    return e.json(resultado.http, resultado.corpo)
  },
  $apis.requireAuth(),
)
