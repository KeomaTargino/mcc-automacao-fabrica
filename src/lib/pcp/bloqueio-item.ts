/**
 * Item fora do cadastro do Omie não entra em compra — SPEC-3-003, CA-3-10 (RN-01, RN-02).
 *
 * Requisição, cotação e recebimento de item que não está no catálogo real são bloqueados com
 * "cadastrar no Omie antes de comprar". Exceção só com a ação autorizar_excecao_compra e um motivo;
 * fica "pendente de regularização" até o item aparecer no catálogo, e o painel conta as abertas.
 * Catálogo não lido por inteiro não prova que o item existe: bloqueia com mensagem própria.
 */
import { exigirAcao, type PerfilAcesso } from './acoes-compras.ts'

export type DocumentoCompra = 'requisicao' | 'cotacao' | 'recebimento'

export const MENSAGEM_CADASTRAR = 'cadastrar no Omie antes de comprar'
export const MENSAGEM_CATALOGO_INDISPONIVEL =
  'não foi possível conferir o cadastro do Omie agora; tente de novo mais tarde'

export interface Excecao {
  item: string
  documento: DocumentoCompra
  documentoId: string
  motivo: string
  autorizadoPor: string
  autorizadoEm: string
  estado: 'aberta' | 'regularizada'
}

const norm = (c: string) =>
  String(c ?? '')
    .trim()
    .toUpperCase()

export type AvaliacaoItem =
  | { liberado: true; via: 'catalogo' }
  | { liberado: true; via: 'excecao'; pendenteDeRegularizacao: true }
  | { liberado: false; motivo: 'fora_do_catalogo' | 'catalogo_indisponivel'; mensagem: string }

export function avaliarItem(entrada: {
  item: string
  catalogo: string[] | null
  documento: DocumentoCompra
  documentoId: string
  excecoes: Excecao[]
}): AvaliacaoItem {
  const item = norm(entrada.item)
  if (entrada.catalogo === null) {
    return {
      liberado: false,
      motivo: 'catalogo_indisponivel',
      mensagem: MENSAGEM_CATALOGO_INDISPONIVEL,
    }
  }
  if (entrada.catalogo.some((c) => norm(c) === item)) return { liberado: true, via: 'catalogo' }
  const excecao = entrada.excecoes.find(
    (x) =>
      norm(x.item) === item &&
      x.documento === entrada.documento &&
      x.documentoId === entrada.documentoId &&
      x.estado === 'aberta',
  )
  if (excecao) return { liberado: true, via: 'excecao', pendenteDeRegularizacao: true }
  return { liberado: false, motivo: 'fora_do_catalogo', mensagem: MENSAGEM_CADASTRAR }
}

export type ResultadoExcecao =
  | { ok: true; excecao: Excecao; criada: boolean }
  | { ok: false; http: 403; erro: 'sem_permissao' }
  | { ok: false; http: 422; erro: 'sem_motivo'; motivo: string }

/** Uma exceção por item e documento; repetir o pedido devolve a mesma. Sem motivo, recusada. */
export function autorizarExcecao(entrada: {
  perfil: PerfilAcesso | null
  usuario: string
  item: string
  documento: DocumentoCompra
  documentoId: string
  motivo: string
  existentes: Excecao[]
  agora: Date
}): ResultadoExcecao {
  if (!exigirAcao(entrada.perfil, 'autorizar_excecao_compra').permitido) {
    return { ok: false, http: 403, erro: 'sem_permissao' }
  }
  const motivo = String(entrada.motivo ?? '').trim()
  if (motivo.length < 3) {
    return { ok: false, http: 422, erro: 'sem_motivo', motivo: 'informe o motivo da exceção' }
  }
  const ja = entrada.existentes.find(
    (x) =>
      norm(x.item) === norm(entrada.item) &&
      x.documento === entrada.documento &&
      x.documentoId === entrada.documentoId,
  )
  if (ja) return { ok: true, excecao: ja, criada: false }
  return {
    ok: true,
    criada: true,
    excecao: {
      item: norm(entrada.item),
      documento: entrada.documento,
      documentoId: entrada.documentoId,
      motivo,
      autorizadoPor: entrada.usuario,
      autorizadoEm: entrada.agora.toISOString(),
      estado: 'aberta',
    },
  }
}

/** Fecha as exceções cujo item já está no catálogo real (a regularização). Não apaga nada. */
export function regularizar(excecoes: Excecao[], catalogo: string[] | null): Excecao[] {
  if (catalogo === null) return excecoes
  const no = new Set(catalogo.map(norm))
  return excecoes.map((x) =>
    x.estado === 'aberta' && no.has(norm(x.item)) ? { ...x, estado: 'regularizada' } : x,
  )
}

export function contarAbertas(excecoes: Excecao[]): number {
  return excecoes.filter((x) => x.estado === 'aberta').length
}
