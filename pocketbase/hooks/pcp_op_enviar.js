// pocketbase/hooks/pcp_op_enviar.js — SPEC-3-002 CA-3-06
// POST /backend/v1/pcp/omie/op/enviar — conclui no Omie a ordem de produção já conferida,
// aprovada pelo PCP e AUTORIZADA pelo dono. Contrato puro e simulador: src/lib/pcp/envio-op.ts.
// Ordem das conferências (qualquer falha antes da chamada = zero chamadas ao Omie):
//   1. ação executar_sync_omie no perfil ativo (403 sem pistas);
//   2. chave omie_op_escrita LIGADA e com o escopo desta transação (senão 423, "envio desligado");
//   3. transação existe e está 'autorizada' (409) com o conteúdo igual ao autorizado (422);
//   4. aquisição atômica (autorizada → enviando, uma chamada contada): só quem adquire envia;
//   5. a chave volta a desligar ANTES da chamada (uma ordem por vez);
//   6. uma única chamada ConcluirOrdemProducao. Resposta perdida/ambígua = resultado_incerto: nunca
//      repete; só consulta (feito na conferência depois do envio). Segredos só no servidor.
routerAdd(
  'POST',
  '/backend/v1/pcp/omie/op/enviar',
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
      acoes.indexOf('executar_sync_omie') === -1
    ) {
      return e.forbiddenError('sem_permissao')
    }
    const body = e.requestInfo().body || {}
    const transacaoId = String(body.transacao_id || '')
    if (!transacaoId) return e.badRequestError('transacao_id_obrigatorio')

    // Registro de demonstração nunca é enviado, com a chave ligada ou desligada (SPEC-4-001, CA-4-34).
    try {
      const demo = $app.findFirstRecordByFilter('pcp_transacoes_omie', 'transacao_id = {:t}', {
        t: transacaoId,
      })
      if (demo.getBool('demonstracao')) return e.json(422, { erro: 'registro_de_demonstracao' })
    } catch (_) {}

    // 2. Chave: desligada (ou para outra transação) = 423 e nenhuma chamada.
    let chave = null
    try {
      chave = $app.findFirstRecordByFilter('pcp_chaves_escrita', 'chave = {:c}', {
        c: 'omie_op_escrita',
      })
    } catch (_) {}
    if (!chave || !chave.getBool('ligada') || chave.getString('escopo') !== transacaoId) {
      return e.json(423, {
        erro: 'escrita_desligada',
        mensagem: 'envio desligado: aguarda autorização do dono',
      })
    }

    // 3. Transação autorizada e conteúdo igual ao autorizado.
    let t = null
    try {
      t = $app.findFirstRecordByFilter('pcp_transacoes_omie', 'transacao_id = {:t}', {
        t: transacaoId,
      })
    } catch (_) {}
    if (!t) return e.json(404, { erro: 'transacao_inexistente' })
    if (t.getString('estado') !== 'autorizada') {
      return e.json(409, {
        erro: 'estado_nao_envia',
        motivo: 'transação em estado ' + t.getString('estado') + ': só autorizada envia',
      })
    }
    let p = {}
    try {
      p = JSON.parse(t.getString('payload') || '{}') || {}
    } catch (_) {}
    const canonico = {
      operacao: p.operacao,
      nCodOP: p.nCodOP === undefined ? null : p.nCodOP,
      cCodIntOP: p.cCodIntOP,
      dDtConclusao: p.dDtConclusao,
      nQtdeProduzida: p.nQtdeProduzida,
      cObsConclusao: p.cObsConclusao,
    }
    if (
      p.operacao !== 'concluir_op' ||
      !(Number(p.nQtdeProduzida) > 0) ||
      JSON.stringify(canonico) !== t.getString('payload_hash')
    ) {
      return e.json(422, {
        erro: 'conteudo_diferente_do_autorizado',
        motivo: 'o conteúdo mudou depois da autorização; é preciso autorizar de novo',
      })
    }
    const appKey = $secrets.get('OMIE_APP_KEY')
    const appSecret = $secrets.get('OMIE_APP_SECRET')
    if (!appKey || !appSecret) return e.badRequestError('credencial_ausente')

    // 4. Aquisição atômica: só um trabalhador passa de 'autorizada' para 'enviando'.
    let adquiriu = false
    $app.runInTransaction((tx) => {
      const r = tx.findRecordById('pcp_transacoes_omie', t.id)
      if (r.getString('estado') !== 'autorizada') return
      r.set('estado', 'enviando')
      r.set('lease_ate', new Date(Date.now() + 60 * 1000).toISOString())
      r.set('posts_mutantes', Number(r.get('posts_mutantes') || 0) + 1)
      tx.save(r)
      adquiriu = true
    })
    if (!adquiriu) {
      return e.json(409, {
        erro: 'sem_lease',
        motivo: 'outro trabalhador já está enviando esta ordem',
      })
    }

    // 5. A chave desliga antes da chamada: uma ordem por vez, mesmo que a resposta se perca.
    chave.set('ligada', false)
    chave.set('escopo', '')
    $app.save(chave)

    // 6. Uma única chamada que grava.
    const parametro = {
      cCodIntOP: canonico.cCodIntOP,
      dDtConclusao: canonico.dDtConclusao,
      nQtdeProduzida: canonico.nQtdeProduzida,
      cObsConclusao: canonico.cObsConclusao,
    }
    if (canonico.nCodOP !== null) parametro.nCodOP = Number(canonico.nCodOP)
    let chegou = false
    let status = 0
    let j = null
    try {
      const res = $http.send({
        url: 'https://app.omie.com.br/api/v1/produtos/op/',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          call: 'ConcluirOrdemProducao',
          app_key: appKey,
          app_secret: appSecret,
          param: [parametro],
        }),
        timeout: 30,
      })
      chegou = true
      status = res.statusCode
      j = res.json
    } catch (_) {
      chegou = false
    }

    const faultstring = String((j && j.faultstring) || '').slice(0, 200)
    const faultcode = String((j && j.faultcode) || '')
    let estado = 'resultado_incerto'
    if (chegou && status >= 200 && status < 300 && j && String(j.cCodStatus) === '0') {
      estado = 'confirmada'
    } else if (
      chegou &&
      status !== 425 &&
      faultcode.indexOf('SOAP-ENV:Client') === 0 &&
      faultstring.toLowerCase().indexOf('consumo redundante') === -1
    ) {
      // Recusa de validação do Omie antes de processar: não houve efeito.
      estado = 'falhou_sem_efeito'
    }
    const resultado = {
      chegou: chegou,
      http: status,
      cCodStatus: j && j.cCodStatus !== undefined ? String(j.cCodStatus) : null,
      cDesStatus: j && j.cDesStatus ? String(j.cDesStatus).slice(0, 200) : null,
      faultcode: faultcode || null,
      faultstring: faultstring || null,
    }
    const final = $app.findRecordById('pcp_transacoes_omie', t.id)
    final.set('estado', estado)
    final.set('resultado', JSON.stringify(resultado))
    if (estado === 'resultado_incerto') {
      final.set(
        'pendencias',
        JSON.stringify(['Resposta incerta: só consultar; nunca repetir a gravação.']),
      )
    }
    $app.save(final)
    return e.json(200, {
      ok: true,
      estado: estado,
      posts_mutantes: Number(final.get('posts_mutantes') || 0),
      resultado: resultado,
    })
  },
  $apis.requireAuth(),
)
