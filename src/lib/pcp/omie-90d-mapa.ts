/**
 * Borda de leitura dos 90 dias reais — SPEC-3-001, CA-3-03.
 *
 * Converte o registro cru do Omie (campos mapeados e provados em 20–21/10 em
 * 07-sistemas/pcp/contratos-fase-2.md) nas linhas que a importação construída na fase 2
 * (importacao-90d.ts e pedidos-firmes.ts) já consome. Nada é inventado: campo que não veio fica
 * null ou fora do mapa e bloqueia o item (nunca zero); unidade vazia fica null; status que o mapa
 * aprovado em 21/10 não conhece fica vazio e bloqueia. Nenhuma chamada ao Omie nasce aqui.
 */
import type { LinhaPedido } from './pedidos-firmes.ts'
import type { LinhaCompra } from './importacao-90d.ts'

/** "dd/mm/aaaa" do Omie → "aaaa-mm-dd"; qualquer outra coisa vira null (nunca data presumida). */
export function dataOmieParaIso(valor: unknown): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(valor ?? '').trim())
  if (!m) return null
  const [, dd, mm, aaaa] = m
  const dia = Number(dd)
  const mes = Number(mm)
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null
  return aaaa + '-' + mm + '-' + dd
}

function texto(v: unknown): string {
  return v === null || v === undefined ? '' : String(v).trim()
}

function numeroOuNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function unidadeOuNull(v: unknown): string | null {
  const u = texto(v)
  return u === '' ? null : u
}

/**
 * Status do pedido de venda pelos sinalizadores de infoCadastro. Só devolve nomes do mapa
 * aprovado (faturado, autorizado, cancelado, denegado, devolvido); devolução parcial e a falta de
 * qualquer sinalizador ficam fora do mapa (vazio ou 'devolvido_parcial') e bloqueiam o item.
 */
export function statusPedidoVenda(info: { [k: string]: unknown } | null | undefined): string {
  const i = info ?? {}
  const sim = (k: string) => texto(i[k]).toUpperCase() === 'S'
  if (sim('cancelado')) return 'cancelado'
  if (sim('denegado')) return 'denegado'
  if (sim('devolvido')) return 'devolvido'
  if (sim('devolvido_parcial')) return 'devolvido_parcial'
  if (sim('faturado')) return 'faturado'
  if (sim('autorizado')) return 'autorizado'
  return ''
}

export interface PedidoVendaOmie {
  cabecalho?: { codigo_pedido?: unknown }
  infoCadastro?: { [k: string]: unknown }
  det?: {
    ide?: { codigo_item_integracao?: unknown; codigo_item?: unknown }
    produto?: { codigo_produto?: unknown; quantidade?: unknown; unidade?: unknown }
  }[]
}

/**
 * Pedido de venda → linhas do mapa de pedidos firmes. Identidade = codigo_pedido + item
 * (codigo_item_integracao, ou codigo_item quando a integração não grava referência).
 * quantidade_atendida é 0: o pedido não informa o que já saiu por linha; o firme é a quantidade pedida.
 */
export function linhasDoPedidoVenda(p: PedidoVendaOmie): {
  linhas: LinhaPedido[]
  descartadas: string[]
} {
  const pedido = texto(p.cabecalho?.codigo_pedido)
  const status = statusPedidoVenda(p.infoCadastro)
  const dataFat = dataOmieParaIso(p.infoCadastro?.dFat)
  const linhas: LinhaPedido[] = []
  const descartadas: string[] = []
  const itens = p.det ?? []
  itens.forEach((d, idx) => {
    const linha = texto(d.ide?.codigo_item_integracao) || texto(d.ide?.codigo_item)
    const produto = texto(d.produto?.codigo_produto)
    const q = numeroOuNull(d.produto?.quantidade)
    if (!pedido || !linha || !produto || q === null || q < 0) {
      descartadas.push((pedido || '?') + '#' + (idx + 1))
      return
    }
    linhas.push({
      pedido_id: pedido,
      linha_id: linha,
      produto_id: produto,
      unidade: unidadeOuNull(d.produto?.unidade),
      quantidade_pedida: q,
      quantidade_atendida: 0,
      status,
      data_operacional: dataFat,
    })
  })
  return { linhas, descartadas }
}

export interface PedidoCompraOmie {
  cabecalho_consulta?: { nCodPed?: unknown; cEtapa?: unknown; dDtPrevisao?: unknown }
  produtos_consulta?: {
    nCodItem?: unknown
    nCodProd?: unknown
    cUnidade?: unknown
    nQtde?: unknown
    nQtdeRec?: unknown
  }[]
}

/**
 * Pedido de compra → linhas de compras a receber. Recebida ausente é desconhecida, não zero: a linha
 * é descartada e listada (o restante não pode ser presumido). Status vem da etapa do pedido.
 */
export function linhasDoPedidoCompra(p: PedidoCompraOmie): {
  linhas: LinhaCompra[]
  descartadas: string[]
} {
  const cab = p.cabecalho_consulta ?? {}
  const pedido = texto(cab.nCodPed)
  const etapa = texto(cab.cEtapa)
  const previsao = dataOmieParaIso(cab.dDtPrevisao)
  const linhas: LinhaCompra[] = []
  const descartadas: string[] = []
  const itens = p.produtos_consulta ?? []
  itens.forEach((it, idx) => {
    const linha = texto(it.nCodItem)
    const produto = texto(it.nCodProd)
    const pedida = numeroOuNull(it.nQtde)
    const recebida = numeroOuNull(it.nQtdeRec)
    if (!pedido || !linha || !produto || pedida === null || recebida === null) {
      descartadas.push((pedido || '?') + '#' + (idx + 1))
      return
    }
    linhas.push({
      pedido_id: pedido,
      linha_id: linha,
      produto_id: produto,
      unidade_oficial: unidadeOuNull(it.cUnidade),
      quantidade_pedida: pedida,
      quantidade_recebida: recebida,
      data_prevista_local: previsao,
      status_origem: etapa,
    })
  })
  return { linhas, descartadas }
}
