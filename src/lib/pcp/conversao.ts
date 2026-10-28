/**
 * Conversão da unidade de compra para a unidade de estoque — SPEC-3-003, CA-3-11 (RN-03, RN-04).
 *
 * A quantidade de compra só vira unidade de estoque por um FATOR CONFIRMADO por Compras (quem e
 * quando). Sem fator, a quantidade fica na unidade de compra com pendência e o preço não é
 * comparado. Mudar o fator cria versão nova; documentos antigos guardam o fator e a versão que
 * usaram. Nada é inferido pela descrição do produto, e unidade de estoque desconhecida impede o fator.
 */

export interface Fator {
  item: string
  /** null = fator geral do item; com fornecedor = específico daquele fornecedor. */
  fornecedor: string | null
  apresentacao: string
  unidadeCompra: string
  fator: number
  /** Unidade oficial de estoque do cadastro. Desconhecida (null) não aceita fator. */
  unidadeEstoque: string | null
  confirmadoPor: string
  confirmadoEm: string
  versao: number
}

export type NovoFator = Omit<Fator, 'versao'>

export function validarFator(f: NovoFator): { ok: true } | { ok: false; motivos: string[] } {
  const motivos: string[] = []
  if (!String(f.item ?? '').trim()) motivos.push('item obrigatório')
  if (!String(f.apresentacao ?? '').trim()) motivos.push('apresentação de compra obrigatória')
  if (!String(f.unidadeCompra ?? '').trim()) motivos.push('unidade de compra obrigatória')
  if (!Number.isFinite(f.fator) || f.fator <= 0) motivos.push('fator precisa ser maior que zero')
  if (f.unidadeEstoque === null || !String(f.unidadeEstoque).trim()) {
    motivos.push('unidade de estoque desconhecida: o fator não pode ser confirmado')
  }
  if (!String(f.confirmadoPor ?? '').trim()) motivos.push('quem confirmou é obrigatório')
  if (!String(f.confirmadoEm ?? '').trim()) motivos.push('quando foi confirmado é obrigatório')
  return motivos.length === 0 ? { ok: true } : { ok: false, motivos }
}

const mesmaChave = (
  a: { item: string; fornecedor: string | null; apresentacao: string },
  b: typeof a,
) => a.item === b.item && a.fornecedor === b.fornecedor && a.apresentacao === b.apresentacao

/** Mudança de fator = versão nova (maior versão da mesma chave + 1); as anteriores ficam como estão. */
export function acrescentarVersao(
  existentes: Fator[],
  novo: NovoFator,
): { ok: true; lista: Fator[]; fator: Fator } | { ok: false; motivos: string[] } {
  const v = validarFator(novo)
  if (!v.ok) return v
  const anteriores = existentes.filter((e) => mesmaChave(e, novo))
  const versao = anteriores.reduce((m, e) => Math.max(m, e.versao), 0) + 1
  const fator: Fator = { ...novo, versao }
  return { ok: true, lista: [...existentes, fator], fator }
}

/** Fator vigente: o do fornecedor vale mais que o geral; dentro da chave, a maior versão. */
export function fatorVigente(
  fatores: Fator[],
  item: string,
  fornecedor: string | null,
  apresentacao: string,
): Fator | null {
  const pega = (forn: string | null) =>
    fatores
      .filter((f) => f.item === item && f.fornecedor === forn && f.apresentacao === apresentacao)
      .reduce<Fator | null>((m, f) => (m === null || f.versao > m.versao ? f : m), null)
  return (fornecedor !== null ? pega(fornecedor) : null) ?? pega(null)
}

export type ResultadoConversao =
  | {
      estado: 'convertida'
      quantidade: number
      unidade: string
      precoPorUnidadeEstoque: number | null
      fatorUsado: number
      fatorVersao: number
    }
  | {
      estado: 'sem_fator'
      quantidade: number
      unidade: string
      precoPorUnidadeEstoque: null
      pendencias: string[]
    }

/**
 * Converte a quantidade comprada. `precoPorUnidadeCompra` é o preço de UMA unidade de compra (um
 * saco, p. ex.); com fator, o preço passa a valer por unidade de estoque. Sem fator, a quantidade
 * fica como veio e o preço não entra em comparação.
 */
export function converter(
  fatores: Fator[],
  entrada: {
    item: string
    fornecedor: string | null
    apresentacao: string
    unidadeCompra: string
    quantidade: number
    precoPorUnidadeCompra: number | null
  },
): ResultadoConversao {
  const f = fatorVigente(fatores, entrada.item, entrada.fornecedor, entrada.apresentacao)
  if (f === null) {
    return {
      estado: 'sem_fator',
      quantidade: entrada.quantidade,
      unidade: entrada.unidadeCompra,
      precoPorUnidadeEstoque: null,
      pendencias: [
        'sem fator confirmado: quantidade fica em ' +
          entrada.unidadeCompra +
          '; preço não é comparado',
      ],
    }
  }
  if (f.unidadeCompra !== entrada.unidadeCompra || f.unidadeEstoque === null) {
    return {
      estado: 'sem_fator',
      quantidade: entrada.quantidade,
      unidade: entrada.unidadeCompra,
      precoPorUnidadeEstoque: null,
      pendencias: [
        'o fator confirmado é para ' + f.unidadeCompra + ', não para ' + entrada.unidadeCompra,
      ],
    }
  }
  const preco = entrada.precoPorUnidadeCompra
  return {
    estado: 'convertida',
    quantidade: Math.round(entrada.quantidade * f.fator * 1e6) / 1e6,
    unidade: f.unidadeEstoque,
    precoPorUnidadeEstoque:
      preco === null || !Number.isFinite(preco) ? null : Math.round((preco / f.fator) * 1e6) / 1e6,
    fatorUsado: f.fator,
    fatorVersao: f.versao,
  }
}
