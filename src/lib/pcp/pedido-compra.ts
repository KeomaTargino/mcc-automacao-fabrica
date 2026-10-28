/**
 * Entregas e lançamento da compra no Omie — SPEC-3-006, CA-3-17 e CA-3-18.
 *
 * Acompanhamento é só leitura do Omie. Só compra aprovada (SPEC-3-005) é ligada ou lançada. Com a
 * chave `omie_pedido_compra_escrita` desligada o lançamento responde 423 e zero chamadas; o comprador
 * lança à mão e liga pelo número, conferido na leitura (mesmo fornecedor e mesmos itens, nunca só por
 * valor). Com a chave ligada (simulador na construção) o pedido é gravado UMA vez, com o código de
 * integração igual ao id da compra aprovada; resposta perdida vira "resultado incerto" e só consulta.
 */
import { exigirAcao, type PerfilAcesso } from './acoes-compras.ts'
import { podeVirarPedido, type Aprovacao, type Cotacao, type Requisicao } from './requisicao.ts'

export const CHAVE_PEDIDO_COMPRA = 'omie_pedido_compra_escrita'
export const MENSAGEM_PEDIDO_DESLIGADO = 'lançamento desligado: aguarda autorização do dono'

// ---- Entregas (CA-3-17) ----

export interface LinhaEntrega {
  pedido_id: string
  numero: string | null
  linha_id: string
  fornecedor: string | null
  produto_id: string
  unidade: string | null
  quantidade_pedida: number
  quantidade_recebida: number
  /** AAAA-MM-DD; null = o Omie não trouxe. */
  data_prevista: string | null
  etapa: string | null
  /** Só vale true quando o cancelamento foi comprovado na leitura. */
  cancelado: boolean
}

export interface EntregaCalculada extends LinhaEntrega {
  restante: number
  diasAtraso: number
  atrasado: boolean
  emergencial: boolean
}

const dia = (iso: string) =>
  Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000

/** Restante = pedida − recebida (nunca negativo); atrasa se a previsão passou e ainda resta. Cancelado comprovado não atrasa. */
export function calcularEntregas(
  linhas: LinhaEntrega[],
  hoje: string,
  pedidosEmergenciais: string[] = [],
): EntregaCalculada[] {
  const emerg = new Set(pedidosEmergenciais)
  return linhas.map((l) => {
    const restante = Math.max(
      0,
      Math.round((l.quantidade_pedida - l.quantidade_recebida) * 1e6) / 1e6,
    )
    const dias =
      l.data_prevista && !l.cancelado && restante > 0
        ? Math.max(0, dia(hoje) - dia(l.data_prevista))
        : 0
    return {
      ...l,
      restante,
      diasAtraso: dias,
      atrasado: dias > 0,
      emergencial: emerg.has(l.pedido_id),
    }
  })
}

export function resumoPorFornecedor(
  entregas: EntregaCalculada[],
): { fornecedor: string; emAberto: number; atrasadas: number }[] {
  const m = new Map<string, { fornecedor: string; emAberto: number; atrasadas: number }>()
  for (const e of entregas) {
    if (e.cancelado || e.restante <= 0) continue
    const k = e.fornecedor ?? 'não informado'
    const r = m.get(k) ?? { fornecedor: k, emAberto: 0, atrasadas: 0 }
    r.emAberto++
    if (e.atrasado) r.atrasadas++
    m.set(k, r)
  }
  return [...m.values()]
}

// ---- Compra aprovada → pedido ----

export interface CompraAprovada {
  requisicao: Requisicao
  cotacoes: Cotacao[]
  aprovacao: Aprovacao | null
}

export interface VinculoPedido {
  requisicaoId: string
  codigoIntegracao: string
  numeroOmie: string | null
  origem: 'manual' | 'sistema'
  estado: 'ligado' | 'resultado_incerto'
}

export interface PedidoLido {
  numero: string
  fornecedor: string
  itens: { produto: string; quantidade: number }[]
}

const norm = (c: string) =>
  String(c ?? '')
    .trim()
    .toUpperCase()

export type ResultadoLigacao =
  | { ok: true; vinculo: VinculoPedido }
  | { ok: false; http: 403; erro: 'sem_permissao' }
  | { ok: false; http: 409; erro: 'compra_nao_aprovada' | 'ja_ligada' | 'pedido_ja_ligado' }
  | { ok: false; http: 422; erro: 'pedido_nao_lido' }
  | { ok: false; http: 422; erro: 'pedido_diferente'; diferencas: string[] }

