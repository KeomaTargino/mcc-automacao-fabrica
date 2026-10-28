// pocketbase/hooks/pcp_op_fila.js — SPEC-3-002 CA-3-07
// GET /backend/v1/pcp/omie/op/fila — o que a tela de envio mostra: as transações recentes com o
// resumo para o dono conferir (ordem, quantidade, data, efeito esperado no estoque), o estado da
// chave e o que a conta pode fazer (autorizar, enviar, conferir). Só leitura. Aceita quem tem
// executar_sync_omie ou autorizar_escrita_omie. Produto e local aparecem como "não informado" até
// a preparação das ordens guardar essas informações.
routerAdd(
  'GET',
  '/backend/v1/pcp/omie/op/fila',
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
    const podeAutorizar = Array.isArray(acoes) && acoes.indexOf('autorizar_escrita_omie') !== -1
    const podeEnviar = Array.isArray(acoes) && acoes.indexOf('executar_sync_omie') !== -1
    if (!perfil || !perfil.getBool('ativo') || (!podeAutorizar && !podeEnviar)) {
      return e.forbiddenError('sem_permissao')
    }
    let chave = null
    try {
      chave = $app.findFirstRecordByFilter('pcp_chaves_escrita', 'chave = {:c}', {
        c: 'omie_op_escrita',
      })
    } catch (_) {}
    const registros = $app.findRecordsByFilter('pcp_transacoes_omie', '', '-created', 50, 0)
    const itens = registros.map((t) => {
      let p = {}
      try {
        p = JSON.parse(t.getString('payload') || '{}') || {}
      } catch (_) {}
      let r = {}
      try {
        r = JSON.parse(t.getString('resultado') || '{}') || {}
      } catch (_) {}
      const q = Number(p.nQtdeProduzida || t.get('quantidade') || 0)
      const hash = JSON.stringify({
        operacao: p.operacao,
        nCodOP: p.nCodOP === undefined ? null : p.nCodOP,
        cCodIntOP: p.cCodIntOP,
        dDtConclusao: p.dDtConclusao,
        nQtdeProduzida: p.nQtdeProduzida,
        cObsConclusao: p.cObsConclusao,
      })
      return {
        transacao_id: t.getString('transacao_id'),
        op_id: t.getString('op_id'),
        estado: t.getString('estado'),
        ordem: String(p.cCodIntOP || p.nCodOP || ''),
        produto: 'produto não informado',
        quantidade: q,
        unidade: 'unidade desconhecida',
        data: String(p.dDtConclusao || ''),
        local: 'local não informado',
        efeito_no_estoque:
          'Esperado: o próprio Omie dá entrada de ' +
          q +
          ' (unidade desconhecida) no estoque ao concluir a ordem. O sistema não envia baixa adicional. O efeito exato é conferido na primeira gravação.',
        hash: hash,
        autorizada_por: t.getString('autorizada_por') || null,
        autorizada_em: t.getString('autorizada_em') || null,
        posts_mutantes: Number(t.get('posts_mutantes') || 0),
        conferencia: r.conferencia || null,
      }
    })
    return e.json(200, {
      chave: {
        ligada: chave ? chave.getBool('ligada') : false,
        escopo: chave ? chave.getString('escopo') || null : null,
      },
      pode_autorizar: podeAutorizar,
      pode_enviar: podeEnviar,
      itens: itens,
    })
  },
  $apis.requireAuth(),
)
