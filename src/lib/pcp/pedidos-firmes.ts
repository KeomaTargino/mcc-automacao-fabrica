/**
 * Pedidos firmes no horizonte — SPEC-2-001 CA-D3 (task 9318a299), recorte do executor.
 *
 * Contrato SINTÉTICO: calcula o saldo firme por linha a partir de um MAPA explícito
 * (status elegíveis/excluídos, campo de data, horizonte inclusivo). O mapa REAL só
 * vale após aprovação do PCP (contratos-fase-2.md); aqui o mapa é identificado como
 * sintético. Oráculos T5 da SPEC: confirmada 20/atendida 5 dentro do horizonte = 15;
 * cancelada 7 e fora do horizonte 3 = 0; replay não duplica; desconhecido = null e
 * bloqueia (nunca 0); restante nunca negativo nem acima do pedido.
 *
 * Patch de 02/11/2026: uma linha desconhecida bloqueia SÓ aquela linha. As demais continuam
 * somando e o total sai marcado como parcial (`total_parcial`), com os bloqueios listados.
 * O total só é null quando nenhuma linha pôde ser calculada.
 */

export interface LinhaPedido {
  pedido_id: string
  linha_id: string
  produto_id: string
  unidade: string | null
  quantidade_pedida: number
  quantidade_atendida: number
  status: string
  data_operacional: string | null // ISO yyyy-mm-dd
}

export interface MapaPedidos {
  versao: string // ex.: 'sintetico-v1' — mapa real só com aprovação do PCP
  status_elegiveis: string[]
  campo_data: 'data_operacional'
  horizonte_de: string // inclusivo
  horizonte_ate: string // inclusivo
}

export type SaldoLinha =
  | { linha_id: string; firme: number; unidade: string; estado: 'elegivel' }
  | { linha_id: string; firme: 0; unidade: string; estado: 'excluida' }
  | { linha_id: string; firme: null; unidade: string | null; estado: 'bloqueada'; motivo: string }

export interface ResultadoPedidos {
  mapa_versao: string
  linhas: SaldoLinha[]
  /** Soma das linhas calculadas; null só se nenhuma linha pôde ser calculada. */
  total_firme: number | null
  /** true quando alguma linha ficou bloqueada: o total não inclui essas linhas. */
  total_parcial: boolean
  bloqueios: string[]
}

function dentroDoHorizonte(data: string | null, mapa: MapaPedidos): boolean | null {
  if (!data) return null
  return data >= mapa.horizonte_de && data <= mapa.horizonte_ate
}

/** Saldo firme por linha; chave de replay = pedido+linha (idempotente). */
export function saldoFirme(linhas: LinhaPedido[], mapa: MapaPedidos): ResultadoPedidos {
  const vistos = new Set<string>()
  const resultado: SaldoLinha[] = []
  const bloqueios: string[] = []
  let soma = 0
  let calculadas = 0
  const bloquear = (l: LinhaPedido, chave: string, motivoLista: string, motivo: string) => {
    bloqueios.push(chave + ': ' + motivoLista)
    resultado.push({
      linha_id: l.linha_id,
      firme: null,
      unidade: l.unidade ?? null,
      estado: 'bloqueada',
      motivo,
    })
  }
  for (const l of linhas) {
    const chave = l.pedido_id + '+' + l.linha_id
    if (vistos.has(chave)) continue // replay: mesma chave não soma de novo
    vistos.add(chave)
    const unidade = l.unidade ?? ''
    if (l.status === null || l.status === undefined || l.status === '') {
      bloquear(l, chave, 'status ausente', 'status desconhecido')
      continue
    }
    if (
      !mapa.status_elegiveis.includes(l.status) &&
      !['cancelado', 'denegado'].includes(l.status)
    ) {
      bloquear(l, chave, 'status fora do mapa (' + l.status + ')', 'status fora do mapa')
      continue
    }
    if (l.status === 'cancelado' || l.status === 'denegado') {
      resultado.push({ linha_id: l.linha_id, firme: 0, unidade, estado: 'excluida' })
      calculadas += 1
      continue
    }
    const noHorizonte = dentroDoHorizonte(l.data_operacional, mapa)
    if (noHorizonte === null) {
      bloquear(l, chave, 'data operacional ausente', 'data ausente')
      continue
    }
    if (!noHorizonte) {
      resultado.push({ linha_id: l.linha_id, firme: 0, unidade, estado: 'excluida' })
      calculadas += 1
      continue
    }
    const restante = l.quantidade_pedida - l.quantidade_atendida
    if (restante < 0 || !(l.quantidade_pedida >= 0) || !(l.quantidade_atendida >= 0)) {
      bloquear(l, chave, 'saldo inconsistente', 'saldo inconsistente')
      continue
    }
    resultado.push({ linha_id: l.linha_id, firme: restante, unidade, estado: 'elegivel' })
    soma += restante
    calculadas += 1
  }
  const haBloqueio = bloqueios.length > 0
  return {
    mapa_versao: mapa.versao,
    linhas: resultado,
    total_firme: haBloqueio && calculadas === 0 ? null : soma,
    total_parcial: haBloqueio,
    bloqueios,
  }
}
