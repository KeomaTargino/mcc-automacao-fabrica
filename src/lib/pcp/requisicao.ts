/**
 * Requisição por fornecedor, cotação e aprovação da compra — SPEC-3-005, CA-3-14, CA-3-15 e CA-3-16.
 *
 * A sugestão não compra: a pessoa decide. A necessidade vira requisição separada por fornecedor;
 * cada item recebe cotações comparadas com o último preço do histórico (SPEC-3-004); quem tem
 * `aprovar_compra` E alçada para o valor aprova ou recusa. Mudou o conteúdo depois da aprovação,
 * a aprovação cai. Requisição não aprovada não vira pedido. Alçada não é presumida: sem alçada
 * cadastrada a aprovação fica parada com o motivo. Tolerância de preço vem dos parâmetros aprovados;
 * sem tolerância a tela mostra a diferença sem julgar.
 */
import { exigirAcao, type PerfilAcesso } from './acoes-compras.ts'
import { avaliarItem, type Excecao } from './bloqueio-item.ts'
import { converter, fatorVigente, type Fator } from './conversao.ts'

export type EstadoRequisicao =
  | 'rascunho'
  | 'em_cotacao'
  | 'em_aprovacao'
  | 'aprovada'
  | 'recusada'
  | 'cancelada'
export const FORNECEDOR_A_DEFINIR = 'a definir'

export interface ItemRequisicao {
  item: string
  fornecedor: string | null
  /** Quantidade na unidade de estoque (como a sugestão traz). */
  quantidadeEstoque: number
  unidadeEstoque: string
  apresentacao: string | null
  unidadeCompra: string | null
  /** Quantidade na unidade de compra; null sem fator confirmado. */
  quantidadeCompra: number | null
  fatorUsado: number | null
  fatorVersao: number | null
  pendencias: string[]
}

export interface Requisicao {
  id: string
  fornecedor: string
  itens: ItemRequisicao[]
  dataNecessaria: string
  emergencial: boolean
  motivoEmergencia: string | null
  estado: EstadoRequisicao
  versao: number
  origem: string[] // chaves "sugestao|versao" ou "manual|id"
  criadoPor: string
  criadoEm: string
}

export interface NecessidadeCompra {
  /** Chave de idempotência: uma requisição por sugestão e versão. */
  origem: string
  item: string
  fornecedor: string | null
  quantidadeEstoque: number
  unidadeEstoque: string
  /** Apresentação e unidade de compra escolhidas; sem elas o item fica só na unidade de estoque. */
  apresentacao?: string | null
  unidadeCompra?: string | null
  dataNecessaria: string
  emergencial?: boolean
  motivoEmergencia?: string
}

export type ResultadoCriacao =
  | {
      ok: true
      requisicoes: Requisicao[]
      jaExistiam: number
      bloqueados: { item: string; mensagem: string }[]
    }
  | { ok: false; http: 403; erro: 'sem_permissao' }
  | { ok: false; http: 422; erro: 'dados_invalidos'; motivos: string[] }

