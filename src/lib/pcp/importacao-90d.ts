/**
 * Importação 90 dias — SPEC-2-001 CA-D4 (task e6aa4afa), recorte do executor.
 *
 * Atualização atômica dos recursos vendas_90d / producao_90d / compras_a_receber
 * sobre pcp_lotes/pcp_dados (lease/geração): janela D-89..D inclusive, chave =
 * aplicativo+recurso+documento+linha, replay sem duplicação, página falha preserva
 * o lote anterior com aviso e lote incompleto não ativa, geração ≤ ativa recusada,
 * produto/local em texto, unidade null nunca vira UN. Restante a receber (compras):
 * nunca negativo nem acima do pedido; desconhecido bloqueia (nunca 0); cancelado/
 * fora do horizonte não elegíveis. Uso real só após mapa REAL aprovado pelo PCP
 * (contratos-fase-2.md) e cadastro Omie 4e0fcf1c — fixtures não aprovam regra.
 */

export interface LinhaImportada {
  documento_id: string
  linha_id: string
  produto_id: string
  local_id: string | null
  unidade_oficial: string | null
  quantidade: number
  tipo_status: string
  data_operacional: string | null
  referencia: string | null
}

/** Janela D-89..D inclusive (datas ISO yyyy-mm-dd). */
export function janela90(dataRef: string): { de: string; ate: string } {
  const d = new Date(dataRef + 'T00:00:00Z')
  const de = new Date(d.getTime() - 89 * 86400000)
  return { de: de.toISOString().slice(0, 10), ate: dataRef }
}

export function chaveLinha(
  aplicativo: string,
  recurso: string,
  documentoId: string,
  linhaId: string,
): string {
  return aplicativo + ':' + recurso + ':' + documentoId + ':' + linhaId
}

export type Normalizada = { ok: true; linha: LinhaImportada } | { ok: false; motivo: string }

/** Normalização da borda: IDs em texto, unidade null preservada, quantidade finita ≥ 0. */
export function normalizarLinha(b: {
  documento_id: string
  linha_id: string
  produto_id: string | number
  local_id?: string | number | null
  unidade_oficial: string | null
  quantidade: number
  tipo_status: string
  data_operacional: string | null
  referencia?: string | null
}): Normalizada {
  if (!b.documento_id || !b.linha_id)
    return { ok: false, motivo: 'identidade ausente (documento/linha)' }
  const produto = b.produto_id === null || b.produto_id === undefined ? '' : String(b.produto_id)
  if (!produto) return { ok: false, motivo: 'produto_id ausente' }
  const q = Number(b.quantidade)
  if (!Number.isFinite(q) || q < 0) return { ok: false, motivo: 'quantidade inválida' }
  if (b.data_operacional !== null && !/^\d{4}-\d{2}-\d{2}$/.test(b.data_operacional)) {
    return { ok: false, motivo: 'data operacional inválida' }
  }
  return {
    ok: true,
    linha: {
      documento_id: String(b.documento_id),
      linha_id: String(b.linha_id),
      produto_id: produto,
      local_id: b.local_id === null || b.local_id === undefined ? null : String(b.local_id),
      unidade_oficial:
        b.unidade_oficial === null || b.unidade_oficial === undefined
          ? null
          : String(b.unidade_oficial),
      quantidade: q,
      tipo_status: String(b.tipo_status ?? ''),
      data_operacional: b.data_operacional,
      referencia: b.referencia ?? null,
    },
  }
}

export interface EstadoImportacao {
  recurso: string
  geracaoAtiva: number | null
  geracoes: { [geracao: number]: { paginasOk: number[]; chaves: string[]; falhas: number[] } }
}

export function novoEstado(recurso: string): EstadoImportacao {
  return { recurso, geracaoAtiva: null, geracoes: {} }
}

/** Página na geração: replay por chave não duplica; data fora da janela é excluída. */
export function registrarPagina(
  e: EstadoImportacao,
  geracao: number,
  pagina: number,
  linhas: LinhaImportada[],
  aplicativo: string,
  janela?: { de: string; ate: string },
): { estado: EstadoImportacao; novas: number; repetidas: number; fora: number } {
  const g = e.geracoes[geracao] ?? { paginasOk: [], chaves: [], falhas: [] }
  let novas = 0
  let repetidas = 0
  let fora = 0
  for (const l of linhas) {
    if (
      janela &&
      l.data_operacional &&
      (l.data_operacional < janela.de || l.data_operacional > janela.ate)
    ) {
      fora++
      continue
    }
    const k = chaveLinha(aplicativo, e.recurso, l.documento_id, l.linha_id)
    if (g.chaves.includes(k)) {
      repetidas++
      continue
    }
    g.chaves.push(k)
    novas++
  }
  if (!g.paginasOk.includes(pagina)) g.paginasOk.push(pagina)
  g.falhas = g.falhas.filter((p) => p !== pagina)
  e.geracoes[geracao] = g
  return { estado: e, novas, repetidas, fora }
}

export function marcarPaginaFalha(
  e: EstadoImportacao,
  geracao: number,
  pagina: number,
): EstadoImportacao {
  const g = e.geracoes[geracao] ?? { paginasOk: [], chaves: [], falhas: [] }
  if (!g.falhas.includes(pagina)) g.falhas.push(pagina)
  g.paginasOk = g.paginasOk.filter((p) => p !== pagina)
  e.geracoes[geracao] = g
  return e
}

export type ResultadoAtivacao =
  | { ativado: true; geracaoAtiva: number }
  | { ativado: false; motivo: string; loteAnteriorPermanece: true; aviso?: string }

