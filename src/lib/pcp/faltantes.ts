/**
 * Lista do que falta cadastrar no Omie — SPEC-3-001, CA-3-02 (RN-01).
 *
 * Código que aparece no estoque, numa ficha ou num pedido e não está no cadastro entra na lista com
 * o código e o lugar onde aparece. A lista só vale quando o catálogo foi lido por inteiro: catálogo
 * incompleto devolve situação própria e lista vazia (nunca "tudo falta"). O sistema não cria
 * produto: esta camada só compara e devolve a lista para o PCP cadastrar no Omie.
 */

export type OrigemOcorrencia = 'estoque' | 'ficha' | 'pedido'

export interface Ocorrencia {
  codigo: string
  origem: OrigemOcorrencia
  /** Onde aparece: local de estoque, produto da ficha, número do pedido. */
  referencia: string
  /** Descrição que a própria fonte trouxe, se trouxe. */
  descricao: string | null
}

export interface ItemFaltante {
  codigo: string
  descricao: string | null
  onde: { origem: OrigemOcorrencia; referencia: string }[]
}

export interface ResultadoFaltantes {
  situacao: 'ok' | 'catalogo_incompleto'
  itens: ItemFaltante[]
  /** Fontes que ainda não têm leitura guardada; o PCP precisa saber o que a lista não cobre. */
  fontes_sem_leitura: OrigemOcorrencia[]
}

function normalizar(codigo: string): string {
  return String(codigo ?? '')
    .trim()
    .toUpperCase()
}

/**
 * Compara as ocorrências com o catálogo. `catalogo` null significa "não lido por inteiro".
 * Ordem estável: por código; dentro do item, por origem e referência. Replay devolve o mesmo.
 */
export function listarFaltantes(
  catalogo: string[] | null,
  ocorrencias: Ocorrencia[],
  fontesSemLeitura: OrigemOcorrencia[] = [],
): ResultadoFaltantes {
  if (catalogo === null) {
    return { situacao: 'catalogo_incompleto', itens: [], fontes_sem_leitura: fontesSemLeitura }
  }
  const noCatalogo: { [c: string]: boolean } = {}
  for (const c of catalogo) noCatalogo[normalizar(c)] = true

  const porCodigo: { [c: string]: ItemFaltante } = {}
  for (const o of ocorrencias) {
    const codigo = normalizar(o.codigo)
    if (!codigo || noCatalogo[codigo]) continue
    const item = porCodigo[codigo] ?? { codigo, descricao: null, onde: [] }
    if (item.descricao === null && o.descricao) item.descricao = o.descricao
    const jaTem = item.onde.some((x) => x.origem === o.origem && x.referencia === o.referencia)
    if (!jaTem) item.onde.push({ origem: o.origem, referencia: o.referencia })
    porCodigo[codigo] = item
  }
  const itens = Object.keys(porCodigo)
    .sort()
    .map((c) => {
      const it = porCodigo[c]
      it.onde.sort((a, b) =>
        a.origem === b.origem
          ? a.referencia < b.referencia
            ? -1
            : 1
          : a.origem < b.origem
            ? -1
            : 1,
      )
      return it
    })
  return { situacao: 'ok', itens, fontes_sem_leitura: fontesSemLeitura }
}

/** O que mudou entre duas leituras: quem saiu da lista foi cadastrado no Omie. */
export function diferencaEntreLeituras(
  anterior: string[],
  atual: string[],
): { cadastrados: string[]; novos: string[] } {
  const a = anterior.map(normalizar)
  const b = atual.map(normalizar)
  return {
    cadastrados: a.filter((c) => b.indexOf(c) < 0).sort(),
    novos: b.filter((c) => a.indexOf(c) < 0).sort(),
  }
}

export const ROTULO_ORIGEM: { [o in OrigemOcorrencia]: string } = {
  estoque: 'Estoque',
  ficha: 'Ficha técnica',
  pedido: 'Pedido',
}