/** Cria uma requisição por fornecedor. Repetir a mesma origem devolve a existente (não duplica). */
export function criarRequisicoes(entrada: {
  perfil: PerfilAcesso | null
  usuario: string
  necessidades: NecessidadeCompra[]
  existentes: Requisicao[]
  fatores: Fator[]
  catalogo: string[] | null
  excecoes: Excecao[]
  agora: Date
  novoId: () => string
}): ResultadoCriacao {
  if (!exigirAcao(entrada.perfil, 'editar_requisicao').permitido)
    return { ok: false, http: 403, erro: 'sem_permissao' }
  const motivos: string[] = []
  const bloqueados: { item: string; mensagem: string }[] = []
  const jaVistas = new Set(entrada.existentes.flatMap((r) => r.origem))
  const novas = new Map<string, Requisicao>()
  let jaExistiam = 0
  for (const n of entrada.necessidades) {
    if (!Number.isFinite(n.quantidadeEstoque) || n.quantidadeEstoque <= 0) {
      motivos.push(n.item + ': quantidade precisa ser maior que zero')
      continue
    }
    if (!n.dataNecessaria) {
      motivos.push(n.item + ': data necessária obrigatória')
      continue
    }
    if (n.emergencial && !String(n.motivoEmergencia ?? '').trim()) {
      motivos.push(n.item + ': compra emergencial exige o motivo')
      continue
    }
    if (jaVistas.has(n.origem)) {
      jaExistiam++
      continue
    }
    const aval = avaliarItem({
      item: n.item,
      catalogo: entrada.catalogo,
      documento: 'requisicao',
      documentoId: n.origem,
      excecoes: entrada.excecoes,
    })
    if (!aval.liberado) {
      bloqueados.push({ item: n.item, mensagem: aval.mensagem })
      continue
    }
    const fornecedor =
      n.fornecedor && n.fornecedor.trim() ? n.fornecedor.trim() : FORNECEDOR_A_DEFINIR
    const f = n.apresentacao
      ? fatorVigente(entrada.fatores, n.item.trim().toUpperCase(), n.fornecedor, n.apresentacao)
      : null
    const usaFator = f !== null && f.unidadeEstoque !== null && f.unidadeCompra === n.unidadeCompra
    const item: ItemRequisicao = {
      item: n.item.trim().toUpperCase(),
      fornecedor: n.fornecedor,
      quantidadeEstoque: n.quantidadeEstoque,
      unidadeEstoque: n.unidadeEstoque,
      apresentacao: n.apresentacao ?? null,
      unidadeCompra: n.unidadeCompra ?? null,
      quantidadeCompra: usaFator
        ? Math.round((n.quantidadeEstoque / (f as Fator).fator) * 1e6) / 1e6
        : null,
      fatorUsado: usaFator ? (f as Fator).fator : null,
      fatorVersao: usaFator ? (f as Fator).versao : null,
      pendencias: usaFator ? [] : ['sem fator confirmado: quantidade só na unidade de estoque'],
    }
    // mesma emergência e mesma data de necessidade ficam na mesma requisição do fornecedor
    const chave =
      fornecedor +
      '|' +
      n.dataNecessaria +
      '|' +
      (n.emergencial ? 'E:' + n.motivoEmergencia!.trim() : 'N')
    let r = novas.get(chave)
    if (!r) {
      r = {
        id: entrada.novoId(),
        fornecedor,
        itens: [],
        dataNecessaria: n.dataNecessaria,
        emergencial: !!n.emergencial,
        motivoEmergencia: n.emergencial ? n.motivoEmergencia!.trim() : null,
        estado: 'rascunho',
        versao: 1,
        origem: [],
        criadoPor: entrada.usuario,
        criadoEm: entrada.agora.toISOString(),
      }
      novas.set(chave, r)
    }
    r.itens.push(item)
    r.origem.push(n.origem)
  }
  if (motivos.length > 0) return { ok: false, http: 422, erro: 'dados_invalidos', motivos }
  return { ok: true, requisicoes: [...novas.values()], jaExistiam, bloqueados }
}

// ---- Cotação ----

export interface Cotacao {
  id: string
  requisicaoId: string
  item: string
  fornecedor: string
  precoPorUnidadeCompra: number
  unidadeCompra: string
  /** null sem fator confirmado: preço só na unidade de compra, fora da comparação. */
  precoPorUnidadeEstoque: number | null
  prazoDias: number
  condicaoPagamento: string
  validade: string | null
  escolhida: boolean
}

export interface ComparacaoCotacao {
  comparavel: boolean
  ultimoPreco: number | null
  diferencaPercentual: number | null
  acimaDaTolerancia: boolean
  mensagem: string
}

