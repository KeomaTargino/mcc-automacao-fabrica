/**
 * Dupla conferência — SPEC-2-004 (task 556da315), recorte sintético.
 *
 * Contrato puro + fixtures isoladas. Nenhuma chamada externa: conferências
 * REAIS com etapas encerradas e pontos nominais são a task d77447ab; revisão
 * de divergências e invalidação de aprovações é a 30118f65 (CA-C4). Aqui:
 * registro das duas etapas com escopo por ponto, replay único, comparação
 * independente e fila de consolidação revisável (sem envio).
 *
 * Regras (oráculos T1–T5 da SPEC):
 * - C1: produzido, encaixotado, recebido (expedição) e câmara são registros
 *   distintos; a conferência nunca sobrescreve o produzido.
 * - C2: câmara sem expedição eficaz é bloqueada; ponto sem acesso nega (403
 *   sem pistas); replay do mesmo UUID+hash não duplica.
 * - C3: igualdade decimal na mesma unidade libera fila revisável (sem
 *   transação/envio); divergência ou ausência bloqueia; zero conferido exige
 *   motivo; ausência NUNCA vira 0.
 * - C4 (prova na 30118f65): aprovação com motivo/quantidade final/hashes;
 *   retificação invalida aprovação anterior atomicamente.
 *
 * CORREÇÃO 21/10 (bug do owner: "mesmo preenchendo correto não aprova"):
 * a fila usava a PRIMEIRA conferência de cada etapa (find()); a vigente é a
 * ÚLTIMA (última escrita vence — base do oráculo T4 e da invalidação C4).
 * Troca de find() para findLast() + teste de regressão.
 */

export type EtapaConferencia = 'recebimento_expedicao' | 'entrada_camara'
export type PontoConferencia = 'expedicao' | 'camara_fria'
export type ResultadoConferencia = 'coincidente' | 'divergente'

export interface RegistroConferencia {
  /** UUID do comando — idempotência por etapa (C2). */
  conferencia_id: string
  op_id: string
  versao_op: number
  etapa: EtapaConferencia
  ponto: PontoConferencia
  /** Quantidade conferida pelo conferente (finita, >= 0). */
  quantidade: number
  unidade: string
  local: string
  conferente: string
  /** Obrigatório quando quantidade = 0 (C3). */
  motivo?: string
  criado_em: string
}

export interface SessaoConferencia {
  pontos: PontoConferencia[]
}

export type ResultadoConferenciaRegistro =
  | { estado: 'registrado'; registro: RegistroConferencia }
  | { estado: 'replay'; registro: RegistroConferencia }
  | { estado: 'negado'; motivo: string }
  | { estado: 'conflito_hash'; motivo: string }

function hashConferencia(r: Omit<RegistroConferencia, 'criado_em'>): string {
  return JSON.stringify([
    r.op_id,
    r.versao_op,
    r.etapa,
    r.ponto,
    r.quantidade,
    r.unidade,
    r.local,
    r.motivo ?? null,
  ])
}

/**
 * Registra uma conferência (C1/C2/C3). A expedição exige acesso ao ponto
 * expedicao; a câmara exige camara_fria E expedição eficaz anterior da OP.
 */
export function registrarConferencia(
  entrada: Omit<RegistroConferencia, 'criado_em'>,
  existentes: RegistroConferencia[],
  sessao: SessaoConferencia,
): ResultadoConferenciaRegistro {
  if (!sessao.pontos.includes(entrada.ponto)) {
    return {
      estado: 'negado',
      motivo:
        'Conferência negada: seu acesso não cobre este ponto (C2). Peça ao gestor o ponto no seu perfil.',
    }
  }
  if (!Number.isFinite(entrada.quantidade) || entrada.quantidade < 0) {
    return {
      estado: 'negado',
      motivo: 'Quantidade conferida deve ser finita e maior ou igual a zero (C3).',
    }
  }
  if (entrada.quantidade === 0 && !(entrada.motivo && entrada.motivo.trim().length > 0)) {
    return {
      estado: 'negado',
      motivo:
        'Conferência 0 exige motivo declarado (C3): informe por que nada foi recebido/entrado.',
    }
  }
  if (entrada.etapa === 'entrada_camara') {
    const exp = existentes.find(
      (x) =>
        x.op_id === entrada.op_id &&
        x.versao_op === entrada.versao_op &&
        x.etapa === 'recebimento_expedicao',
    )
    if (!exp) {
      return {
        estado: 'negado',
        motivo:
          'Entrada em câmara bloqueada (C2): a expedição da OP ainda não foi conferida. Registre a primeira etapa antes.',
      }
    }
  }
  const h = hashConferencia(entrada)
  const mesmo = existentes.find((x) => x.conferencia_id === entrada.conferencia_id)
  if (mesmo) {
    if (hashConferencia(mesmo) === h) return { estado: 'replay', registro: mesmo }
    return {
      estado: 'conflito_hash',
      motivo:
        'Conflito (409): mesmo identificador com payload diferente. Recarregue e use identificador novo — nada foi sobrescrito.',
    }
  }
  return { estado: 'registrado', registro: { ...entrada, criado_em: new Date().toISOString() } }
}

