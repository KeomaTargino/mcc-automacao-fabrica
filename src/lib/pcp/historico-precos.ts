/**
 * Histórico de preços por produto e fornecedor — SPEC-3-004, CA-3-12 e CA-3-13.
 *
 * Fonte: linhas de pedido de compra do Omie. Cada linha guarda o que o pedido trouxe (preço na
 * unidade de compra, tipo, estado). O histórico é DERIVADO: recalculado a cada leitura com os fatores
 * vigentes (SPEC-3-003), então mudar o fator nunca exige reescrever a linha. Nenhuma linha é apagada.
 *
 * Regras: só linha classificada como insumo entra no histórico do insumo (frete, serviço e N-D ficam
 * no documento); linha sem classificação é "a classificar"; sem preço é "preço pendente", nunca zero;
 * sem fator confirmado o preço fica na unidade de compra e fora da comparação; cancelado aparece
 * marcado e fica fora de menor, maior e média.
 */
import { exigirAcao, type PerfilAcesso } from './acoes-compras.ts'
import { fatorVigente, type Fator } from './conversao.ts'

export type Classificacao = 'insumo' | 'frete' | 'servico' | 'nd' | 'a_classificar'
export const CLASSIFICACOES_DE_COMPRAS: Classificacao[] = ['insumo', 'frete', 'servico', 'nd']

/**
 * Tipo do item no Omie → classificação. VAZIO de propósito: os códigos de tipo não foram conferidos
 * numa amostra (leitura real aguarda CL-PEND-006). Enquanto vazio, a classificação vem de Compras.
 */
export const MAPA_TIPO_OMIE: { [tipo: string]: Classificacao } = {}

export interface LinhaPreco {
  aplicativo: string
  pedido_id: string
  linha_id: string
  produto_id: string
  fornecedor: string | null
  unidade_compra: string | null
  quantidade: number | null
  /** Preço de UMA unidade de compra, como o pedido trouxe; null = não veio. */
  preco_unitario: number | null
  /** Valor total da linha, só usado se o unitário não veio (mesma linha). */
  valor_total: number | null
  tipo_omie: string | null
  cancelado: boolean
  data: string | null
  /** Classificação feita por Compras na tela (vale quando o Omie não identifica o tipo). */
  classificacao_compras: Classificacao | null
}

export const chaveDaLinha = (l: Pick<LinhaPreco, 'aplicativo' | 'pedido_id' | 'linha_id'>) =>
  l.aplicativo + '|' + l.pedido_id + '|' + l.linha_id

export function classificarLinha(l: LinhaPreco): Classificacao {
  const doOmie = l.tipo_omie ? MAPA_TIPO_OMIE[String(l.tipo_omie).trim()] : undefined
  if (doOmie) return doOmie
  return l.classificacao_compras ?? 'a_classificar'
}

/** Preço da unidade de compra: o unitário; senão total ÷ quantidade (mesma linha); senão null. Zero ou negativo = pendente. */
export function precoDaLinha(l: LinhaPreco): number | null {
  const ok = (n: number | null): n is number => n !== null && Number.isFinite(n) && n > 0
  if (ok(l.preco_unitario)) return l.preco_unitario
  if (ok(l.valor_total) && ok(l.quantidade))
    return Math.round((l.valor_total / l.quantidade) * 1e6) / 1e6
  return null
}

export type EstadoPreco = 'comparavel' | 'sem_fator' | 'preco_pendente' | 'cancelado'

export interface RegistroHistorico {
  chave: string
  pedido_id: string
  linha_id: string
  item: string
  fornecedor: string | null
  data: string | null
  quantidade: number | null
  unidade: string | null
  preco: number | null
  fator: number | null
  estado: EstadoPreco
}

export interface Historico {
  registros: RegistroHistorico[]
  aClassificar: LinhaPreco[]
  foraDoInsumo: { linha: LinhaPreco; classificacao: Classificacao }[]
  /** Pendências: linhas sem preço entram aqui e também em registros (estado preco_pendente). */
  pendencias: { semPreco: number; semFator: number; aClassificar: number }
}

const norm = (c: string) =>
  String(c ?? '')
    .trim()
    .toUpperCase()