/** Diferença para o último preço do histórico; destaque só se houver tolerância aprovada (CL-PEND-001). */
export function compararComHistorico(
  precoPorUnidadeEstoque: number | null,
  ultimoPreco: number | null,
  toleranciaPercentual: number | null,
): ComparacaoCotacao {
  if (precoPorUnidadeEstoque === null) {
    return {
      comparavel: false,
      ultimoPreco,
      diferencaPercentual: null,
      acimaDaTolerancia: false,
      mensagem: 'sem fator confirmado: preço não é comparado',
    }
  }
  if (ultimoPreco === null || ultimoPreco <= 0) {
    return {
      comparavel: false,
      ultimoPreco: null,
      diferencaPercentual: null,
      acimaDaTolerancia: false,
      mensagem: 'sem histórico para comparar',
    }
  }
  const dif = Math.round(((precoPorUnidadeEstoque - ultimoPreco) / ultimoPreco) * 1e4) / 100
  const acima = toleranciaPercentual !== null && dif > toleranciaPercentual
  return {
    comparavel: true,
    ultimoPreco,
    diferencaPercentual: dif,
    acimaDaTolerancia: acima,
    mensagem:
      toleranciaPercentual === null
        ? 'tolerância não cadastrada: mostra só a diferença'
        : acima
          ? 'acima da tolerância de ' + toleranciaPercentual + '%'
          : 'dentro da tolerância',
  }
}

export type ResultadoCotacao =
  | { ok: true; cotacao: Cotacao }
  | { ok: false; http: 403; erro: 'sem_permissao' }
  | { ok: false; http: 409; erro: 'estado_nao_permite' }
  | { ok: false; http: 422; erro: 'dados_invalidos'; motivos: string[] }

export function registrarCotacao(entrada: {
  perfil: PerfilAcesso | null
  requisicao: Requisicao
  item: string
  preco: number
  prazoDias: number
  condicaoPagamento: string
  validade?: string | null
  fatores: Fator[]
  novoId: () => string
}): ResultadoCotacao {
  if (!exigirAcao(entrada.perfil, 'editar_requisicao').permitido)
    return { ok: false, http: 403, erro: 'sem_permissao' }
  const r = entrada.requisicao
  if (r.estado !== 'rascunho' && r.estado !== 'em_cotacao')
    return { ok: false, http: 409, erro: 'estado_nao_permite' }
  const it = r.itens.find((i) => i.item === entrada.item.trim().toUpperCase())
  const motivos: string[] = []
  if (!it) motivos.push('item não está na requisição')
  if (!Number.isFinite(entrada.preco) || entrada.preco <= 0)
    motivos.push('preço precisa ser maior que zero')
  if (!Number.isInteger(entrada.prazoDias) || entrada.prazoDias < 0 || entrada.prazoDias > 365)
    motivos.push('prazo de entrega: inteiro de 0 a 365 dias')
  if (motivos.length > 0 || !it) return { ok: false, http: 422, erro: 'dados_invalidos', motivos }
  const uc = it.unidadeCompra ?? it.unidadeEstoque
  const conv = it.apresentacao
    ? converter(entrada.fatores, {
        item: it.item,
        fornecedor: it.fornecedor,
        apresentacao: it.apresentacao,
        unidadeCompra: uc,
        quantidade: 1,
        precoPorUnidadeCompra: entrada.preco,
      })
    : null
  return {
    ok: true,
    cotacao: {
      id: entrada.novoId(),
      requisicaoId: r.id,
      item: it.item,
      fornecedor: r.fornecedor,
      precoPorUnidadeCompra: entrada.preco,
      unidadeCompra: uc,
      precoPorUnidadeEstoque:
        conv && conv.estado === 'convertida'
          ? conv.precoPorUnidadeEstoque
          : uc === it.unidadeEstoque
            ? entrada.preco
            : null,
      prazoDias: entrada.prazoDias,
      condicaoPagamento: String(entrada.condicaoPagamento ?? '').trim(),
      validade: entrada.validade ?? null,
      escolhida: false,
    },
  }
}

// ---- Alçada e aprovação ----

export interface Alcada {
  aprovador: string
  /** Valor máximo que o aprovador pode aprovar numa requisição. */
  limite: number
  demonstracao: boolean
}

export interface Aprovacao {
  requisicaoId: string
  aprovador: string
  decisao: 'aprovada' | 'recusada'
  valor: number
  alcadaUsada: number | null
  motivo: string
  hora: string
  hash: string
  valida: boolean
}

