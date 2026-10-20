/**
 * Produção por ponto — SPEC-2-003 (task 64ac4f85), recorte do executor.
 *
 * Liga eventos de apontamento à OP publicada: incrementos por execução do
 * ponto (cozinha 40+60=100), encaixotamento como registro independente,
 * previsto pela ficha congelada (só realizado_cozinha), anulação por
 * retificação 0, encerramento de cada ponto com hash da sua projeção e
 * congelamento durante envio/incerto (409 estado_congelado).
 *
 * Regras (oráculos da SPEC-2-003):
 * - realizado_cozinha / realizado_encaixotamento são INCREMENTOS por execução;
 *   retificação substitui o valor eficaz de exatamente um evento.
 * - Consumo previsto usa a soma eficaz do realizado_cozinha na unidade-base da
 *   ficha congelada, NUNCA encaixotamento.
 * - Perda declarada é separada (categoriza consumo; não gera retirada extra).
 * - Encerrar ponto exige realizado eficaz > 0 ou declaração 0 com motivo;
 *   hash determinístico da projeção; replay idempotente.
 * - Evento/retificação depois do encerramento (antes da aquisição do envio)
 *   invalida encerramento/conferência/aprovação; durante envio/incerto → 409.
 */

export type TipoPonto =
  | 'retirada'
  | 'adicional'
  | 'devolucao'
  | 'perda_declarada'
  | 'realizado_cozinha'
  | 'realizado_encaixotamento'
  | 'retificacao'

export type Ponto = 'cozinha' | 'encaixotamento' | 'expedicao' | 'camara_fria'

export interface EventoPonto {
  id: string
  op_id: string
  op_versao: number
  tipo: TipoPonto
  /** null em realizado_* (resultado do ponto, não é insumo). */
  item: string | null
  quantidade: number
  unidade: string | null
  ponto: Ponto
  autor: string
  criado_em: string
  motivo?: string
  /** Evento alvo quando tipo = retificacao. */
  evento_alvo?: string
}

export interface FichaCongelada {
  base_produto: number
  unidade_produto: string
  componente: { insumo: string; quantidade: number; unidade: string }
}

export interface SessaoPontos {
  pontos: Ponto[]
}

/** Retificações eficazes: mapa evento_alvo → quantidade eficaz. */
function retificacoes(eventos: EventoPonto[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const r of eventos) {
    if (r.tipo === 'retificacao' && r.evento_alvo) m.set(r.evento_alvo, r.quantidade)
  }
  return m
}

/** Soma eficaz do realizado do ponto: incrementos somam; retificação substitui o valor do alvo. */
export function somaRealizadoPonto(eventos: EventoPonto[], ponto: Ponto): number {
  const tipo = `realizado_${ponto}` as TipoPonto
  const retifs = retificacoes(eventos)
  let total = 0
  for (const e of eventos) {
    if (e.tipo !== tipo) continue
    total += retifs.has(e.id) ? (retifs.get(e.id) as number) : e.quantidade
  }
  return total
}

export interface ConsumoPonto {
  item: string
  unidade: string
  liquido: number
  retiradas: number
  adicionais: number
  devolucoes: number
  /** Separada — categoriza consumo, nunca somada ao líquido nem inferida. */
  perda_declarada: number
}

export interface ProjecaoOP {
  cozinha: number
  encaixotamento: number
  /** null = indisponível (sem ficha compatível com o realizado_cozinha). */
  previsto: number | null
  consumo: ConsumoPonto[]
}

/** Projeção da OP: realizados por ponto, consumo líquido por insumo e previsto pela ficha. */
export function projetarOP(eventos: EventoPonto[], ficha: FichaCongelada | null): ProjecaoOP {
  const retifs = retificacoes(eventos)
  const acc = new Map<string, ConsumoPonto>()
  let unidadeCozinha: string | null = null
  for (const e of eventos) {
    if (e.tipo === 'retificacao') continue
    if (e.tipo === 'realizado_cozinha') {
      if (unidadeCozinha === null) unidadeCozinha = e.unidade
      continue
    }
    if (e.tipo === 'realizado_encaixotamento') continue
    const q = retifs.has(e.id) ? (retifs.get(e.id) as number) : e.quantidade
    const k = `${e.item}|${e.unidade ?? 'null'}`
    let c = acc.get(k)
    if (!c) {
      c = {
        item: e.item as string,
        unidade: e.unidade ?? 'desconhecida',
        liquido: 0,
        retiradas: 0,
        adicionais: 0,
        devolucoes: 0,
        perda_declarada: 0,
      }
      acc.set(k, c)
    }
    if (e.tipo === 'retirada') {
      c.retiradas += q
      c.liquido += q
    } else if (e.tipo === 'adicional') {
      c.adicionais += q
      c.liquido += q
    } else if (e.tipo === 'devolucao') {
      c.devolucoes += q
      c.liquido -= q
    } else if (e.tipo === 'perda_declarada') {
      c.perda_declarada += q
    }
  }
  const cozinha = somaRealizadoPonto(eventos, 'cozinha')
  const comp = ficha?.componente
  const compativel =
    ficha && comp && unidadeCozinha !== null && ficha.unidade_produto === unidadeCozinha
  const previsto = compativel
    ? (cozinha / (ficha as FichaCongelada).base_produto) * comp!.quantidade
    : null
  const consumo = [...acc.values()].map((c) => ({
    ...c,
    diferenca:
      previsto !== null && c.item === comp!.insumo && c.unidade === comp!.unidade
        ? c.liquido - (previsto as number)
        : null,
  }))
  return {
    cozinha,
    encaixotamento: somaRealizadoPonto(eventos, 'encaixotamento'),
    previsto,
    consumo,
  }
}

