/**
 * Reprogramação parcial sem perder apontamentos — SPEC-2-002 (task 87e4af63), CA-P4/T4.
 *
 * Contrato puro + fixtures. Regras da SPEC (seção "Reprogramação parcial"):
 * - Exige editar_programacao; publicar a nova versão exige também publicar_programacao.
 * - Transfere SOMENTE o saldo ainda não iniciado, com a versão esperada da OP.
 * - Nada já iniciado migra nem perde a referência original; quantidade planejada
 *   original e eventos permanecem para auditoria (não somam demanda executável).
 * - Na mesma transação: vínculo origem→destino + quantidade transferida; saldo
 *   executável da origem zerado; destino reservado apenas com o saldo.
 * - Capacidade/calendário do destino validados ANTES do commit; falta de capacidade
 *   ou conflito → NENHUMA transferência/reserva parcial (tudo ou nada).
 * - Replay do mesmo comando → transferência existente (idempotente).
 * - Versão/payload divergente → 409 sem transferência parcial.
 * - OP em sincronizando/resultado_incerto → reprogramação negada.
 * - Oráculo T4: OP100, realizado40 → restante60; origem conserva realizado40,
 *   saldo executável 0 e referência histórica 100; destino 60 uma vez.
 */

export type EstadoOP =
  | 'programada'
  | 'em_execucao'
  | 'aguardando_conferencia'
  | 'conferida'
  | 'aguardando_aprovacao'
  | 'autorizada'
  | 'sincronizando'
  | 'resultado_incerto'
  | 'sincronizada'

export interface OP {
  op_id: string
  versao: number
  produto: string
  unidade: string
  /** Quantidade planejada original — NUNCA alterada pela reprogramação. */
  quantidade_planejada: number
  /** Realizado eficaz (eventos) — permanece na origem. */
  realizado: number
  /** Saldo ainda não iniciado (executável). */
  saldo_executavel: number
  recurso: string
  data: string
  estado: EstadoOP
}

export interface VinculoReprogramacao {
  origem_op: string
  destino_op: string
  quantidade_transferida: number
  motivo: string
  por: string
}

export interface ResultadoReprogramar {
  estado: 'transferido' | 'replay' | 'negado' | 'conflito'
  origem?: OP
  destino?: OP
  vinculo?: VinculoReprogramacao
  motivo?: string
}

function hashComando(op: OP, destinoData: string, motivo: string, conta: string): string {
  return JSON.stringify([op.op_id, op.versao, op.saldo_executavel, destinoData, motivo, conta])
}

/**
 * Reprograma o saldo não iniciado da OP (T4). Tudo ou nada; replay idempotente;
 * versão divergente → 409; estados congelados negam.
 */
export function reprogramarSaldo(
  origem: OP,
  destinoData: string,
  motivo: string,
  conta: { acoes: string[]; usuario: string },
  capacidadeDestino: number | null,
  vinculosExistentes: VinculoReprogramacao[],
  versaoEsperada: number,
): ResultadoReprogramar {
  if (!conta.acoes.includes('editar_programacao')) {
    return {
      estado: 'negado',
      motivo: 'Reprogramar exige a ação editar_programacao (403). Nada foi alterado.',
    }
  }
  if (motivo.trim().length === 0) {
    return { estado: 'negado', motivo: 'Reprogramação exige motivo declarado. Nada foi alterado.' }
  }
  if (origem.versao !== versaoEsperada) {
    return {
      estado: 'conflito',
      motivo:
        'Conflito (409): versão da OP divergente da esperada — recarregue; nenhuma transferência parcial foi efetivada.',
    }
  }
  if (
    origem.estado === 'sincronizando' ||
    origem.estado === 'resultado_incerto' ||
    origem.estado === 'sincronizada'
  ) {
    return {
      estado: 'negado',
      motivo: `Reprogramação negada: OP congelada/sincronizada (${origem.estado}) — não há anulação/reprogramação durante envio ou incerto; após sincronizada, correção vira ocorrência separada.`,
    }
  }
  const h = hashComando(origem, destinoData, motivo, conta.usuario)
  const existente = vinculosExistentes.find(
    (v) => v.origem_op === origem.op_id && v.motivo === motivo && v.por === conta.usuario,
  )
  if (existente) {
    // Replay idempotente: retorna a transferência existente (origem já zerada).
    return {
      estado: 'replay',
      origem: { ...origem, saldo_executavel: 0 },
      vinculo: existente,
      motivo: 'Replay: transferência já existente — nada duplicado.',
    }
  }
  if (origem.saldo_executavel <= 0) {
    return {
      estado: 'negado',
      motivo: 'Saldo executável 0 — nada a transferir; realizado e histórico permanecem na origem.',
    }
  }
  if (capacidadeDestino !== null && origem.saldo_executavel > capacidadeDestino) {
    return {
      estado: 'negado',
      motivo: `Capacidade do destino insuficiente (${origem.saldo_executavel} > ${capacidadeDestino}): nenhuma transferência ou reserva parcial é efetivada.`,
    }
  }
  const destino: OP = {
    op_id: `${origem.op_id}-R${origem.versao + 1}`,
    versao: origem.versao + 1,
    produto: origem.produto,
    unidade: origem.unidade,
    quantidade_planejada: origem.saldo_executavel,
    realizado: 0,
    saldo_executavel: origem.saldo_executavel,
    recurso: origem.recurso,
    data: destinoData,
    estado: 'programada',
  }
  const vinculo: VinculoReprogramacao = {
    origem_op: origem.op_id,
    destino_op: destino.op_id,
    quantidade_transferida: origem.saldo_executavel,
    motivo,
    por: conta.usuario,
  }
  return {
    estado: 'transferido',
    origem: { ...origem, saldo_executavel: 0 },
    destino,
    vinculo,
    motivo: `Transferido ${vinculo.quantidade_transferida} ${origem.unidade} para ${destino.op_id} (${destinoData}); origem conserva realizado ${origem.realizado}, saldo executável 0 e referência histórica ${origem.quantidade_planejada}.`,
  }
}

/**
 * Projeção de demanda executável (T4): a referência histórica da origem NÃO soma
 * demanda; o saldo transferido conta SOMENTE no destino.
 */
export function demandaExecutavel(ops: OP[]): number {
  return ops.reduce((s, o) => s + o.saldo_executavel, 0)
}
