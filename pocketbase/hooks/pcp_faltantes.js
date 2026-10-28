// pocketbase/hooks/pcp_faltantes.js — SPEC-3-001 CA-3-02 (RN-01)
// Lista do que falta cadastrar no Omie: código que aparece no estoque ativo e não está no
// catálogo ativo. Só vale quando o catálogo ativo veio de uma leitura produto a produto
// CONCLUÍDA (pcp_catalogo_sync): com a lista de códigos inteira percorrida, o código fora do
// catálogo é código que o Omie disse não existir. Catálogo não lido por inteiro devolve
// situação própria e lista vazia, nunca "tudo falta". Fichas e pedidos ainda não têm leitura
// guardada: a resposta diz isso em fontes_sem_leitura. Área 'catalogo' no servidor. Só leitura;
// o sistema não cria produto no Omie. Contrato puro: src/lib/pcp/faltantes.ts.
routerAdd(
  'GET',
  '/backend/v1/pcp/faltantes',
  (e) => {
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Sessão ausente ou expirada.')
    let perfil = null
    try {
      perfil = $app.findFirstRecordByFilter('pcp_perfis', 'usuario = {:u}', { u: auth.id })
    } catch (_) {}
    if (!perfil || !perfil.getBool('ativo')) return e.forbiddenError('perfil_invalido')
    if (perfil.getStringSlice('areas').indexOf('catalogo') === -1) {
      return e.forbiddenError('area_nao_autorizada')
    }

    const fontesSemLeitura = ['ficha', 'pedido']
    const achar = (recurso) => {
      try {
        return $app.findFirstRecordByFilter(
          'pcp_fontes',
          "fonte = 'omie' && recurso = {:r} && aplicativo_ref = 'app1'",
          { r: recurso },
        )
      } catch (_) {
        return null
      }
    }
    const fonteProdutos = achar('produtos')
    const fonteEstoque = achar('estoque')
    const loteProdutos = fonteProdutos ? fonteProdutos.getString('lote_ativo') : ''
    const loteEstoque = fonteEstoque ? fonteEstoque.getString('lote_ativo') : ''
    const incompleto = (motivo) =>
      e.json(200, {
        situacao: 'catalogo_incompleto',
        motivo: motivo,
        itens: [],
        fontes_sem_leitura: fontesSemLeitura,
        atualizado_em: null,
      })
    if (!loteProdutos) return incompleto('catalogo_sem_lote_ativo')
    if (!loteEstoque) return incompleto('estoque_sem_lote_ativo')

    // O catálogo só é confiável se o lote ativo veio de uma leitura dirigida concluída.
    let lote = null
    let exec = null
    try {
      lote = $app.findRecordById('pcp_lotes', loteProdutos)
      const execId = lote.getString('execucao')
      if (execId) exec = $app.findRecordById('pcp_execucoes', execId)
    } catch (_) {}
    if (
      !exec ||
      exec.getString('recurso') !== 'produtos_dirigido' ||
      exec.getString('estado') !== 'concluida'
    ) {
      return incompleto('catalogo_nao_lido_por_inteiro')
    }

    const lerLote = (id) =>
      $app.findRecordsByFilter('pcp_dados', 'lote = {:l}', 'id', 20000, 0, { l: id })
    const noCatalogo = {}
    for (const r of lerLote(loteProdutos)) {
      try {
        const c = String(JSON.parse(r.getString('conteudo')).codigo || '')
          .trim()
          .toUpperCase()
        if (c) noCatalogo[c] = true
      } catch (_) {}
    }

    const porCodigo = {}
    for (const r of lerLote(loteEstoque)) {
      let it = {}
      try {
        it = JSON.parse(r.getString('conteudo')) || {}
      } catch (_) {}
      const codigo = String(it.codigo || '')
        .trim()
        .toUpperCase()
      if (!codigo || noCatalogo[codigo]) continue
      const entrada = porCodigo[codigo] || { codigo: codigo, descricao: null, onde: [] }
      if (!entrada.descricao && it.descricao) entrada.descricao = String(it.descricao)
      const ref = 'local ' + String(it.local_id || '?')
      if (!entrada.onde.some((x) => x.origem === 'estoque' && x.referencia === ref)) {
        entrada.onde.push({ origem: 'estoque', referencia: ref })
      }
      porCodigo[codigo] = entrada
    }
    const itens = Object.keys(porCodigo)
      .sort()
      .map((c) => porCodigo[c])
    return e.json(200, {
      situacao: 'ok',
      itens: itens,
      total: itens.length,
      fontes_sem_leitura: fontesSemLeitura,
      atualizado_em: fonteProdutos.getString('ultimo_sucesso') || null,
    })
  },
  $apis.requireAuth(),
)
