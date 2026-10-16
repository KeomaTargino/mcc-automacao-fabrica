/**
 * Apontamentos na origem — SPEC-2-003 (task be180fc1), recorte sintético.
 *
 * Contrato puro + fixtures isoladas. Nenhuma chamada externa: ligar eventos à OP
 * publicada REAL e acessos por ponto é a task 64ac4f85; retificação com guards
 * de envio é a 0096ab26. Aqui: registro de eventos imutáveis com idempotência,
 * consumo líquido vs previsto pela ficha, perda declarada separada e
 * retificação auditável que preserva o original.
 *
 * Regras (oráculos T1–T5 da SPEC):
 * - E1: OP cancelada/sincronizando/incerta/sincronizada não recebe evento;
 *   ponto sem acesso nega (403 sem pistas); insumo/perda q>0; realizado q>=0
 *   com motivo se 0; unidade null bloqueia (nada é presumido).
 * - E2: mesmo UUID + mesmo hash = replay (registro existente, não duplica);
 *   mesmo UUID + hash diferente = conflito 409.
 * - E3: líquido = retiradas + adicionais − devoluções; previsto = realizado
 *   eficaz × componente/base_ficha (só com ficha compatível); perda declarada
 *   é separada e não se soma duas vezes.
 * - E4: retificação cria evento novo com motivo e referência ao original;
 *   original preservado; líquido passa a usar a quantidade retificada.
 */

export type TipoEvento = 'retirada' | 'adicional' | 'devolucao' | 'perda' | 'realizado'
export type Ponto = 'cozinha' | 'encaixotamento' | 'expedicao' | 'camara_fria'
export type EstadoOP = 'publicada' | 'cancelada' | 'sincronizando' | 'incerta' | 'sincronizada'

export interface EventoApontamento {
  /** UUID do comando — chave de idempotência (E2). */
  evento_id: string
  op_id: string
  ponto: Ponto
  tipo: TipoEvento
  item: string
  quantidade: number
  /** null = desconhecida — bloqueia o apontamento (nada é presumido). */
  unidade: string | null
  /** Obrigatório para realizado 0 e para retificação. */
  motivo?: string
  /** Referência ao evento_id original quando o evento retifica outro. */
  retifica?: string
  autor: string
  criado_em: string
}

export interface SessaoPonto {
  pontos: Ponto[]
}

const OP_BLOQUEADAS: EstadoOP[] = ['cancelada', 'sincronizando', 'incerta', 'sincronizada']

/** Hash determinístico do payload essencial (E2: replay vs conflito). */
export function hashEvento(e: {
  op_id: string
  ponto: Ponto
  tipo: TipoEvento
  item: string
  quantidade: number
  unidade: string | null
  motivo?: string
  retifica?: string
}): string {
  return JSON.stringify([
    e.op_id,
    e.ponto,
    e.tipo,
    e.item,
    e.quantidade,
    e.unidade,
    e.motivo ?? null,
    e.retifica ?? null,
  ])
}

export type ResultadoRegistro =
  | { estado: 'registrado'; evento: EventoApontamento }
  | { estado: 'replay'; evento: EventoApontamento }
  | { estado: 'negado'; motivo: string }
  | { estado: 'conflito_hash'; motivo: string }

/**
 * Registra um evento de apontamento (E1/E2). O servidor fixa autor/hora; aqui
 * o autor vem da sessão e a hora é gerada no registro (prova T4: replay não
 * cria novo evento).
 */
export function registrarEvento(
  entrada: Omit<EventoApontamento, 'criado_em'>,
  estadoOP: EstadoOP,
  existentes: EventoApontamento[],
  sessao: SessaoPonto,
): ResultadoRegistro {
  if (OP_BLOQUEADAS.includes(estadoOP)) {
    return {
      estado: 'negado',
      motivo: `OP em estado "${estadoOP}" não recebe evento nem retificação operacional (E1).`,
    }
  }
  if (!sessao.pontos.includes(entrada.ponto)) {
    return {
      estado: 'negado',
      motivo:
        'Registro negado: seu acesso não cobre este ponto de produção (E1). Peça ao gestor o ponto no seu perfil.',
    }
  }
  if (entrada.tipo !== 'realizado' && entrada.quantidade <= 0) {
    return {
      estado: 'negado',
      motivo:
        'Quantidade deve ser maior que zero para retirada, adicional, devolução ou perda (E1).',
    }
  }
  if (entrada.tipo === 'realizado' && entrada.quantidade < 0) {
    return { estado: 'negado', motivo: 'Realizado não pode ser negativo (E1).' }
  }
  if (
    entrada.tipo === 'realizado' &&
    entrada.quantidade === 0 &&
    !(entrada.motivo && entrada.motivo.trim().length > 0)
  ) {
    return {
      estado: 'negado',
      motivo: 'Realizado 0 exige motivo declarado (E1): informe por que a etapa não produziu.',
    }
  }
  if (entrada.unidade === null) {
    return {
      estado: 'negado',
      motivo:
        'Unidade desconhecida bloqueia o apontamento (nada é presumido) — resolva a unidade oficial no cadastro.',
    }
  }
  const h = hashEvento(entrada)
  const mesmo = existentes.find((x) => x.evento_id === entrada.evento_id)
  if (mesmo) {
    if (hashEvento(mesmo) === h) {
      return { estado: 'replay', evento: mesmo }
    }
    return {
      estado: 'conflito_hash',
      motivo:
        'Conflito (409): o mesmo identificador foi usado com payload diferente. Recarregue a tela e registre com um identificador novo — nada foi sobrescrito.',
    }
  }
  const evento: EventoApontamento = { ...entrada, criado_em: new Date().toISOString() }
  return { estado: 'registrado', evento }
}

