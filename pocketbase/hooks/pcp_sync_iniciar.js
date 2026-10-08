// pocketbase/hooks/pcp_sync_iniciar.js — SPEC-1-002/1-003
// Inicia execução de sincronização por fonte+recurso (allowlist de consulta).
// Lease de 5 minutos + geração crescente; execução ativa devolvida em vez de duplicar.
// Escrita em transação curta; nenhuma rede aqui.
routerAdd(
  'POST',
  '/backend/v1/pcp/sync/iniciar',
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
    const fonteNome = String(body.fonte || 'omie')
    const recurso = String(body.recurso || '')
    // Allowlist por fonte (só consulta; recursos reconciliados com a conta real)
    const ALLOW = {
      omie: { estoque: true, pedidos: true }, // produtos: NÃO reconciliado (conta com 0 registros)
      nuvemshop: { pedidos: true },
    }
    if (!ALLOW[fonteNome]) return e.badRequestError('fonte_desconhecida')
    if (!ALLOW[fonteNome][recurso]) return e.badRequestError('recurso_nao_reconciliado')

    const agoraISO = new Date().toISOString()
    const leaseISO = new Date(Date.now() + 5 * 60 * 1000).toISOString()

    let resultado = null
    $app.runInTransaction((tx) => {
      let fonte = null
      try {
        fonte = tx.findFirstRecordByFilter(
          'pcp_fontes',
          "fonte = {:f} && recurso = {:r} && aplicativo_ref = 'app1'",
          { f: fonteNome, r: recurso },
        )
      } catch (_) {}
      if (!fonte) {
        const colFontes = tx.findCollectionByNameOrId('pcp_fontes')
        fonte = new Record(colFontes)
        fonte.set('fonte', fonteNome)
        fonte.set('recurso', recurso)
        fonte.set('aplicativo_ref', 'app1')
        fonte.set('geracao', 0)
        fonte.set('estado_tecnico', 'nunca_executado')
        tx.save(fonte)
      }
      const execAtivaId = fonte.getString('execucao_ativa')
      if (execAtivaId) {
        let leaseMs = 0
        try {
          leaseMs = Date.parse(String(fonte.get('lease_ate') || ''))
        } catch (_) {
          leaseMs = 0
        }
        let execAtiva = null
        try {
          execAtiva = tx.findRecordById('pcp_execucoes', execAtivaId)
        } catch (_) {}
        if (execAtiva && execAtiva.getString('estado') === 'em_andamento' && leaseMs > Date.now()) {
          resultado = {
            execucao_id: execAtivaId,
            em_andamento: true,
            geracao: Number(fonte.get('geracao') || 0),
          }
          return
        }
      }
      const geracao = Number(fonte.get('geracao') || 0) + 1
      const colExec = tx.findCollectionByNameOrId('pcp_execucoes')
      const exec = new Record(colExec)
      exec.set('fonte', fonteNome)
      exec.set('recurso', recurso)
      exec.set('aplicativo_ref', 'app1')
      exec.set('estado', 'em_andamento')
      exec.set('pagina', 0)
      exec.set('cursor', '')
      tx.save(exec)
      const colLotes = tx.findCollectionByNameOrId('pcp_lotes')
      const lote = new Record(colLotes)
      lote.set('fonte', fonteNome)
      lote.set('recurso', recurso)
      lote.set('aplicativo_ref', 'app1')
      lote.set('execucao', exec.id)
      lote.set('estado', 'staging')
      lote.set('total_itens', 0)
      tx.save(lote)
      fonte.set('execucao_ativa', exec.id)
      fonte.set('geracao', geracao)
      fonte.set('lease_ate', leaseISO)
      fonte.set('ultima_tentativa', agoraISO)
      fonte.set('estado_tecnico', 'em_andamento')
      tx.save(fonte)
      resultado = { execucao_id: exec.id, em_andamento: false, geracao }
    })
    return e.json(200, resultado)
  },
  $apis.requireAuth(),
)