export interface EncerramentoPonto {
  op_id: string
  op_versao: number
  ponto: Ponto
  total: number
  hash: string
  declaracao_zero: boolean
  autor: string
  encerrado_em: string
}

function hashProjecao(op_id: string, ponto: Ponto, total: number, ids: string[]): string {
  return JSON.stringify([op_id, ponto, total, [...ids].sort()])
}

export type ResultadoEncerramento =
  | { estado: 'encerrado'; registro: EncerramentoPonto }
  | { estado: 'replay'; registro: EncerramentoPonto }
  | { estado: 'negado'; motivo: string }

/**
 * Encerra um ponto da OP com hash da sua projeção. Exige realizado eficaz > 0
 * ou declaração explícita de zero (evento realizado 0 com motivo). Replay com
 * a mesma projeção retorna o registro existente (idempotente).
 */
export function encerrarPonto(x: {
  eventos: EventoPonto[]
  ponto: Ponto
  ficha: FichaCongelada | null
  sessao: SessaoPontos
  encerramentos: EncerramentoPonto[]
  estadoOP: string
  envio: string | null
  autor: string
}): ResultadoEncerramento {
  if (x.estadoOP !== 'publicada') {
    return {
      estado: 'negado',
      motivo: `OP em estado "${x.estadoOP}" não aceita encerramento (E1).`,
    }
  }
  if (x.envio === 'enviando' || x.envio === 'incerto' || x.envio === 'sincronizada') {
    return {
      estado: 'negado',
      motivo: '409 estado_congelado: envio em curso/incerto — dados do POST não podem mudar (E2).',
    }
  }
  if (!x.sessao.pontos.includes(x.ponto)) {
    return {
      estado: 'negado',
      motivo:
        'Encerramento negado: seu acesso não cobre este ponto de produção (E1). Peça ao gestor o ponto no seu perfil.',
    }
  }
  const total = somaRealizadoPonto(x.eventos, x.ponto)
  const declaracaoZero = x.eventos.some(
    (e) =>
      e.tipo === (`realizado_${x.ponto}` as TipoPonto) &&
      e.quantidade === 0 &&
      e.motivo &&
      e.motivo.trim().length > 0,
  )
  if (total === 0 && !declaracaoZero) {
    return {
      estado: 'negado',
      motivo:
        'Encerramento exige realizado eficaz maior que zero ou declaração de zero com motivo (E1).',
    }
  }
  const eficazes = x.eventos
    .filter((e) => e.tipo === (`realizado_${x.ponto}` as TipoPonto))
    .map((e) => e.id)
  const hash = hashProjecao(x.eventos[0]?.op_id ?? '', x.ponto, total, eficazes)
  const existente = x.encerramentos.find((r) => r.ponto === x.ponto && r.hash === hash)
  if (existente) return { estado: 'replay', registro: existente }
  const registro: EncerramentoPonto = {
    op_id: x.eventos[0]?.op_id ?? '',
    op_versao: x.eventos[0]?.op_versao ?? 1,
    ponto: x.ponto,
    total,
    hash,
    declaracao_zero: total === 0,
    autor: x.autor,
    encerrado_em: new Date().toISOString(),
  }
  return { estado: 'encerrado', registro }
}

export type VereditoPosEncerramento =
  | { ok: true; invalida: ['encerramento', 'conferencia', 'aprovacao'] | [] }
  | { ok: false; motivo: string }

/**
 * Pode um novo evento/retificação ser aceito depois do encerramento do ponto?
 * - Sem encerramento: ok, nada a invalidar.
 * - Encerrado sem envio em curso: ok, mas o evento INVALIDA encerramento,
 *   conferência e aprovação (nova conferência exigida).
 * - Durante envio/incerto/sincronizada: 409 estado_congelado — não mutar dados
 *   usados no POST.
 */
export function podeRegistrarAposEncerramento(x: {
  encerrado: boolean
  envio: string | null
}): VereditoPosEncerramento {
  if (!x.encerrado) return { ok: true, invalida: [] }
  if (x.envio === 'enviando' || x.envio === 'incerto' || x.envio === 'sincronizada') {
    return {
      ok: false,
      motivo:
        '409 estado_congelado: evento/retificação durante envio ou resultado incerto não é permitido (E2).',
    }
  }
  return { ok: true, invalida: ['encerramento', 'conferencia', 'aprovacao'] }
}
