// pocketbase/hooks/pcp_sync_iniciar.js — SPEC-1-002 CA-O1/O2
// Inicia execução de sincronização por recurso (allowlist de consulta).
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
    const recurso = String(body.recurso || '')
    const ALLOW = {
      estoque: {
        endpoint: 'https://app.omie.com.br/api/v1/estoque/consulta/',
        call: 'ConsultaEstoque',
      },
      produtos: {
        endpoint: 'https://app.omie.com.br/api/v1/geral/produtos/',
        call: 'ListarProdutosResumido',
      },
    }
    const cfg = ALLOW[recurso]
    if (!cfg) return e.badRequestError('recurso_desconhecido')

    const agoraISO = new Date().toISOString()
    const leaseISO = new Date(Date.now() + 5 * 60 * 1000).toISOString()

    let resultado = null
    $app.runInTransaction((tx) => {
      let fonte = null
      try {
        fonte = tx.findFirstRecordByFilter(
          'pcp_fontes',
          "fonte = 'omie' && recurso = {:r} && aplicativo_ref = 'app1'",
          { r: recurso },
        )
      } catch (_) {}
      if (!fonte) {
        const colFontes = tx.findCollectionByNameOrId('pcp_fontes')
        fonte = new Record(colFontes)
        fonte.set('fonte', 'omie')
        fonte.set('recurso', recurso)
        fonte.set('aplicativo_ref', 'app1')
        fonte.set('geracao', 0)
        fonte.set('estado_tecnico', 'nunca_executado')
        tx.save(fonte)
      }
      // execução ativa com lease vigente? devolve a mesma
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
      // nova execução (geração crescente) + lote staging + lease
      const geracao = Number(fonte.get('geracao') || 0) + 1
      const colExec = tx.findCollectionByNameOrId('pcp_execucoes')
      const exec = new Record(colExec)
      exec.set('fonte', 'omie')
      exec.set('recurso', recurso)
      exec.set('aplicativo_ref', 'app1')
      exec.set('estado', 'em_andamento')
      exec.set('pagina', 0)
      exec.set('cursor', '')
      tx.save(exec)
      const colLotes = tx.findCollectionByNameOrId('pcp_lotes')
      const lote = new Record(colLotes)
      lote.set('fonte', 'omie')
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
