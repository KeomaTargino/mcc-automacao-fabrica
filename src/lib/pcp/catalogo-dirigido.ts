/**
 * Catálogo por consulta dirigida — 4e0fcf1c/5d8793fb (21/10/2026), recorte do executor.
 *
 * A listagem geral/produtos do Omie retorna 0 (provado em 20/10 e 21/10) mas os
 * produtos EXISTEM por ConsultarProduto (HTTP 200, M011001/M043024 provados). Este
 * contrato dirige a sincronização do catálogo por CÓDIGO: lote de códigos → planos
 * de consulta paginados com rate-limit amigável; produto encontrado → linha
 * normalizada (IDs em texto, unidade null preservada, nunca default); não encontrado
 * → pendência explícita (nunca inventa); replay por código não duplica.
 */

export interface LinhaCatalogo {
  codigo: string
  descricao: string
  unidade: string | null
  ativo: boolean
  origem: 'consulta_dirigida'
}

export type ResultadoCodigo =
  | { codigo: string; estado: 'ok'; linha: LinhaCatalogo }
  | { codigo: string; estado: 'nao_encontrado'; pendencia: string }
  | { codigo: string; estado: 'invalido'; pendencia: string }

/** Normaliza a resposta do ConsultarProduto; nunca inventa unidade/descrição. */
export function normalizarProduto(
  codigo: string,
  resposta: {
    descricao?: string | null
    unidade?: string | null
    inativo?: string | boolean | null
  } | null,
): ResultadoCodigo {
  if (!resposta || (!resposta.descricao && resposta.descricao !== '')) {
    return {
      codigo,
      estado: 'nao_encontrado',
      pendencia: 'produto não encontrado no Omie por código ' + codigo,
    }
  }
  const unidade =
    resposta.unidade === null || resposta.unidade === undefined || resposta.unidade === ''
      ? null
      : String(resposta.unidade)
  const inativo =
    resposta.inativo === true || resposta.inativo === 'S' || resposta.inativo === 'true'
  return {
    codigo,
    estado: 'ok',
    linha: {
      codigo,
      descricao: String(resposta.descricao ?? ''),
      unidade,
      ativo: !inativo,
      origem: 'consulta_dirigida',
    },
  }
}

/** Plano de consulta: divide códigos em lotes com pausa (rate-limit Omie 3 req/s). */
export function planoConsulta(
  codigos: string[],
  porLote = 30,
): { lote: number; codigos: string[]; pausa_ms: number }[] {
  const lotes: { lote: number; codigos: string[]; pausa_ms: number }[] = []
  for (let i = 0; i < codigos.length; i += porLote) {
    const n = Math.floor(i / porLote) + 1
    lotes.push({ lote: n, codigos: codigos.slice(i, i + porLote), pausa_ms: n > 1 ? 1000 : 0 })
  }
  return lotes
}

export interface EstadoCatalogo {
  porCodigo: { [codigo: string]: LinhaCatalogo }
  pendencias: string[]
}

export function novoCatalogo(): EstadoCatalogo {
  return { porCodigo: {}, pendencias: [] }
}

/** Aplica resultados ao catálogo: replay por código é idempotente (sobrescreve igual). */
export function aplicarResultados(
  e: EstadoCatalogo,
  resultados: ResultadoCodigo[],
): EstadoCatalogo {
  for (const r of resultados) {
    if (r.estado === 'ok') {
      e.porCodigo[r.codigo] = r.linha
    } else {
      const p = r.pendencia
      if (!e.pendencias.includes(p)) e.pendencias.push(p)
    }
  }
  return e
}

/** Cobertura: quantos do lote estão no catálogo; pendências nunca viram produto. */
export function cobertura(
  e: EstadoCatalogo,
  codigos: string[],
): {
  ok: number
  pendentes: number
  total: number
  cobertura_pct: number
} {
  const alvo = Array.from(new Set(codigos))
  const ok = alvo.filter((c) => e.porCodigo[c]).length
  const total = alvo.length
  return {
    ok,
    pendentes: total - ok,
    total,
    cobertura_pct: total === 0 ? 0 : Math.round((ok / total) * 1000) / 10,
  }
}
