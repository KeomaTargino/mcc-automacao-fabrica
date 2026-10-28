// pocketbase/hooks/pcp_fornecedor_salvar.js — SPEC-3-003 CA-3-09 (RN-05)
// POST /backend/v1/pcp/compras/fornecedor — grava UMA VERSÃO NOVA do complemento do fornecedor:
// contatos (nome, função, telefone, e-mail, cada dado no seu campo), prazo de entrega em dias e
// observação. Exige a ação editar_fornecedor E a área compras (403 sem pistas). Autor e hora vêm do
// servidor. A versão anterior não é alterada. Não toca no cadastro do Omie. Regras de
// src/lib/pcp/fornecedor-complemento.ts.
routerAdd(
  'POST',
  '/backend/v1/pcp/compras/fornecedor',
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
      acoes.indexOf('editar_fornecedor') === -1 ||
      perfil.getStringSlice('areas').indexOf('compras') === -1
    ) {
      return e.forbiddenError('sem_permissao')
    }
    const body = e.requestInfo().body || {}
    const fornecedor = String(body.fornecedor || '').trim()
    const contatos = Array.isArray(body.contatos) ? body.contatos : []
    const prazo =
      body.prazo_entrega_dias === null ||
      body.prazo_entrega_dias === undefined ||
      body.prazo_entrega_dias === ''
        ? null
        : Number(body.prazo_entrega_dias)
    const observacao = String(body.observacao || '')
      .trim()
      .slice(0, 500)

    const motivos = []
    if (!fornecedor) motivos.push('fornecedor obrigatório')
    const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    const RE_TEL = /^[0-9+()\-.\s]{8,20}$/
    const limpos = []
    contatos.forEach((c, i) => {
      const n = i + 1
      const nome = String((c && c.nome) || '').trim()
      const funcao = String((c && c.funcao) || '').trim()
      const telefone = String((c && c.telefone) || '').trim()
      const email = String((c && c.email) || '').trim()
      if (!nome) motivos.push('contato ' + n + ': nome obrigatório')
      if (nome.indexOf('@') !== -1 || nome.replace(/\D/g, '').length >= 8) {
        motivos.push(
          'contato ' + n + ': coloque e-mail e telefone nos campos próprios, não no nome',
        )
      }
      if (email && !RE_EMAIL.test(email)) motivos.push('contato ' + n + ': e-mail inválido')
      if (telefone && !RE_TEL.test(telefone)) motivos.push('contato ' + n + ': telefone inválido')
      limpos.push({ nome: nome, funcao: funcao, telefone: telefone, email: email })
    })
    if (prazo !== null && (!Number.isInteger(prazo) || prazo < 0 || prazo > 365)) {
      motivos.push('prazo de entrega precisa ser um número inteiro de dias, de 0 a 365')
    }
    if (motivos.length > 0) return e.json(422, { erro: 'dados_invalidos', motivos: motivos })

    let resposta = null
    try {
      $app.runInTransaction((tx) => {
        let versao = 1
        const anteriores = tx.findRecordsByFilter(
          'pcp_fornecedores_complemento',
          'fornecedor = {:f}',
          '-versao',
          1,
          0,
          { f: fornecedor },
        )
        if (anteriores.length > 0) versao = Number(anteriores[0].get('versao') || 0) + 1
        const col = tx.findCollectionByNameOrId('pcp_fornecedores_complemento')
        const r = new Record(col)
        r.set('fornecedor', fornecedor)
        r.set('versao', versao)
        r.set('contatos', JSON.stringify(limpos))
        r.set('prazo_entrega_dias', prazo)
        r.set('observacao', observacao)
        r.set('alterado_por', auth.getString('email') || auth.id)
        r.set('alterado_em', new Date().toISOString())
        tx.save(r)
        resposta = { http: 200, corpo: { ok: true, fornecedor: fornecedor, versao: versao } }
      })
    } catch (_) {
      return e.json(409, {
        erro: 'conflito_de_versao',
        motivo: 'outra alteração chegou ao mesmo tempo; recarregue e tente de novo',
      })
    }
    return e.json(resposta.http, resposta.corpo)
  },
  $apis.requireAuth(),
)