/** Valor da requisição: cotação escolhida de cada item × quantidade na unidade de compra (ou de estoque, se igual). */
export function valorDaRequisicao(r: Requisicao, cotacoes: Cotacao[]): number | null {
  let total = 0
  for (const it of r.itens) {
    const c = cotacoes.find((x) => x.requisicaoId === r.id && x.item === it.item && x.escolhida)
    if (!c) return null
    const q =
      it.quantidadeCompra ?? (c.unidadeCompra === it.unidadeEstoque ? it.quantidadeEstoque : null)
    if (q === null) return null
    total += q * c.precoPorUnidadeCompra
  }
  return Math.round(total * 100) / 100
}

/** Conteúdo aprovado, em forma canônica: se isto mudar, a aprovação cai. */
export function conteudoParaHash(r: Requisicao, cotacoes: Cotacao[]): string {
  return JSON.stringify({
    fornecedor: r.fornecedor,
    data: r.dataNecessaria,
    emergencial: r.emergencial,
    itens: r.itens
      .map((i) => ({
        item: i.item,
        q: i.quantidadeEstoque,
        qc: i.quantidadeCompra,
        f: i.fatorUsado,
      }))
      .sort((a, b) => (a.item < b.item ? -1 : 1)),
    cotacoes: cotacoes
      .filter((c) => c.requisicaoId === r.id && c.escolhida)
      .map((c) => ({
        item: c.item,
        p: c.precoPorUnidadeCompra,
        u: c.unidadeCompra,
        prazo: c.prazoDias,
      }))
      .sort((a, b) => (a.item < b.item ? -1 : 1)),
  })
}

export type ResultadoDecisao =
  | { ok: true; aprovacao: Aprovacao; requisicao: Requisicao }
  | { ok: false; http: 403; erro: 'sem_permissao' }
  | { ok: false; http: 409; erro: 'estado_nao_permite' | 'conteudo_mudou' }
  | { ok: false; http: 422; erro: 'sem_cotacao_escolhida' | 'sem_motivo' }
  | { ok: false; http: 423; erro: 'alcada_nao_cadastrada'; motivo: string }
  | {
      ok: false
      http: 403
      erro: 'acima_da_alcada'
      valor: number
      limite: number
      proximaAlcada: string | null
    }

export function decidirCompra(entrada: {
  perfil: PerfilAcesso | null
  aprovador: string
  requisicao: Requisicao
  cotacoes: Cotacao[]
  alcadas: Alcada[]
  decisao: 'aprovada' | 'recusada'
  motivo?: string
  agora: Date
}): ResultadoDecisao {
  if (!exigirAcao(entrada.perfil, 'aprovar_compra').permitido)
    return { ok: false, http: 403, erro: 'sem_permissao' }
  const r = entrada.requisicao
  if (r.estado !== 'em_aprovacao') return { ok: false, http: 409, erro: 'estado_nao_permite' }
  const motivo = String(entrada.motivo ?? '').trim()
  if (entrada.decisao === 'recusada' && motivo.length < 3)
    return { ok: false, http: 422, erro: 'sem_motivo' }
  const valor = valorDaRequisicao(r, entrada.cotacoes)
  if (valor === null) return { ok: false, http: 422, erro: 'sem_cotacao_escolhida' }
  let alcadaUsada: number | null = null
  if (entrada.decisao === 'aprovada') {
    if (entrada.alcadas.length === 0) {
      return {
        ok: false,
        http: 423,
        erro: 'alcada_nao_cadastrada',
        motivo: 'alçada não cadastrada: a aprovação real fica parada',
      }
    }
    const minha = entrada.alcadas.find((a) => a.aprovador === entrada.aprovador)
    if (!minha || valor > minha.limite) {
      const maior = [...entrada.alcadas]
        .filter((a) => a.limite >= valor)
        .sort((a, b) => a.limite - b.limite)[0]
      return {
        ok: false,
        http: 403,
        erro: 'acima_da_alcada',
        valor,
        limite: minha?.limite ?? 0,
        proximaAlcada: maior ? maior.aprovador : null,
      }
    }
    alcadaUsada = minha.limite
  }
  const aprovacao: Aprovacao = {
    requisicaoId: r.id,
    aprovador: entrada.aprovador,
    decisao: entrada.decisao,
    valor,
    alcadaUsada,
    motivo,
    hora: entrada.agora.toISOString(),
    hash: conteudoParaHash(r, entrada.cotacoes),
    valida: true,
  }
  return {
    ok: true,
    aprovacao,
    requisicao: { ...r, estado: entrada.decisao, versao: r.versao + 1 },
  }
}

