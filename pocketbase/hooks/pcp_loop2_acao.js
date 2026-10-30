// pocketbase/hooks/pcp_loop2_acao.js — SPEC-3-017 CA-3-45/46
// POST /backend/v1/pcp/assistente/loop/acao { acao, ... } — escritas do LOOP-02 (uma rota, cinco ações):
//  - "prioritaria" { codigo, texto, area, ativa }: a GESTÃO (as três áreas) cadastra; cada alteração é versão nova.
//  - "ligar" { pergunta_id, codigo }: liga uma pergunta FEITA a uma prioritária ativa, por escolha de quem a fez
//    ou do validador (nunca por adivinhação); não religa pergunta já revisada.
//  - "revisar" { pergunta_id, aceita, motivo }: só o validador indicado (ação validar_loop); recusa exige motivo.
//  - "config" { baseline_pct, alvo_pct, janela_dias, validador, ligar }: editar_parametros. O loop nasce
//    DESLIGADO; ligar sem perguntas prioritárias ativas, linha de base, alvo, janela E validador é recusado (422).
//  - "veredito" { ciclo_inicio, veredito, texto }: só o validador, com o loop ligado, em ciclo terminado e com
//    prioritária feita; mede, guarda e CONGELA a medição. Aceite sem fonte ou período não entra na conta.
// Qualquer falha de acesso recebe a mesma recusa 403, sem pistas. O loop não responde pelo assistente.
routerAdd(
  'POST',
  '/backend/v1/pcp/assistente/loop/acao',
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
    const areas = perfil ? perfil.getStringSlice('areas') : []
    const gestao =
      areas.indexOf('planejamento') !== -1 &&
      areas.indexOf('compras') !== -1 &&
      areas.indexOf('faturamento') !== -1
    const validar = acoes.indexOf('validar_loop') !== -1
    const quem = String(auth.getString('email') || '').toLowerCase()
    const b = e.requestInfo().body || {}
    const acao = String(b.acao || '')
    if (
      !perfil ||
      !perfil.getBool('ativo') ||
      ['prioritaria', 'ligar', 'revisar', 'config', 'veredito'].indexOf(acao) === -1
    )
      return e.forbiddenError('sem_permissao')
    const getCfg = () => {
      try {
        return $app.findFirstRecordByFilter('pcp_loop_config', "loop = 'LOOP-02'")
      } catch (_) {
        return null
      }
    }
    const prioritariasVigentes = () => {
      const vig = {}
      for (const p of $app.findRecordsByFilter(
        'pcp_perguntas_prioritarias',
        '',
        'codigo,-versao',
        2000,
        0,
      )) {
        const c = p.getString('codigo')
        if (!vig[c] || Number(p.get('versao')) > vig[c].versao)
          vig[c] = { codigo: c, ativa: p.getBool('ativa'), versao: Number(p.get('versao')) }
      }
      return Object.keys(vig).map((k) => vig[k])
    }

    if (acao === 'prioritaria') {
      if (!gestao) return e.forbiddenError('sem_permissao')
      const codigo = String(b.codigo || '')
        .trim()
        .toUpperCase()
      const texto = String(b.texto || '').trim()
      const erros = []
      if (!/^[A-Z0-9-]{1,20}$/.test(codigo)) erros.push('código curto (letras, números e hífen)')
      if (texto.length < 5) erros.push('escreva a pergunta')
      if (['pcp', 'compras', 'faturamento'].indexOf(String(b.area)) === -1)
        erros.push('escolha a área')
      if (erros.length > 0) return e.json(422, { erro: 'dados_invalidos', motivos: erros })
      let versao = 1
      try {
        const u = $app.findRecordsByFilter(
          'pcp_perguntas_prioritarias',
          'codigo = {:c}',
          '-versao',
          1,
          0,
          { c: codigo },
        )
        if (u.length > 0) versao = Number(u[0].get('versao')) + 1
      } catch (_) {}
      try {
        const r = new Record($app.findCollectionByNameOrId('pcp_perguntas_prioritarias'))
        r.set('codigo', codigo)
        r.set('texto', texto)
        r.set('area', b.area)
        r.set('ativa', b.ativa !== false)
        r.set('versao', versao)
        r.set('alterado_por', quem)
        $app.save(r)
      } catch (_) {
        return e.json(409, {
          erro: 'conflito',
          motivo: 'outra alteração chegou ao mesmo tempo; recarregue',
        })
      }
      return e.json(200, { ok: true, codigo: codigo, versao: versao })
    }

    if (acao === 'ligar' || acao === 'revisar') {
      let pergunta = null
      try {
        pergunta = $app.findRecordById('pcp_assistente_perguntas', String(b.pergunta_id || ''))
      } catch (_) {}
      if (!pergunta) return e.forbiddenError('sem_permissao')
      let rev = null
      try {
        rev = $app.findFirstRecordByFilter('pcp_assistente_revisoes', 'pergunta_id = {:p}', {
          p: pergunta.id,
        })
      } catch (_) {}
      if (acao === 'ligar') {
        const dono = String(pergunta.getString('usuario')).toLowerCase() === quem
        if (!(dono || validar)) return e.forbiddenError('sem_permissao')
        const alvo = prioritariasVigentes().find(
          (p) =>
            p.codigo ===
            String(b.codigo || '')
              .trim()
              .toUpperCase(),
        )
        if (!alvo || !alvo.ativa)
          return e.json(422, {
            erro: 'dados_invalidos',
            motivos: ['escolha uma pergunta prioritária ativa'],
          })
        if (rev && rev.getString('decisao') !== '') return e.json(409, { erro: 'ja_revisada' })
        try {
          if (!rev) {
            rev = new Record($app.findCollectionByNameOrId('pcp_assistente_revisoes'))
            rev.set('pergunta_id', pergunta.id)
          }
          rev.set('prioritaria', alvo.codigo)
          rev.set('ligada_por', quem)
          $app.save(rev)
        } catch (_) {
          return e.json(409, { erro: 'conflito', motivo: 'recarregue e tente de novo' })
        }
        return e.json(200, { ok: true, pergunta_id: pergunta.id, prioritaria: alvo.codigo })
      }
      const cfg = getCfg()
      if (!validar || !cfg || cfg.getString('validador') !== quem)
        return e.forbiddenError('sem_permissao')
      if (!rev || rev.getString('prioritaria') === '') return e.json(409, { erro: 'sem_ligacao' })
      if (rev.getString('decisao') !== '') return e.json(409, { erro: 'ja_revisada' })
      const aceita = b.aceita === true
      const motivo = String(b.motivo || '').trim()
      if (!aceita && motivo.length < 3)
        return e.json(422, { erro: 'dados_invalidos', motivos: ['a recusa exige o motivo'] })
      rev.set('decisao', aceita ? 'aceita' : 'recusada')
      rev.set('motivo', motivo)
      rev.set('validador', quem)
      rev.set('revisado_em', new Date().toISOString())
      $app.save(rev)
      return e.json(200, {
        ok: true,
        pergunta_id: pergunta.id,
        decisao: aceita ? 'aceita' : 'recusada',
      })
    }

    if (acao === 'config') {
      if (acoes.indexOf('editar_parametros') === -1) return e.forbiddenError('sem_permissao')
      let c = getCfg()
      const atual = {
        baseline: c && c.getBool('baseline_definida') ? Number(c.get('baseline_pct')) : null,
        alvo: c && Number(c.get('alvo_pct')) > 0 ? Number(c.get('alvo_pct')) : null,
        janela: c && Number(c.get('janela_dias')) > 0 ? Number(c.get('janela_dias')) : null,
        validador: c && c.getString('validador') ? c.getString('validador') : null,
      }
      const tem = (k) => Object.prototype.hasOwnProperty.call(b, k)
      const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v))
      const novo = {
        baseline: tem('baseline_pct') ? num(b.baseline_pct) : atual.baseline,
        alvo: tem('alvo_pct') ? num(b.alvo_pct) : atual.alvo,
        janela: tem('janela_dias') ? num(b.janela_dias) : atual.janela,
        validador: tem('validador')
          ? String(b.validador || '')
              .trim()
              .toLowerCase() || null
          : atual.validador,
      }
      const erros = []
      if (
        novo.baseline !== null &&
        (!isFinite(novo.baseline) || novo.baseline < 0 || novo.baseline > 100)
      )
        erros.push('linha de base deve ficar entre 0 e 100')
      if (novo.alvo !== null && (!isFinite(novo.alvo) || novo.alvo <= 0 || novo.alvo > 100))
        erros.push('alvo deve ficar entre 0 e 100')
      if (
        novo.janela !== null &&
        (!isFinite(novo.janela) ||
          Math.floor(novo.janela) !== novo.janela ||
          novo.janela < 1 ||
          novo.janela > 366)
      )
        erros.push('janela deve ser um número inteiro de dias, de 1 a 366')
      if (novo.validador) {
        let ok = false
        try {
          const u = $app.findAuthRecordByEmail('users', novo.validador)
          const p = $app.findFirstRecordByFilter('pcp_perfis', 'usuario = {:u}', { u: u.id })
          ok =
            p.getBool('ativo') &&
            (JSON.parse(p.getString('acoes') || '[]') || []).indexOf('validar_loop') !== -1
        } catch (_) {}
        if (!ok) erros.push('o validador precisa ser uma conta ativa com a ação validar_loop')
      }
      if (erros.length > 0) return e.json(422, { erro: 'dados_invalidos', motivos: erros })
      const faltam = []
      if (prioritariasVigentes().filter((p) => p.ativa).length < 1)
        faltam.push('perguntas prioritárias')
      if (novo.baseline === null) faltam.push('linha de base')
      if (novo.alvo === null) faltam.push('alvo')
      if (novo.janela === null) faltam.push('janela')
      if (!novo.validador) faltam.push('validador')
      if (b.ligar === true && faltam.length > 0)
        return e.json(422, {
          erro: 'condicoes_nao_cumpridas',
          faltam: faltam,
          motivo: 'o loop continua desligado',
        })
      let ativo = c ? c.getBool('ativo') : false
      if (b.ligar === true) ativo = true
      if (b.ligar === false || faltam.length > 0) ativo = false
      if (!c) {
        c = new Record($app.findCollectionByNameOrId('pcp_loop_config'))
        c.set('loop', 'LOOP-02')
      }
      c.set('ativo', ativo)
      c.set('baseline_definida', novo.baseline !== null)
      c.set('baseline_pct', novo.baseline === null ? 0 : novo.baseline)
      c.set('alvo_pct', novo.alvo === null ? 0 : novo.alvo)
      c.set('janela_dias', novo.janela === null ? 0 : novo.janela)
      c.set('validador', novo.validador || '')
      c.set('definido_por', quem)
      c.set('definido_em', new Date().toISOString())
      $app.save(c)
      return e.json(200, { ok: true, ativo: ativo, faltam_para_ligar: faltam })
    }

    // veredito
    const cfg = getCfg()
    if (!validar || !cfg || !cfg.getString('validador') || cfg.getString('validador') !== quem)
      return e.forbiddenError('sem_permissao')
    if (!cfg.getBool('ativo')) return e.json(409, { erro: 'loop_desligado' })
    if (b.veredito !== 'atingido' && b.veredito !== 'nao_atingido')
      return e.json(422, {
        erro: 'dados_invalidos',
        motivos: ['o veredito é "atingido" ou "não atingido"'],
      })
    const janela = Number(cfg.get('janela_dias') || 0)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.ciclo_inicio || '')) || janela < 1)
      return e.json(422, {
        erro: 'dados_invalidos',
        motivos: ['informe o início do ciclo (AAAA-MM-DD)'],
      })
    const DIA = 86400000
    const inicioMs = new Date(b.ciclo_inicio + 'T00:00:00Z').getTime()
    const fimMs = inicioMs + janela * DIA - 1
    if (Math.floor(inicioMs / DIA) % janela !== 0)
      return e.json(422, {
        erro: 'dados_invalidos',
        motivos: ['esse dia não é o início de um ciclo da janela definida'],
      })
    if (fimMs >= Date.now())
      return e.json(409, { erro: 'ciclo_em_andamento', motivo: 'o ciclo ainda não terminou' })
    let feitas = 0
    let aceitas = 0
    for (const r of $app.findRecordsByFilter('pcp_assistente_perguntas', '', '-created', 5000, 0)) {
      const t = new Date(r.getString('created')).getTime()
      if (!(t >= inicioMs && t <= fimMs)) continue
      let rev = null
      try {
        rev = $app.findFirstRecordByFilter('pcp_assistente_revisoes', 'pergunta_id = {:p}', {
          p: r.id,
        })
      } catch (_) {}
      if (!rev || rev.getString('prioritaria') === '') continue
      feitas++
      let tf = false
      if (r.getString('resultado') === 'respondida') {
        try {
          tf = (JSON.parse(r.getString('fontes') || '[]') || []).some(
            (f) => f && f.nome && f.periodo,
          )
        } catch (_) {}
      }
      if (rev.getString('decisao') === 'aceita' && tf) aceitas++
    }
    if (feitas === 0)
      return e.json(409, {
        erro: 'nao_aplicavel',
        motivo: 'nenhuma pergunta prioritária no ciclo: não há o que validar',
      })
    let resposta = null
    try {
      $app.runInTransaction((tx) => {
        let m = null
        try {
          m = tx.findFirstRecordByFilter(
            'pcp_loop_medicoes',
            "loop = 'LOOP-02' && ciclo_inicio = {:i}",
            { i: b.ciclo_inicio },
          )
        } catch (_) {}
        if (m && m.getBool('congelada')) {
          resposta = { http: 409, corpo: { erro: 'ja_congelada' } }
          return
        }
        if (!m) {
          m = new Record(tx.findCollectionByNameOrId('pcp_loop_medicoes'))
          m.set('loop', 'LOOP-02')
          m.set('ciclo_inicio', b.ciclo_inicio)
        }
        const agora = new Date().toISOString()
        const prop = Math.round((aceitas / feitas) * 10000) / 100
        m.set('ciclo_fim', new Date(fimMs).toISOString().slice(0, 10))
        m.set('gerados', feitas)
        m.set('tratados', aceitas)
        m.set('proporcao_pct', prop)
        m.set('nao_aplicavel', false)
        m.set('pendente', false)
        m.set('calculado_em', agora)
        m.set('veredito', b.veredito)
        m.set('veredito_por', quem)
        m.set('veredito_em', agora)
        m.set('veredito_texto', String(b.texto || '').trim())
        m.set('congelada', true)
        tx.save(m)
        resposta = {
          http: 200,
          corpo: {
            ok: true,
            ciclo_inicio: b.ciclo_inicio,
            prioritarias_feitas: feitas,
            aceitas: aceitas,
            proporcao_pct: prop,
            veredito: b.veredito,
            congelada: true,
          },
        }
      })
    } catch (_) {
      return e.json(409, {
        erro: 'conflito',
        motivo: 'outra gravação chegou ao mesmo tempo; recarregue',
      })
    }
    return e.json(resposta.http, resposta.corpo)
  },
  $apis.requireAuth(),
)
