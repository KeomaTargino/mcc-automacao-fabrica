// pocketbase/hooks/pcp_parametros_aprovar.js — SPEC-2-002 CA-P1/P2 (task d2a44349)
// POST /backend/v1/pcp/parametros/aprovar — aprova parâmetros oficiais (CL-006).
// Regras (autoridade no servidor, nunca no navegador):
// - Gate: exige ação editar_parametros no perfil ativo → 403 sem pistas.
// - Revalida os parâmetros com as mesmas regras do contrato (P2: faltante bloqueia).
// - Replay idêntico (mesmo hash) → idempotente, devolve a aprovação vigente.
// - Payload divergente do vigente → 409 sem sobrescrever.
// - Aprovador/hora/versão fixados pelo SERVIDOR em transação curta.
routerAdd(
  'POST',
  '/backend/v1/pcp/parametros/aprovar',
  (e) => {
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Sessão ausente ou expirada.')
    let perfil = null
    try {
      perfil = $app.findFirstRecordByFilter('pcp_perfis', 'usuario = {:u}', { u: auth.id })
    } catch (_) {}
    if (!perfil || !perfil.getBool('ativo')) {
      return e.forbiddenError('403: perfil ausente ou inativo.')
    }
    let acoes = []
    try {
      acoes = JSON.parse(perfil.getString('acoes') || '[]') || []
    } catch (_) {
      acoes = []
    }
    if (!Array.isArray(acoes) || acoes.indexOf('editar_parametros') === -1) {
      return e.forbiddenError(
        '403: sua conta não tem a ação de autorização para editar parâmetros (P2). Peça ao gestor a ação editar_parametros.',
      )
    }
    const body = e.requestInfo().body || {}
    const p = body.parametros
    if (!p || typeof p !== 'object' || Array.isArray(p)) {
      return e.badRequestError('400: payload de parâmetros ausente ou inválido.')
    }
    // Concorrência: mutação dependente usa versão esperada (SPEC: prova concorrente).
    const temVersaoEsperada = body.versao_esperada !== null && body.versao_esperada !== undefined
    // Revalidação no servidor (mesmas regras do contrato; faltante bloqueia, nunca default)
    const bloqueios = []
    if (
      p.capacidade_padrao === null ||
      p.capacidade_padrao === undefined ||
      !(p.capacidade_padrao > 0)
    ) {
      bloqueios.push('capacidade_padrao faltante/inválida (P2)')
    }
    if (p.lote_multiplo === null || p.lote_multiplo === undefined || !(p.lote_multiplo > 0)) {
      bloqueios.push('lote_multiplo faltante/inválido (P2)')
    }
    if (p.horizonte_dias === null || p.horizonte_dias === undefined || !(p.horizonte_dias > 0)) {
      bloqueios.push('horizonte_dias faltante/inválido (P2)')
    }
    if (!Array.isArray(p.recursos) || p.recursos.length === 0) {
      bloqueios.push('recursos faltantes (P2)')
    } else {
      for (const r of p.recursos) {
        if (!r || !r.nome || !r.unidade) bloqueios.push('recurso sem nome/unidade (P2)')
        else if (!(r.capacidade_fracao > 0))
          bloqueios.push('fração de capacidade inválida em ' + r.nome + ' (P2)')
      }
    }
    if (bloqueios.length > 0) {
      return e.badRequestError('400: parâmetros não aprováveis — ' + bloqueios.join(' | '))
    }
    // Hash determinístico (mesma função do contrato; JSON canônico ordenado)
    const canon = JSON.stringify(p, (k, v) =>
      v !== null && typeof v === 'object' && !Array.isArray(v)
        ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
        : v,
    )
    let h1 = 0x811c9dc5
    let h2 = 0x01000193
    for (let i = 0; i < canon.length; i++) {
      const c = canon.charCodeAt(i)
      h1 = ((h1 ^ c) * 0x01000193) >>> 0
      h2 = ((h2 + c * 31) * 0x85ebca6b) >>> 0
    }
    const hash = (h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')).repeat(2)

    let resultado = null
    $app.runInTransaction((tx) => {
      let atual = null
      try {
        const lista = tx.findRecordsByFilter('pcp_parametros', '', 'versao DESC', 1, 0)
        if (lista.length > 0) atual = lista[0]
      } catch (_) {}
      if (atual && atual.getString('hash_parametros') === hash) {
        // Replay idêntico: idempotente, nada novo
        resultado = {
          estado: 'replay',
          aprovacao: {
            versao: Number(atual.get('versao') || 0),
            aprovador: atual.getString('aprovador'),
            aprovado_em: atual.getString('aprovado_em'),
            hash_parametros: atual.getString('hash_parametros'),
          },
        }
        return
      }
      const versaoAtual = atual ? Number(atual.get('versao') || 0) : 0
      if (temVersaoEsperada && Number(body.versao_esperada) !== versaoAtual) {
        resultado = {
          estado: 'conflito_versao',
          versao_esperada: Number(body.versao_esperada),
          versao_atual: versaoAtual,
        }
        return
      }
      const versao = versaoAtual + 1
      const col = tx.findCollectionByNameOrId('pcp_parametros')
      const rec = new Record(col)
      rec.set('versao', versao)
      rec.set('aprovador', perfil.getString('usuario'))
      rec.set('aprovado_em', new Date().toISOString())
      rec.set('hash_parametros', hash)
      rec.set('parametros', JSON.stringify(p))
      tx.save(rec)
      resultado = {
        estado: 'aprovado',
        aprovacao: {
          versao: versao,
          aprovador: perfil.getString('usuario'),
          aprovado_em: rec.getString('aprovado_em'),
          hash_parametros: hash,
        },
      }
    })
    if (resultado && resultado.estado === 'conflito_versao') {
      return e.json(409, resultado)
    }
    return e.json(200, resultado)
  },
  $apis.requireAuth(),
)
