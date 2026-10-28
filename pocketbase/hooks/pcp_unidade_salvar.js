// pocketbase/hooks/pcp_unidade_salvar.js — SPEC-3-008 CA-3-24
// POST /backend/v1/pcp/faturamento/unidade { cliente_omie, unidade, nome_fantasia_operacional, tipo, ativo, versao_esperada }
// Grava UMA VERSÃO NOVA da unidade operacional de um cliente do Omie (as anteriores ficam). Exige
// editar_unidade E a área faturamento. Versão esperada (0 no primeiro cadastro); 409 se outra alteração
// chegou antes. Autor e hora vêm do servidor. Não altera o cliente no Omie. Regras de src/lib/pcp/unidades.ts.
routerAdd(
  'POST',
  '/backend/v1/pcp/faturamento/unidade',
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
      acoes.indexOf('editar_unidade') === -1 ||
      perfil.getStringSlice('areas').indexOf('faturamento') === -1
    ) {
      return e.forbiddenError('sem_permissao')
    }
    const b = e.requestInfo().body || {}
    const cliente = String(b.cliente_omie || '').trim()
    const unidade = String(b.unidade || '').trim()
    const nome = String(b.nome_fantasia_operacional || '').trim()
    const tipo = String(b.tipo || '')
    const motivos = []
    if (!cliente) motivos.push('cliente do Omie obrigatório')
    if (!unidade) motivos.push('unidade obrigatória')
    if (!nome) motivos.push('nome fantasia operacional obrigatório')
    if (['franquia', 'loja_propria', 'cliente_b2b'].indexOf(tipo) === -1)
      motivos.push('tipo deve ser franquia, loja própria ou cliente B2B')
    if (motivos.length > 0) return e.json(422, { erro: 'dados_invalidos', motivos: motivos })
    let resposta = null
    try {
      $app.runInTransaction((tx) => {
        const ant = tx.findRecordsByFilter('pcp_unidades', 'cliente_omie = {:c}', '-versao', 1, 0, {
          c: cliente,
        })
        const atual = ant.length > 0 ? Number(ant[0].get('versao') || 0) : 0
        if (atual !== Number(b.versao_esperada || 0)) {
          resposta = {
            http: 409,
            corpo: {
              erro: 'conflito_de_versao',
              motivo: 'outra alteração chegou antes; recarregue',
            },
          }
          return
        }
        const r = new Record(tx.findCollectionByNameOrId('pcp_unidades'))
        r.set('cliente_omie', cliente)
        r.set('unidade', unidade)
        r.set('nome_fantasia_operacional', nome)
        r.set('tipo', tipo)
        r.set('ativo', b.ativo !== false)
        r.set('versao', atual + 1)
        r.set('alterado_por', auth.getString('email') || auth.id)
        r.set('alterado_em', new Date().toISOString())
        tx.save(r)
        resposta = { http: 200, corpo: { ok: true, cliente_omie: cliente, versao: atual + 1 } }
      })
    } catch (_) {
      return e.json(409, {
        erro: 'conflito_de_versao',
        motivo: 'outra alteração chegou ao mesmo tempo; recarregue',
      })
    }
    return e.json(resposta.http, resposta.corpo)
  },
  $apis.requireAuth(),
)