/** Ligação manual: o comprador lançou à mão no Omie e informa o número; confere fornecedor e itens na leitura. */
export function ligarPedido(entrada: {
  perfil: PerfilAcesso | null
  compra: CompraAprovada
  numero: string
  pedido: PedidoLido | null
  vinculos: VinculoPedido[]
}): ResultadoLigacao {
  if (!exigirAcao(entrada.perfil, 'editar_requisicao').permitido)
    return { ok: false, http: 403, erro: 'sem_permissao' }
  const { requisicao: r, cotacoes, aprovacao } = entrada.compra
  if (!podeVirarPedido(r, cotacoes, aprovacao))
    return { ok: false, http: 409, erro: 'compra_nao_aprovada' }
  if (entrada.vinculos.some((v) => v.requisicaoId === r.id))
    return { ok: false, http: 409, erro: 'ja_ligada' }
  const numero = String(entrada.numero ?? '').trim()
  if (entrada.vinculos.some((v) => v.numeroOmie !== null && v.numeroOmie === numero)) {
    return { ok: false, http: 409, erro: 'pedido_ja_ligado' }
  }
  if (!numero || !entrada.pedido || entrada.pedido.numero !== numero)
    return { ok: false, http: 422, erro: 'pedido_nao_lido' }
  const dif: string[] = []
  if (norm(entrada.pedido.fornecedor) !== norm(r.fornecedor)) {
    dif.push(
      'fornecedor: a compra é de ' + r.fornecedor + ' e o pedido é de ' + entrada.pedido.fornecedor,
    )
  }
  const dela = new Set(r.itens.map((i) => norm(i.item)))
  const dele = new Set(entrada.pedido.itens.map((i) => norm(i.produto)))
  for (const i of dela)
    if (!dele.has(i)) dif.push('item ' + i + ' está na compra e não está no pedido')
  for (const i of dele)
    if (!dela.has(i)) dif.push('item ' + i + ' está no pedido e não está na compra')
  if (dif.length > 0) return { ok: false, http: 422, erro: 'pedido_diferente', diferencas: dif }
  return {
    ok: true,
    vinculo: {
      requisicaoId: r.id,
      codigoIntegracao: r.id,
      numeroOmie: numero,
      origem: 'manual',
      estado: 'ligado',
    },
  }
}

// ---- Lançamento (CA-3-18) ----

/** Campos do WSDL de IncluirPedCompra (07-sistemas/pcp/contratos-fase-3.md). */
export interface PayloadIncluirPedido {
  operacao: 'incluir_pedido_compra'
  cabecalho_incluir: { cCodIntPed: string; dDtPrevisao: string; nCodFor: number; cObs: string }
  produtos_incluir: {
    cCodIntItem: string
    cProduto: string
    cUnidade: string
    nQtde: number
    nValUnit: number
  }[]
}

function dataOmie(iso: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ''))
  return m ? m[3] + '/' + m[2] + '/' + m[1] : null
}

export const hashDoPedido = (p: PayloadIncluirPedido) => JSON.stringify(p)

export function montarPayloadPedido(
  c: CompraAprovada,
): { ok: true; payload: PayloadIncluirPedido; hash: string } | { ok: false; motivo: string } {
  const r = c.requisicao
  if (!podeVirarPedido(r, c.cotacoes, c.aprovacao))
    return { ok: false, motivo: 'compra não aprovada ou alterada depois da aprovação' }
  if (!/^\d+$/.test(r.fornecedor))
    return {
      ok: false,
      motivo: 'fornecedor sem código do Omie: cadastre ou informe o código antes de lançar',
    }
  const data = dataOmie(r.dataNecessaria)
  if (!data) return { ok: false, motivo: 'data prevista inválida' }
  const itens: PayloadIncluirPedido['produtos_incluir'] = []
  for (const it of r.itens) {
    const cot = c.cotacoes.find((x) => x.requisicaoId === r.id && x.item === it.item && x.escolhida)
    if (!cot) return { ok: false, motivo: 'item ' + it.item + ' sem cotação escolhida' }
    const q =
      it.quantidadeCompra ?? (cot.unidadeCompra === it.unidadeEstoque ? it.quantidadeEstoque : null)
    if (q === null)
      return {
        ok: false,
        motivo:
          'item ' + it.item + ' sem fator confirmado: não dá para lançar na unidade de compra',
      }
    itens.push({
      cCodIntItem: r.id + '-' + it.item,
      cProduto: it.item,
      cUnidade: cot.unidadeCompra,
      nQtde: q,
      nValUnit: cot.precoPorUnidadeCompra,
    })
  }
  const payload: PayloadIncluirPedido = {
    operacao: 'incluir_pedido_compra',
    cabecalho_incluir: {
      cCodIntPed: r.id,
      dDtPrevisao: data,
      nCodFor: Number(r.fornecedor),
      cObs: r.emergencial ? 'EMERGENCIAL: ' + (r.motivoEmergencia ?? '') : '',
    },
    produtos_incluir: itens,
  }
  return { ok: true, payload, hash: hashDoPedido(payload) }
}