/** Ativação atômica: só com todas as páginas ok; falha preserva o lote anterior com aviso. */
export function ativarLote(
  e: EstadoImportacao,
  geracao: number,
  totalPaginas: number,
): ResultadoAtivacao {
  if (e.geracaoAtiva !== null && geracao <= e.geracaoAtiva) {
    return {
      ativado: false,
      motivo: 'geração ' + geracao + ' ≤ ativa ' + e.geracaoAtiva + ' — recusada',
      loteAnteriorPermanece: true,
    }
  }
  const g = e.geracoes[geracao]
  if (!g)
    return {
      ativado: false,
      motivo: 'geração sem páginas registradas',
      loteAnteriorPermanece: true,
    }
  const faltando: number[] = []
  for (let p = 1; p <= totalPaginas; p++) if (!g.paginasOk.includes(p)) faltando.push(p)
  if (faltando.length > 0 || g.falhas.length > 0) {
    const todas = faltando.concat(g.falhas).filter((v, i, a) => a.indexOf(v) === i)
    return {
      ativado: false,
      motivo: 'lote incompleto: páginas ausente(s)/com falha ' + todas.join(', '),
      loteAnteriorPermanece: true,
      aviso: 'lote anterior permanece ativo; importação incompleta não ativa',
    }
  }
  e.geracaoAtiva = geracao
  return { ativado: true, geracaoAtiva: geracao }
}

// ---- Restante a receber (compras_a_receber) ----

export interface LinhaCompra {
  pedido_id: string
  linha_id: string
  produto_id: string
  unidade_oficial: string | null
  quantidade_pedida: number
  quantidade_recebida: number
  data_prevista_local: string | null
  status_origem: string
}

export interface MapaCompras {
  versao: string
  status_elegiveis: string[]
  status_excluidos: string[]
  horizonte_de: string
  horizonte_ate: string
}

export type SaldoCompra =
  | { linha_id: string; restante: number; unidade: string; estado: 'elegivel' }
  | { linha_id: string; restante: 0; unidade: string; estado: 'nao_elegivel' }
  | {
      linha_id: string
      restante: null
      unidade: string | null
      estado: 'bloqueada'
      motivo: string
    }

export interface ResultadoCompras {
  mapa_versao: string
  linhas: SaldoCompra[]
  total_restante: number | null
  bloqueios: string[]
}

/** Restante = pedida − recebida; replay por pedido+linha; desconhecido bloqueia (nunca 0). */
export function restanteReceber(linhas: LinhaCompra[], mapa: MapaCompras): ResultadoCompras {
  const vistos = new Set<string>()
  const resultado: SaldoCompra[] = []
  const bloqueios: string[] = []
  let total: number | null = 0
  for (const l of linhas) {
    const chave = l.pedido_id + '+' + l.linha_id
    if (vistos.has(chave)) continue
    vistos.add(chave)
    const unidade = l.unidade_oficial ?? ''
    if (l.status_origem === null || l.status_origem === undefined || l.status_origem === '') {
      bloqueios.push(chave + ': status ausente')
      resultado.push({
        linha_id: l.linha_id,
        restante: null,
        unidade: l.unidade_oficial ?? null,
        estado: 'bloqueada',
        motivo: 'status desconhecido',
      })
      total = null
      continue
    }
    if (mapa.status_excluidos.includes(l.status_origem)) {
      resultado.push({ linha_id: l.linha_id, restante: 0, unidade, estado: 'nao_elegivel' })
      continue
    }
    if (!mapa.status_elegiveis.includes(l.status_origem)) {
      bloqueios.push(chave + ': status fora do mapa (' + l.status_origem + ')')
      resultado.push({
        linha_id: l.linha_id,
        restante: null,
        unidade: l.unidade_oficial ?? null,
        estado: 'bloqueada',
        motivo: 'status fora do mapa',
      })
      total = null
      continue
    }
    if (l.unidade_oficial === null) {
      bloqueios.push(chave + ': unidade ausente')
      resultado.push({
        linha_id: l.linha_id,
        restante: null,
        unidade: null,
        estado: 'bloqueada',
        motivo: 'unidade ausente',
      })
      total = null
      continue
    }
    if (!l.data_prevista_local) {
      bloqueios.push(chave + ': data prevista ausente')
      resultado.push({
        linha_id: l.linha_id,
        restante: null,
        unidade,
        estado: 'bloqueada',
        motivo: 'data ausente',
      })
      total = null
      continue
    }
    if (l.data_prevista_local < mapa.horizonte_de || l.data_prevista_local > mapa.horizonte_ate) {
      resultado.push({ linha_id: l.linha_id, restante: 0, unidade, estado: 'nao_elegivel' })
      continue
    }
    const pedida = Number(l.quantidade_pedida)
    const recebida = Number(l.quantidade_recebida)
    if (
      !Number.isFinite(pedida) ||
      !Number.isFinite(recebida) ||
      pedida < 0 ||
      recebida < 0 ||
      recebida > pedida
    ) {
      bloqueios.push(chave + ': saldo inconsistente')
      resultado.push({
        linha_id: l.linha_id,
        restante: null,
        unidade,
        estado: 'bloqueada',
        motivo: 'saldo inconsistente',
      })
      total = null
      continue
    }
    resultado.push({
      linha_id: l.linha_id,
      restante: pedida - recebida,
      unidade,
      estado: 'elegivel',
    })
    if (total !== null) total += pedida - recebida
  }
  return { mapa_versao: mapa.versao, linhas: resultado, total_restante: total, bloqueios }
}
