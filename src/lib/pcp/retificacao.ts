/**
 * Retificações sem duplicar eventos — SPEC-2-003 (task 0096ab26), recorte do executor.
 *
 * Guardas de retificação sobre os eventos imutáveis (apontamento.ts/ponto.ts já
 * entregues e aceitos): replay idempotente por UUID+hash, conflito 409 em hash
 * diferente, consulta por UUID após timeout (nenhum novo evento), anulação por
 * quantidade 0 COM motivo, proibição durante envio/incerto (409 estado_congelado),
 * OP/versão incompatível nega e o original permanece preservado (append-only).
 */

export type EstadoEnvio = 'nao_iniciado' | 'enviando' | 'incerto' | 'confirmada'

export interface EventoRetificavel {
  evento_id: string
  op_id: string
  op_versao: number
  ponto: string
  tipo: string
  item: string | null
  quantidade: number
  unidade: string | null
  motivo?: string
  retifica?: string
  autor: string
}

/** Hash determinístico do payload essencial (mesma forma do apontamento.ts). */
export function hashRetificacao(e: {
  op_id: string
  ponto: string
  tipo: string
  item: string | null
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

/**
 * T4 (CA-E2): timeout após persistência — consultar o UUID ANTES de qualquer
 * retry. Encontrou o registro? A operação já foi aplicada; repetir com o mesmo
 * payload é replay (não cria evento novo).
 */
export function buscarEventoPorUUID(
  existentes: EventoRetificavel[],
  evento_id: string,
): EventoRetificavel | null {
  return existentes.find((x) => x.evento_id === evento_id) ?? null
}

export type ResultadoRetificacao =
  | { estado: 'registrado'; evento: EventoRetificavel; original_preservado: true }
  | { estado: 'replay'; evento: EventoRetificavel; original_preservado: true }
  | { estado: 'conflito_hash'; motivo: string; original_preservado: true }
  | { estado: 'negado'; motivo: string; original_preservado: true }

/**
 * Retificação com guardas completas (CA-E2/E4):
 * - durante envio/incerto: 409 estado_congelado — não mutar dados do POST;
 * - OP não publicada: negado;
 * - ponto sem acesso: negado sem pistas;
 * - motivo obrigatório (inclusive para anulação por quantidade 0);
 * - quantidade >= 0 (0 = anulação do efeito, com motivo);
 * - OP/versão incompatível entre o original e o alvo: negado;
 * - mesmo UUID + mesmo hash = replay; mesmo UUID + hash diferente = 409;
 * - o original NUNCA é removido ou alterado (append-only).
 */
export function retificarComGuardas(x: {
  original: EventoRetificavel
  op_alvo: { op_id: string; op_versao: number }
  novaQuantidade: number
  motivo: string
  novoId: string
  estadoOP: string
  envio: EstadoEnvio
  existentes: EventoRetificavel[]
  pontosSessao: string[]
  autor: string
}): ResultadoRetificacao {
  if (x.envio === 'enviando' || x.envio === 'incerto') {
    return {
      estado: 'negado',
      motivo:
        '409 estado_congelado: retificação durante envio ou resultado incerto não é permitida (E2) — os dados usados no POST não podem mudar.',
      original_preservado: true,
    }
  }
  if (x.estadoOP !== 'publicada') {
    return {
      estado: 'negado',
      motivo: `OP em estado "${x.estadoOP}" não recebe retificação (E1).`,
      original_preservado: true,
    }
  }
  if (!x.pontosSessao.includes(x.original.ponto)) {
    return {
      estado: 'negado',
      motivo:
        'Retificação negada: seu acesso não cobre este ponto de produção (E1). Peça ao gestor o ponto no seu perfil.',
      original_preservado: true,
    }
  }
  if (!(x.motivo && x.motivo.trim().length > 0)) {
    return {
      estado: 'negado',
      motivo: 'Retificação exige motivo (E4) — inclusive para anular com quantidade 0.',
      original_preservado: true,
    }
  }
  if (x.novaQuantidade < 0) {
    return {
      estado: 'negado',
      motivo: 'Quantidade retificada não pode ser negativa (E4).',
      original_preservado: true,
    }
  }
  if (x.original.op_id !== x.op_alvo.op_id || x.original.op_versao !== x.op_alvo.op_versao) {
    return {
      estado: 'negado',
      motivo:
        'OP/versão incompatível: o evento original pertence a outra OP ou versão (E4) — retificação anulada.',
      original_preservado: true,
    }
  }
  const novo: EventoRetificavel = {
    evento_id: x.novoId,
    op_id: x.op_alvo.op_id,
    op_versao: x.op_alvo.op_versao,
    ponto: x.original.ponto,
    tipo: x.original.tipo,
    item: x.original.item,
    quantidade: x.novaQuantidade,
    unidade: x.original.unidade,
    motivo: x.motivo,
    retifica: x.original.evento_id,
    autor: x.autor,
  }
  const mesmo = x.existentes.find((e) => e.evento_id === x.novoId)
  if (mesmo) {
    if (hashRetificacao(mesmo) === hashRetificacao(novo)) {
      return { estado: 'replay', evento: mesmo, original_preservado: true }
    }
    return {
      estado: 'conflito_hash',
      motivo:
        'Conflito (409): o mesmo identificador foi usado com payload diferente. Recarregue a tela e registre com um identificador novo — nada foi sobrescrito.',
      original_preservado: true,
    }
  }
  return { estado: 'registrado', evento: novo, original_preservado: true }
}