export interface RespostaOmieInclusao {
  respostaChegou: boolean
  efeitoAplicado: boolean
}
export interface AdapterPedido {
  incluir(payload: PayloadIncluirPedido): RespostaOmieInclusao
}

export type ResultadoLancamento =
  | { http: 403; erro: 'sem_permissao' }
  | { http: 409; erro: 'compra_nao_aprovada' | 'ja_ligada' }
  | { http: 422; erro: 'payload_invalido'; motivo: string }
  | { http: 423; erro: 'escrita_desligada'; mensagem: string }
  | {
      http: 200
      estado: 'confirmada' | 'resultado_incerto' | 'falhou_sem_efeito'
      chamadas: 1
      chaveDepois: { ligada: false }
    }

export function lancarPedido(entrada: {
  perfil: PerfilAcesso | null
  compra: CompraAprovada
  chave: { ligada: boolean; escopo: string | null }
  vinculos: VinculoPedido[]
  adapter: AdapterPedido
}): ResultadoLancamento {
  if (!exigirAcao(entrada.perfil, 'editar_requisicao').permitido)
    return { http: 403, erro: 'sem_permissao' }
  const r = entrada.compra.requisicao
  if (!podeVirarPedido(r, entrada.compra.cotacoes, entrada.compra.aprovacao))
    return { http: 409, erro: 'compra_nao_aprovada' }
  if (!entrada.chave.ligada || entrada.chave.escopo !== r.id) {
    return { http: 423, erro: 'escrita_desligada', mensagem: MENSAGEM_PEDIDO_DESLIGADO }
  }
  if (entrada.vinculos.some((v) => v.requisicaoId === r.id)) return { http: 409, erro: 'ja_ligada' }
  const m = montarPayloadPedido(entrada.compra)
  if (!m.ok) return { http: 422, erro: 'payload_invalido', motivo: m.motivo }
  const resp = entrada.adapter.incluir(m.payload)
  const chaveDepois = { ligada: false as const }
  if (!resp.respostaChegou)
    return { http: 200, estado: 'resultado_incerto', chamadas: 1, chaveDepois }
  return {
    http: 200,
    estado: resp.efeitoAplicado ? 'confirmada' : 'falhou_sem_efeito',
    chamadas: 1,
    chaveDepois,
  }
}

export type ModoSimuladorPedido = 'normal' | 'corta_resposta' | 'recusa'

export interface SimuladorPedido {
  adapter: AdapterPedido
  gravacoes: () => number
  consultar: (cCodIntPed: string) => { encontrou: boolean; numero: string | null; itens: number }
}

export function criarSimuladorPedido(modo: ModoSimuladorPedido): SimuladorPedido {
  const pedidos: { [cod: string]: { numero: string; itens: number } } = {}
  let chamadas = 0
  return {
    adapter: {
      incluir(p) {
        chamadas++
        if (modo === 'recusa') return { respostaChegou: true, efeitoAplicado: false }
        const cod = p.cabecalho_incluir.cCodIntPed
        if (pedidos[cod]) return { respostaChegou: true, efeitoAplicado: false }
        pedidos[cod] = {
          numero: String(1000 + Object.keys(pedidos).length + 1),
          itens: p.produtos_incluir.length,
        }
        return { respostaChegou: modo === 'normal', efeitoAplicado: true }
      },
    },
    gravacoes: () => chamadas,
    consultar(cod) {
      const p = pedidos[cod]
      return p
        ? { encontrou: true, numero: p.numero, itens: p.itens }
        : { encontrou: false, numero: null, itens: 0 }
    },
  }
}

/** Depois de um "resultado incerto" ou de uma confirmação: consulta pelo código de integração e liga; nunca grava de novo. */
export function conferirELigar(
  compra: CompraAprovada,
  consulta: { encontrou: boolean; numero: string | null; itens: number },
): { estado: 'ligado' | 'resultado_incerto'; vinculo: VinculoPedido; novaGravacao: false } {
  const r = compra.requisicao
  if (consulta.encontrou && consulta.itens === r.itens.length) {
    return {
      estado: 'ligado',
      novaGravacao: false,
      vinculo: {
        requisicaoId: r.id,
        codigoIntegracao: r.id,
        numeroOmie: consulta.numero,
        origem: 'sistema',
        estado: 'ligado',
      },
    }
  }
  return {
    estado: 'resultado_incerto',
    novaGravacao: false,
    vinculo: {
      requisicaoId: r.id,
      codigoIntegracao: r.id,
      numeroOmie: null,
      origem: 'sistema',
      estado: 'resultado_incerto',
    },
  }
}
