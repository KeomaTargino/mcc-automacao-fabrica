// pocketbase/hooks/pcp_alertas_parametros_aprovar.js — SPEC-3-010 CA-3-30
// POST /backend/v1/pcp/alertas/parametros/aprovar { itens:[{escopo,chave,estoqueMinimo,...}], gravidade:{...}, versao_esperada }
// Aprova uma VERSÃO NOVA dos parâmetros de alerta (as anteriores ficam). Exige editar_parametros
// (403 sem pistas). Escopo "produto" ou "familia"; a chave "*" (família) guarda os parâmetros gerais,
// como o tempo máximo de pedido parado. Valor negativo ou repetido é recusado; campo vazio fica vazio
// (lacuna), nunca vira zero nem padrão. Mesmo conteúdo = replay idempotente. Versão esperada: 409.
// Aprovador e hora vêm do servidor. Regras de src/lib/pcp/alertas.ts.
routerAdd(
  'POST',
  '/backend/v1/pcp/alertas/parametros/aprovar',
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
    const CAMPOS = [
      'estoqueMinimo',
      'prazoFornecedorDias',
      'toleranciaPrecoPct',
      'atrasoAceitoDias',
      'tempoMaxParadoHoras',
      'compraSemPedidoDias',
    ]
    const erros = []
    const vistos = {}
    const itens = []
    for (const i of Array.isArray(b.itens) ? b.itens : []) {
      const escopo = String((i && i.escopo) || '')
      const chave = String((i && i.chave) || '').trim()
      if (escopo !== 'produto' && escopo !== 'familia') erros.push('escopo inválido em ' + chave)
      if (!chave) erros.push('produto ou família obrigatório')
      const k = escopo + ':' + chave.toUpperCase()
      if (vistos[k]) erros.push('parâmetro repetido: ' + chave)
      vistos[k] = true
      const novo = { escopo: escopo, chave: chave }
      for (const c of CAMPOS) {
        const v = i[c]
        if (v === undefined || v === null || v === '') continue
        const n = Number(v)
        if (!isFinite(n) || n < 0)
          erros.push(c + ' de ' + chave + ' precisa ser um número maior ou igual a zero')
        else novo[c] = n
      }
      itens.push(novo)
    }
    const gravidade = {}
    const g = b.gravidade || {}
    for (const t of ['producao', 'compra', 'preco', 'pedido', 'divergencia']) {
      if (g[t] === 'critico' || g[t] === 'atencao') gravidade[t] = g[t]
      else if (g[t] !== undefined && g[t] !== null && g[t] !== '')
        erros.push('gravidade de ' + t + ' deve ser crítico ou atenção')
    }
    if (erros.length > 0) return e.json(422, { erro: 'dados_invalidos', motivos: erros })
    const doc = { itens: itens, gravidade: gravidade }
    const canon = JSON.stringify(doc)
    let resultado = null
    try {
      $app.runInTransaction((tx) => {
        const l = tx.findRecordsByFilter('pcp_parametros_alerta', '', '-versao', 1, 0)
        const atual = l.length > 0 ? l[0] : null
        const versaoAtual = atual ? Number(atual.get('versao') || 0) : 0
        if (atual && atual.getString('hash_parametros') === canon) {
          resultado = { http: 200, corpo: { estado: 'replay', versao: versaoAtual } }
          return
        }
        if (
          b.versao_esperada !== null &&
          b.versao_esperada !== undefined &&
          Number(b.versao_esperada) !== versaoAtual
        ) {
          resultado = {
            http: 409,
            corpo: { erro: 'conflito_de_versao', versao_atual: versaoAtual },
          }
          return
        }
        const r = new Record(tx.findCollectionByNameOrId('pcp_parametros_alerta'))
        r.set('versao', versaoAtual + 1)
        r.set('aprovador', auth.getString('email') || auth.id)
        r.set('aprovado_em', new Date().toISOString())
        r.set('hash_parametros', canon)
        r.set('parametros', JSON.stringify(doc))
        tx.save(r)
        resultado = { http: 200, corpo: { estado: 'aprovado', versao: versaoAtual + 1 } }
      })
    } catch (_) {
      return e.json(409, {
        erro: 'conflito_de_versao',
        motivo: 'outra aprovação chegou ao mesmo tempo; recarregue',
      })
    }
    return e.json(resultado.http, resultado.corpo)
  },
  $apis.requireAuth(),
)