/** Fator da linha: unidade de compra = unidade de estoque → 1; senão o vigente (fornecedor vale mais que o geral). */
function fatorDaLinha(
  fatores: Fator[],
  l: LinhaPreco,
  unidadeEstoque: string | null,
): { fator: number; unidade: string } | null {
  const uc = l.unidade_compra
  if (uc && unidadeEstoque && uc.trim().toUpperCase() === unidadeEstoque.trim().toUpperCase()) {
    return { fator: 1, unidade: unidadeEstoque }
  }
  const apresentacoes = new Set(
    fatores
      .filter((f) => norm(f.item) === norm(l.produto_id) && f.unidadeCompra === uc)
      .map((f) => f.apresentacao),
  )
  const vigentes = [...apresentacoes]
    .map((a) => fatorVigente(fatores, norm(l.produto_id), l.fornecedor, a))
    .filter((f): f is Fator => f !== null && f.unidadeEstoque !== null)
  // várias apresentações com fatores diferentes: ambíguo, não escolhe sozinho
  if (vigentes.length === 0 || new Set(vigentes.map((f) => f.fator)).size !== 1) return null
  return { fator: vigentes[0].fator, unidade: vigentes[0].unidadeEstoque as string }
}

export function montarHistorico(
  linhas: LinhaPreco[],
  fatores: Fator[],
  unidadePorItem: { [item: string]: string | null } = {},
): Historico {
  const registros: RegistroHistorico[] = []
  const aClassificar: LinhaPreco[] = []
  const foraDoInsumo: Historico['foraDoInsumo'] = []
  const pend = { semPreco: 0, semFator: 0, aClassificar: 0 }
  for (const l of linhas) {
    const cls = classificarLinha(l)
    if (cls === 'a_classificar') {
      aClassificar.push(l)
      pend.aClassificar++
      continue
    }
    if (cls !== 'insumo') {
      foraDoInsumo.push({ linha: l, classificacao: cls })
      continue
    }
    const preco = precoDaLinha(l)
    const base = {
      chave: chaveDaLinha(l),
      pedido_id: l.pedido_id,
      linha_id: l.linha_id,
      item: norm(l.produto_id),
      fornecedor: l.fornecedor,
      data: l.data,
      quantidade: l.quantidade,
    }
    if (preco === null) {
      pend.semPreco++
      registros.push({
        ...base,
        unidade: l.unidade_compra,
        preco: null,
        fator: null,
        estado: l.cancelado ? 'cancelado' : 'preco_pendente',
      })
      continue
    }
    const f = fatorDaLinha(fatores, l, unidadePorItem[norm(l.produto_id)] ?? null)
    if (f === null) {
      if (!l.cancelado) pend.semFator++
      registros.push({
        ...base,
        unidade: l.unidade_compra,
        preco,
        fator: null,
        estado: l.cancelado ? 'cancelado' : 'sem_fator',
      })
      continue
    }
    registros.push({
      ...base,
      quantidade: l.quantidade === null ? null : Math.round(l.quantidade * f.fator * 1e6) / 1e6,
      unidade: f.unidade,
      preco: Math.round((preco / f.fator) * 1e6) / 1e6,
      fator: f.fator,
      estado: l.cancelado ? 'cancelado' : 'comparavel',
    })
  }
  return { registros, aClassificar, foraDoInsumo, pendencias: pend }
}

export interface ResumoFornecedor {
  fornecedor: string | null
  menor: number
  maior: number
  media: number
  ultimo: number
  registros: number
}

/** Menor, maior e média por fornecedor, só sobre registros comparáveis dentro do período (datas ISO, inclusive). */
export function resumoDoInsumo(
  registros: RegistroHistorico[],
  item: string,
  periodo?: { de?: string; ate?: string },
): { porFornecedor: ResumoFornecedor[]; geral: Omit<ResumoFornecedor, 'fornecedor'> | null } {
  const dentro = registros.filter(
    (r) =>
      r.item === norm(item) &&
      r.estado === 'comparavel' &&
      r.preco !== null &&
      (!periodo?.de || (r.data !== null && r.data >= periodo.de)) &&
      (!periodo?.ate || (r.data !== null && r.data <= periodo.ate)),
  )
  const agrupar = (rs: RegistroHistorico[]) => {
    const precos = rs.map((r) => r.preco as number)
    const ordenadas = [...rs].sort((a, b) => String(a.data).localeCompare(String(b.data)))
    return {
      menor: Math.min(...precos),
      maior: Math.max(...precos),
      media: Math.round((precos.reduce((s, p) => s + p, 0) / precos.length) * 1e4) / 1e4,
      ultimo: ordenadas[ordenadas.length - 1].preco as number,
      registros: rs.length,
    }
  }
  const nomes = [...new Set(dentro.map((r) => r.fornecedor))]
  return {
    porFornecedor: nomes.map((f) => ({
      fornecedor: f,
      ...agrupar(dentro.filter((r) => r.fornecedor === f)),
    })),
    geral: dentro.length ? agrupar(dentro) : null,
  }
}