export interface FichaSimples {
  /** Quantidade de produto acabado que a ficha rende (base). */
  base_produto: number
  unidade_produto: string
  componentes: { insumo: string; quantidade: number; unidade: string }[]
}

export interface ConsumoItem {
  item: string
  unidade: string
  liquido: number
  retiradas: number
  adicionais: number
  devolucoes: number
  /** Perda declarada — separada, nunca inferida (E3). */
  perda_declarada: number
  /** null = cálculo indisponível (sem ficha compatível). */
  previsto: number | null
  diferenca: number | null
  calculo_disponivel: boolean
}

/**
 * Consumo líquido por item/unidade (E3): retificações substituem o original no
 * cálculo (o original permanece no histórico, E4); perda declarada é separada.
 * Previsto só existe com ficha compatível (mesma unidade do realizado).
 */
export function consumoLiquido(
  eventos: EventoApontamento[],
  ficha: FichaSimples | null,
  realizadoEficaz: number,
  unidadeRealizado: string | null,
): ConsumoItem[] {
  const retificados = new Set(eventos.filter((e) => e.retifica).map((e) => e.retifica as string))
  const efetivos = eventos.filter((e) => !retificados.has(e.evento_id))
  const acc = new Map<string, ConsumoItem>()
  for (const e of efetivos) {
    if (e.tipo === 'realizado') continue
    const k = `${e.item}|${e.unidade ?? 'null'}`
    let c = acc.get(k)
    if (!c) {
      c = {
        item: e.item,
        unidade: e.unidade ?? 'desconhecida',
        liquido: 0,
        retiradas: 0,
        adicionais: 0,
        devolucoes: 0,
        perda_declarada: 0,
        previsto: null,
        diferenca: null,
        calculo_disponivel: false,
      }
      acc.set(k, c)
    }
    if (e.tipo === 'retirada') {
      c.retiradas += e.quantidade
      c.liquido += e.quantidade
    } else if (e.tipo === 'adicional') {
      c.adicionais += e.quantidade
      c.liquido += e.quantidade
    } else if (e.tipo === 'devolucao') {
      c.devolucoes += e.quantidade
      c.liquido -= e.quantidade
    } else if (e.tipo === 'perda') {
      c.perda_declarada += e.quantidade
    }
  }
  const comp = ficha?.componentes[0]
  const fichaCompativel =
    ficha &&
    comp &&
    unidadeRealizado !== null &&
    ficha.unidade_produto === unidadeRealizado &&
    comp.unidade !== null
  for (const c of acc.values()) {
    if (fichaCompativel && comp && c.item === comp.insumo && c.unidade === comp.unidade) {
      c.previsto = (realizadoEficaz / ficha!.base_produto) * comp.quantidade
      c.diferenca = c.liquido - c.previsto
      c.calculo_disponivel = true
    }
  }
  return [...acc.values()]
}

/**
 * Retificação auditável (E4): cria evento NOVO com motivo obrigatório e
 * referência ao original; o original permanece preservado no histórico.
 */
export function retificarEvento(
  original: EventoApontamento,
  novaQuantidade: number,
  motivo: string,
  novoId: string,
  estadoOP: EstadoOP,
  existentes: EventoApontamento[],
  sessao: SessaoPonto,
): ResultadoRegistro {
  if (!(motivo && motivo.trim().length > 0)) {
    return { estado: 'negado', motivo: 'Retificação exige motivo (E4).' }
  }
  if (novaQuantidade < 0) {
    return { estado: 'negado', motivo: 'Quantidade retificada não pode ser negativa (E4).' }
  }
  return registrarEvento(
    {
      evento_id: novoId,
      op_id: original.op_id,
      ponto: original.ponto,
      tipo: original.tipo,
      item: original.item,
      quantidade: novaQuantidade,
      unidade: original.unidade,
      motivo,
      retifica: original.evento_id,
      autor: original.autor,
    },
    estadoOP,
    existentes,
    sessao,
  )
}

// ---------------------------------------------------------------------------
// Fixtures de demonstração — isoladas; nunca mesclar com dados reais.
// ---------------------------------------------------------------------------

export const OP_DEMO = { op_id: 'OP-S-2-001', produto: 'COOKIE-1', estado: 'publicada' as EstadoOP }

export const FICHA_DEMO: FichaSimples = {
  base_produto: 100,
  unidade_produto: 'UN',
  componentes: [{ insumo: 'INS-1', quantidade: 5, unidade: 'KG' }],
}

export const SESSAO_DEMO: SessaoPonto = { pontos: ['cozinha'] }
