// pocketbase/hooks/pcp_op_conferir.js — SPEC-3-002 CA-3-07 (RN-04/RN-05)
// POST /backend/v1/pcp/omie/op/conferir — conferência DEPOIS do envio. SÓ LEITURA no Omie
// (ConsultarOrdemProducao): compara ordem, quantidade e status; estoque só quando há posição de
// antes (não há leitura de estoque guardada ainda: o resultado vira "conferido sem estoque").
// Nunca grava no Omie e nunca autoriza nova gravação. Transação em resultado_incerto cuja leitura
// confere passa a 'confirmada' sem novo envio. Divergência marca a transação e não repete nada.
// Bloqueio por excesso de consultas (HTTP 425 / consumo redundante): para, devolve "inconclusivo".
// Ações aceitas: executar_sync_omie ou autorizar_escrita_omie. Contrato: src/lib/pcp/autorizacao-op.ts.
routerAdd(
  'POST',
  '/backend/v1/pcp/omie/op/conferir',
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
      (acoes.indexOf('executar_sync_omie') === -1 && acoes.indexOf('autorizar_escrita_omie') === -1)
    ) {
      return e.forbiddenError('sem_permissao')
    }
    const transacaoId = String((e.requestInfo().body || {}).transacao_id || '')
    if (!transacaoId) return e.badRequestError('transacao_id_obrigatorio')
    let t = null
    try {
      t = $app.findFirstRecordByFilter('pcp_transacoes_omie', 'transacao_id = {:t}', {
        t: transacaoId,
      })
    } catch (_) {}
    if (!t) return e.json(404, { erro: 'transacao_inexistente' })
    const estado = t.getString('estado')
    if (estado !== 'confirmada' && estado !== 'resultado_incerto') {
      return e.json(409, { erro: 'nada_a_conferir', motivo: 'transação em estado ' + estado })
    }
    const appKey = $secrets.get('OMIE_APP_KEY')
    const appSecret = $secrets.get('OMIE_APP_SECRET')
    if (!appKey || !appSecret) return e.badRequestError('credencial_ausente')

    let p = {}
    try {
      p = JSON.parse(t.getString('payload') || '{}') || {}
    } catch (_) {}
    const parametro = {}
    if (p.nCodOP !== null && p.nCodOP !== undefined && p.nCodOP !== '')
      parametro.nCodOP = Number(p.nCodOP)
    else parametro.cCodIntOP = String(p.cCodIntOP || '')

    // Uma leitura só; nunca repete em laço.
    let status = 0
    let j = null
    let bloqueado = false
    try {
      const res = $http.send({
        url: 'https://app.omie.com.br/api/v1/produtos/op/',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          call: 'ConsultarOrdemProducao',
          app_key: appKey,
          app_secret: appSecret,
          param: [parametro],
        }),
        timeout: 20,
      })
      status = res.statusCode
      j = res.json
      const falha = String((j && j.faultstring) || '').toLowerCase()
      if (status === 425 || falha.indexOf('consumo redundante') >= 0) bloqueado = true
    } catch (_) {
      status = 0
    }

    const quantidadeEnviada = Number(t.get('quantidade') || 0)
    const detalhes = []
    let resultado = 'inconclusivo'
    const checagens = { ordem: null, quantidade: null, status: null, estoque: null }
    const encontrou = !bloqueado && status >= 200 && status < 300 && j && j.identificacao
    if (bloqueado) {
      detalhes.push(
        'O Omie está limitando as consultas agora; confira de novo mais tarde. Nenhuma nova gravação.',
      )
    } else if (!encontrou) {
      detalhes.push(
        'A ordem não foi encontrada na leitura; ausência não prova que não houve efeito. Nenhuma nova gravação.',
      )
    } else {
      const qLida =
        j.identificacao.nQtde === undefined || j.identificacao.nQtde === null
          ? null
          : Number(j.identificacao.nQtde)
      const concluida =
        j.outrasInf && j.outrasInf.cConcluida !== undefined && j.outrasInf.cConcluida !== null
          ? String(j.outrasInf.cConcluida).toUpperCase() === 'S'
          : null
      const okQtd = qLida === quantidadeEnviada
      const okStatus = concluida === true
      if (!okQtd)
        detalhes.push(
          'Quantidade no Omie: ' + String(qLida) + '; enviada: ' + quantidadeEnviada + '.',
        )
      if (!okStatus) {
        detalhes.push(
          concluida === null
            ? 'O Omie não informou o status da ordem.'
            : 'A ordem não aparece como concluída no Omie.',
        )
      }
      detalhes.push('Estoque não comparado: falta a posição de antes do envio.')
      detalhes.push(
        'A quantidade lida é a da ordem (nQtde); o Omie não devolve à parte a quantidade produzida na leitura documentada.',
      )
      checagens.ordem = true
      checagens.quantidade = okQtd
      checagens.status = okStatus
      resultado = okQtd && okStatus ? 'conferido_sem_estoque' : 'divergente'
    }

    let anterior = {}
    try {
      anterior = JSON.parse(t.getString('resultado') || '{}') || {}
    } catch (_) {}
    anterior.conferencia = {
      resultado: resultado,
      checagens: checagens,
      detalhes: detalhes,
      conferida_em: new Date().toISOString(),
      nova_gravacao_autorizada: false,
    }
    t.set('resultado', JSON.stringify(anterior))
    if (estado === 'resultado_incerto' && resultado === 'conferido_sem_estoque') {
      t.set('estado', 'confirmada')
      t.set('pendencias', JSON.stringify([]))
    }
    if (resultado === 'divergente') {
      t.set(
        'pendencias',
        JSON.stringify([
          'Divergente na leitura depois do envio: nenhuma nova gravação; decisão do PCP/dono.',
        ]),
      )
    }
    $app.save(t)
    return e.json(200, {
      ok: true,
      resultado: resultado,
      estado: t.getString('estado'),
      checagens: checagens,
      detalhes: detalhes,
      nova_gravacao_autorizada: false,
    })
  },
  $apis.requireAuth(),
)