export type ResultadoClassificacao =
  | { ok: true; linha: LinhaPreco }
  | { ok: false; http: 403; erro: 'sem_permissao' }
  | { ok: false; http: 422; erro: 'classificacao_invalida' | 'linha_inexistente' }

/** Compras classifica uma linha (exige editar_requisicao). A linha do Omie não é alterada além desse campo. */
export function classificarPorCompras(entrada: {
  perfil: PerfilAcesso | null
  linhas: LinhaPreco[]
  chave: string
  classificacao: string
}): ResultadoClassificacao {
  if (!exigirAcao(entrada.perfil, 'editar_requisicao').permitido)
    return { ok: false, http: 403, erro: 'sem_permissao' }
  if (!CLASSIFICACOES_DE_COMPRAS.includes(entrada.classificacao as Classificacao)) {
    return { ok: false, http: 422, erro: 'classificacao_invalida' }
  }
  const l = entrada.linhas.find((x) => chaveDaLinha(x) === entrada.chave)
  if (!l) return { ok: false, http: 422, erro: 'linha_inexistente' }
  return {
    ok: true,
    linha: { ...l, classificacao_compras: entrada.classificacao as Classificacao },
  }
}

/**
 * Mescla uma leitura nova com o que já está guardado: mesma chave atualiza os dados do Omie e MANTÉM
 * a classificação de Compras; linha que sumiu da leitura NÃO é apagada.
 */
export function mesclarLeitura(guardadas: LinhaPreco[], lidas: LinhaPreco[]): LinhaPreco[] {
  const mapa = new Map(guardadas.map((l) => [chaveDaLinha(l), l]))
  for (const n of lidas) {
    const antiga = mapa.get(chaveDaLinha(n))
    mapa.set(chaveDaLinha(n), {
      ...n,
      classificacao_compras: antiga?.classificacao_compras ?? n.classificacao_compras,
    })
  }
  return [...mapa.values()]
}

// ---- Leitura do Omie (CA-3-13) ----

/**
 * Nomes dos campos de preço no retorno de PesquisarPedCompra. NÃO CONFIRMADOS numa amostra real:
 * a chave do Omie está bloqueada (CL-PEND-006). Por isso `lerPedidoCompra` só devolve linhas quando
 * `camposConfirmados` é verdadeiro; antes disso a leitura de preço fica desligada.
 */
export const CAMPOS_PRECO = {
  precoUnitario: 'nValUnit',
  valorTotal: 'nValTot',
  fornecedor: 'nCodFor',
  tipoItem: null as string | null,
  cancelado: null as string | null,
} as const

export interface ConfigLeitura {
  camposConfirmados: boolean
  aplicativo: string
}

const txt = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim())
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export function lerPedidoCompra(
  p: {
    cabecalho_consulta?: { [k: string]: unknown }
    produtos_consulta?: { [k: string]: unknown }[]
  },
  cfg: ConfigLeitura,
  dataIso: (v: unknown) => string | null,
): { linhas: LinhaPreco[]; descartadas: string[]; bloqueada: boolean } {
  if (!cfg.camposConfirmados) return { linhas: [], descartadas: [], bloqueada: true }
  const cab = p.cabecalho_consulta ?? {}
  const pedido = txt(cab.nCodPed)
  const linhas: LinhaPreco[] = []
  const descartadas: string[] = []
  ;(p.produtos_consulta ?? []).forEach((it, idx) => {
    const linha = txt(it.nCodItem)
    const produto = txt(it.nCodProd)
    if (!pedido || !linha || !produto) {
      descartadas.push((pedido || '?') + '#' + (idx + 1))
      return
    }
    linhas.push({
      aplicativo: cfg.aplicativo,
      pedido_id: pedido,
      linha_id: linha,
      produto_id: produto,
      fornecedor: txt(cab[CAMPOS_PRECO.fornecedor]) || null,
      unidade_compra: txt(it.cUnidade) || null,
      quantidade: num(it.nQtde),
      preco_unitario: num(it[CAMPOS_PRECO.precoUnitario]),
      valor_total: num(it[CAMPOS_PRECO.valorTotal]),
      tipo_omie: CAMPOS_PRECO.tipoItem ? txt(it[CAMPOS_PRECO.tipoItem]) || null : null,
      cancelado: CAMPOS_PRECO.cancelado
        ? txt(cab[CAMPOS_PRECO.cancelado]).toUpperCase() === 'S'
        : false,
      data: dataIso(cab.dIncData ?? cab.dDtPrevisao),
      classificacao_compras: null,
    })
  })
  return { linhas, descartadas, bloqueada: false }
}