export interface QuantidadesOP {
  /** Produzido (realizado eficaz da cozinha) — exibido, nunca sobrescrito. */
  produzido: number
  encaixotado: number
  /** null = conferência ausente — NUNCA vira 0 (C3/T5). */
  recebido_expedicao: number | null
  entrada_camara: number | null
  unidade: string
}

export type EstadoFila = 'bloqueada' | 'revisavel'

export interface Consolidacao {
  op_id: string
  versao_op: number
  quantidades: QuantidadesOP
  /** Deltas por etapa quando conferidas (ex.: encaixotado−produzido). */
  deltas: { encaixotado: number | null; recebido: number | null; camara: number | null }
  pendencias: string[]
  estado: EstadoFila
  /** Igualdade decimal exata na mesma unidade libera revisão local (C3). */
  coincidente: boolean
}

/**
 * Monta a fila de consolidação da OP (C1/C3): quatro quantidades independentes,
 * deltas preservados, ausência/divergência bloqueiam; igualdade exata libera
 * só revisão local (sem transação/envio — o envio é gate da SPEC-2-005).
 *
 * A conferência VIGENTE de cada etapa é a ÚLTIMA registrada (última escrita
 * vence; nova conferência muda o hash e invalida a aprovação anterior — C4).
 */
export function montarFila(
  op: { op_id: string; versao_op: number },
  produzido: number,
  encaixotado: number,
  conferencias: RegistroConferencia[],
): Consolidacao {
  const unidade = 'UN'
  const exp = [...conferencias]
    .reverse()
    .find(
      (c) =>
        c.op_id === op.op_id && c.versao_op === op.versao_op && c.etapa === 'recebimento_expedicao',
    )
  const cam = [...conferencias]
    .reverse()
    .find(
      (c) => c.op_id === op.op_id && c.versao_op === op.versao_op && c.etapa === 'entrada_camara',
    )
  const recebido = exp ? exp.quantidade : null
  const camara = cam ? cam.quantidade : null
  const pendencias: string[] = []
  if (recebido === null)
    pendencias.push('Conferência de expedição ausente — nada é preenchido com 0 (C3).')
  if (camara === null)
    pendencias.push('Conferência de câmara ausente — nada é preenchido com 0 (C3).')
  const deltas = {
    encaixotado: encaixotado - produzido,
    recebido: recebido === null ? null : recebido - encaixotado,
    camara: camara === null ? null : camara - (recebido ?? 0),
  }
  const coincidente =
    recebido !== null &&
    camara !== null &&
    recebido === camara &&
    encaixotado === recebido &&
    produzido === encaixotado
  if (!coincidente && pendencias.length === 0) {
    if (produzido !== encaixotado)
      pendencias.push(
        `Divergência produzido/encaixotado: ${produzido} vs ${encaixotado} (deltas preservados).`,
      )
    if (encaixotado !== recebido)
      pendencias.push(`Divergência encaixotado/recebido: ${encaixotado} vs ${recebido}.`)
    if (recebido !== camara)
      pendencias.push(`Divergência recebido/câmara: ${recebido} vs ${camara}.`)
  }
  return {
    op_id: op.op_id,
    versao_op: op.versao_op,
    quantidades: {
      produzido,
      encaixotado,
      recebido_expedicao: recebido,
      entrada_camara: camara,
      unidade,
    },
    deltas,
    pendencias,
    estado: pendencias.length === 0 ? 'revisavel' : 'bloqueada',
    coincidente,
  }
}

// ---------------------------------------------------------------------------
// Fixtures de demonstração — isoladas; nunca mesclar com dados reais.
// ---------------------------------------------------------------------------

export const OP_CONFERENCIA_DEMO = { op_id: 'OP-S-2-001', versao_op: 2 }

export const SESSAO_EXPEDICAO: SessaoConferencia = { pontos: ['expedicao'] }
export const SESSAO_CAMARA: SessaoConferencia = { pontos: ['camara_fria'] }