/** Se o conteúdo atual não bate com o hash aprovado, a aprovação é invalidada e a requisição volta para aprovação. */
export function reavaliarAprovacao(
  r: Requisicao,
  cotacoes: Cotacao[],
  aprovacao: Aprovacao,
): { requisicao: Requisicao; aprovacao: Aprovacao; invalidada: boolean } {
  if (
    r.estado !== 'aprovada' ||
    !aprovacao.valida ||
    aprovacao.hash === conteudoParaHash(r, cotacoes)
  ) {
    return { requisicao: r, aprovacao, invalidada: false }
  }
  return {
    requisicao: { ...r, estado: 'em_aprovacao', versao: r.versao + 1 },
    aprovacao: { ...aprovacao, valida: false },
    invalidada: true,
  }
}

/** RN-06: só requisição aprovada, com aprovação válida e conteúdo igual ao aprovado, pode virar pedido (SPEC-3-006). */
export function podeVirarPedido(
  r: Requisicao,
  cotacoes: Cotacao[],
  aprovacao: Aprovacao | null,
): boolean {
  return (
    r.estado === 'aprovada' &&
    !!aprovacao &&
    aprovacao.valida &&
    aprovacao.decisao === 'aprovada' &&
    aprovacao.hash === conteudoParaHash(r, cotacoes)
  )
}

export type ResultadoEdicao =
  | { ok: true; requisicao: Requisicao }
  | { ok: false; http: 403; erro: 'sem_permissao' }
  | { ok: false; http: 409; erro: 'conflito_de_versao' | 'estado_nao_permite' }

/** Altera a quantidade de um item. Versão esperada obrigatória (409 se outra alteração chegou antes). */
export function alterarQuantidade(entrada: {
  perfil: PerfilAcesso | null
  requisicao: Requisicao
  versaoEsperada: number
  item: string
  quantidadeEstoque: number
}): ResultadoEdicao {
  if (!exigirAcao(entrada.perfil, 'editar_requisicao').permitido)
    return { ok: false, http: 403, erro: 'sem_permissao' }
  const r = entrada.requisicao
  if (r.versao !== entrada.versaoEsperada)
    return { ok: false, http: 409, erro: 'conflito_de_versao' }
  if (r.estado === 'cancelada' || r.estado === 'recusada')
    return { ok: false, http: 409, erro: 'estado_nao_permite' }
  return {
    ok: true,
    requisicao: {
      ...r,
      versao: r.versao + 1,
      itens: r.itens.map((i) =>
        i.item === entrada.item.trim().toUpperCase()
          ? {
              ...i,
              quantidadeEstoque: entrada.quantidadeEstoque,
              quantidadeCompra: i.fatorUsado
                ? Math.round((entrada.quantidadeEstoque / i.fatorUsado) * 1e6) / 1e6
                : null,
            }
          : i,
      ),
    },
  }
}

/** Envia para aprovação: exige uma cotação escolhida por item. */
export function enviarParaAprovacao(
  perfil: PerfilAcesso | null,
  r: Requisicao,
  cotacoes: Cotacao[],
): { ok: true; requisicao: Requisicao } | { ok: false; http: 403 | 409 | 422; erro: string } {
  if (!exigirAcao(perfil, 'editar_requisicao').permitido)
    return { ok: false, http: 403, erro: 'sem_permissao' }
  if (r.estado !== 'rascunho' && r.estado !== 'em_cotacao')
    return { ok: false, http: 409, erro: 'estado_nao_permite' }
  if (valorDaRequisicao(r, cotacoes) === null)
    return { ok: false, http: 422, erro: 'sem_cotacao_escolhida' }
  return { ok: true, requisicao: { ...r, estado: 'em_aprovacao', versao: r.versao + 1 } }
}
