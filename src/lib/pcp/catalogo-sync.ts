/**
 * Sincronização do catálogo real produto a produto — SPEC-3-001, CA-3-01.
 *
 * Camada pura sobre catalogo-dirigido.ts: anda a lista de códigos em sub-lotes pequenos,
 * guarda um cursor para retomar, para no primeiro bloqueio do Omie (HTTP 425 ou "consumo
 * redundante"), registra a hora da próxima tentativa e só troca o catálogo ativo quando o
 * lote novo está completo. Nenhuma função aqui chama o Omie nem grava no Omie: a consulta
 * entra por parâmetro.
 */
import { normalizarProduto, type LinhaCatalogo } from './catalogo-dirigido.ts'

/** Guarda de 12 horas depois de um bloqueio (CL-PEND-006); nunca repetir em laço. */
export const GUARDA_BLOQUEIO_MS = 12 * 60 * 60 * 1000

export type RespostaOmie =
  | {
      tipo: 'ok'
      descricao: string | null
      unidade: string | null
      inativo: string | boolean | null
    }
  | { tipo: 'nao_encontrado' }
  | { tipo: 'bloqueado'; motivo: 'http_425' | 'consumo_redundante' }
  | { tipo: 'erro'; detalhe: string }

export interface EstadoSync {
  /** Lista completa de códigos a consultar, em ordem estável e sem repetição. */
  codigos: string[]
  /** Índice do próximo código a consultar; só avança quando o código foi resolvido. */
  cursor: number
  porCodigo: { [codigo: string]: LinhaCatalogo }
  /** Códigos que o Omie disse não existir: viram a lista de faltantes, nunca produto. */
  naoEncontrados: string[]
  /** ISO-8601 da próxima tentativa permitida; null quando livre. */
  proximaTentativa: string | null
  motivoBloqueio: string | null
}

export interface ResultadoSubLote {
  estado: EstadoSync
  consultados: number
  parou:
    | 'fim_do_sublote'
    | 'fim_da_lista'
    | 'bloqueio_omie'
    | 'erro_transitorio'
    | 'aguardando_guarda'
}

export function novoSync(codigos: string[]): EstadoSync {
  const unicos: string[] = []
  const vistos: { [c: string]: boolean } = {}
  for (const bruto of codigos) {
    const c = String(bruto).trim().toUpperCase()
    if (c && !vistos[c]) {
      vistos[c] = true
      unicos.push(c)
    }
  }
  return {
    codigos: unicos,
    cursor: 0,
    porCodigo: {},
    naoEncontrados: [],
    proximaTentativa: null,
    motivoBloqueio: null,
  }
}

/** Traduz a resposta HTTP do Omie para o tipo usado aqui. */
export function classificarResposta(
  status: number,
  faultstring: string | null,
  json: {
    descricao?: string | null
    unidade?: string | null
    inativo?: string | boolean | null
  } | null,
): RespostaOmie {
  const texto = (faultstring ?? '').toLowerCase()
  if (status === 425) return { tipo: 'bloqueado', motivo: 'http_425' }
  if (texto.includes('consumo redundante'))
    return { tipo: 'bloqueado', motivo: 'consumo_redundante' }
  if (
    status >= 200 &&
    status < 300 &&
    json &&
    json.descricao !== undefined &&
    json.descricao !== null
  ) {
    return {
      tipo: 'ok',
      descricao: json.descricao,
      unidade: json.unidade ?? null,
      inativo: json.inativo ?? null,
    }
  }
  if (status === 404 || (status >= 200 && status < 300)) return { tipo: 'nao_encontrado' }
  if (status >= 500 || status === 0) return { tipo: 'erro', detalhe: 'http_' + status }
  return { tipo: 'nao_encontrado' }
}

/**
 * Consulta até `tamanho` códigos a partir do cursor. Para no primeiro bloqueio ou erro sem avançar o
 * cursor, e não consulta nada enquanto a guarda não vencer. O estado de entrada não é alterado.
 */
export function executarSubLote(
  anterior: EstadoSync,
  consultar: (codigo: string) => RespostaOmie,
  opcoes: { tamanho: number; agora: Date },
): ResultadoSubLote {
  const e: EstadoSync = {
    ...anterior,
    porCodigo: { ...anterior.porCodigo },
    naoEncontrados: anterior.naoEncontrados.slice(),
  }
  if (e.proximaTentativa && opcoes.agora.getTime() < new Date(e.proximaTentativa).getTime()) {
    return { estado: e, consultados: 0, parou: 'aguardando_guarda' }
  }
  e.proximaTentativa = null
  e.motivoBloqueio = null

  let consultados = 0
  while (e.cursor < e.codigos.length && consultados < opcoes.tamanho) {
    const codigo = e.codigos[e.cursor]
    const r = consultar(codigo)
    consultados += 1
    if (r.tipo === 'bloqueado') {
      e.proximaTentativa = new Date(opcoes.agora.getTime() + GUARDA_BLOQUEIO_MS).toISOString()
      e.motivoBloqueio = r.motivo
      return { estado: e, consultados, parou: 'bloqueio_omie' }
    }
    if (r.tipo === 'ok') {
      const n = normalizarProduto(codigo, {
        descricao: r.descricao,
        unidade: r.unidade,
        inativo: r.inativo,
      })
      if (n.estado === 'ok') e.porCodigo[codigo] = n.linha
    } else if (r.tipo === 'nao_encontrado') {
      if (e.naoEncontrados.indexOf(codigo) < 0) e.naoEncontrados.push(codigo)
    } else {
      // Falha que não é bloqueio: o cursor não avança; a próxima chamada tenta o mesmo código.
      return { estado: e, consultados, parou: 'erro_transitorio' }
    }
    e.cursor += 1
  }
  return {
    estado: e,
    consultados,
    parou: e.cursor >= e.codigos.length ? 'fim_da_lista' : 'fim_do_sublote',
  }
}

/** O lote novo só vale quando a lista inteira foi percorrida. */
export function loteCompleto(e: EstadoSync): boolean {
  return e.codigos.length > 0 && e.cursor >= e.codigos.length
}

/**
 * Devolve o catálogo que deve ficar ativo: o novo, se completo; senão o anterior, intacto.
 * Nunca mistura os dois e nunca apaga o anterior.
 */
export function escolherCatalogoAtivo(
  ativoAnterior: { [codigo: string]: LinhaCatalogo },
  novo: EstadoSync,
): { ativo: { [codigo: string]: LinhaCatalogo }; trocou: boolean } {
  if (loteCompleto(novo)) return { ativo: novo.porCodigo, trocou: true }
  return { ativo: ativoAnterior, trocou: false }
}

/** Resumo para a tela: estado da leitura, progresso e hora da próxima tentativa. */
export function resumoSync(e: EstadoSync): {
  situacao: 'ok' | 'em_andamento' | 'bloqueado_omie'
  feitos: number
  total: number
  proximaTentativa: string | null
  naoEncontrados: number
} {
  const situacao = e.motivoBloqueio ? 'bloqueado_omie' : loteCompleto(e) ? 'ok' : 'em_andamento'
  return {
    situacao,
    feitos: e.cursor,
    total: e.codigos.length,
    proximaTentativa: e.proximaTentativa,
    naoEncontrados: e.naoEncontrados.length,
  }
}
