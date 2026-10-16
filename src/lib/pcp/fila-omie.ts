/**
 * Fila de envio ao Omie com simulação — SPEC-2-005 (task c44c11da), recorte MOCK.
 *
 * Contrato puro + adapter MOCK isolado. NENHUMA chamada real ao ERP: mutantes
 * reais desligados (O1). Contrato real da conta (a2a4ccf1), provas de
 * revogação/reinício/lease/corrida/timeout antes do envio real (4e9a1d0e) e o
 * caso real autorizado (6e38e5a3) são as próximas tasks.
 *
 * Estados da transação (pcp_transacoes_omie, SPEC-2-005):
 *   preparada → autorizada → enviando → confirmada | resultado_incerto | falhou_sem_efeito | bloqueada
 *
 * Regras implementadas (oráculos T1–T4/T6):
 * - O1/T1: sem aprovação de payload, adapter mutante NÃO executa (zero POST);
 *   hash aprovado + payload alterado = bloqueio explícito (invalida aprovação).
 * - O3/T2: trabalhador único — aquisição atômica por (op, revisão, operação) com
 *   lease; segunda aquisição lê estado, não envia.
 * - O3/T6: quantidade final 0 → mutante desabilitado/pendência explícita, zero POST.
 * - O4/T3: mock aplica efeito e corta resposta → resultado_incerto; consulta
 *   encontra concluída → confirmada; POST total = 1 (nunca reenvia).
 * - O4/T4: lease vencido após possível envio NÃO libera POST novo — só consulta/
 *   reconciliação (ausência inconclusiva nunca comprova sem efeito).
 */

export type OperacaoOmie = 'incluir_op' | 'concluir_op'
export type EstadoTransacao =
  | 'preparada'
  | 'autorizada'
  | 'enviando'
  | 'resultado_incerto'
  | 'confirmada'
  | 'falhou_sem_efeito'
  | 'bloqueada'

export interface Transacao {
  transacao_id: string
  op_id: string
  revisao_consolidacao: number
  operacao: OperacaoOmie
  codigo_integracao: string
  quantidade: number
  /** Hash do payload aprovado (O2) — null antes da autorização. */
  payload_hash: string | null
  estado: EstadoTransacao
  /** Lease do trabalhador único (O3); vencido não libera POST novo (O4). */
  lease_ate: string | null
  /** Contador de chamadas mutantes — prova zero-POST/um-POST. */
  posts_mutantes: number
  pendencias: string[]
}

export type AprovacaoPayload = { payload_hash: string; aprovador: string }

export type ResultadoPreparar =
  | { estado: 'preparada'; transacao: Transacao }
  | { estado: 'bloqueada'; transacao: Transacao; motivo: string }

/**
 * Prepara a transação (O1/T1/T6): quantidade <= 0 é bloqueada com pendência
 * explícita (sem fabricar produção positiva nem cancelamento automático);
 * sem aprovação o mutante fica desabilitado (estado preparada, zero POST).
 */
export function prepararTransacao(entrada: {
  transacao_id: string
  op_id: string
  revisao_consolidacao: number
  operacao: OperacaoOmie
  codigo_integracao: string
  quantidade: number
}): ResultadoPreparar {
  const base: Transacao = {
    ...entrada,
    payload_hash: null,
    estado: 'preparada',
    lease_ate: null,
    posts_mutantes: 0,
    pendencias: [],
  }
  if (!Number.isFinite(entrada.quantidade) || entrada.quantidade <= 0) {
    return {
      estado: 'bloqueada',
      transacao: {
        ...base,
        estado: 'bloqueada',
        pendencias: [
          'Quantidade final 0 ou inválida — inclusão/conclusão mutante negada; pendência para decisão do PCP (O1/T6).',
        ],
      },
      motivo:
        'Quantidade final 0 ou inválida: nada é enviado ao ERP; ocorrência local preservada para decisão do PCP.',
    }
  }
  return { estado: 'preparada', transacao: base }
}

/**
 * Autoriza o payload (O2/T1): guarda hash/aprovador; payload alterado depois
 * invalida a aprovação (hash diferente = bloqueio explícito).
 */
export function autorizarPayload(
  t: Transacao,
  aprovacao: AprovacaoPayload,
  payloadAtual: unknown,
): Transacao {
  const hashAtual = JSON.stringify(payloadAtual)
  if (aprovacao.payload_hash !== hashAtual) {
    return {
      ...t,
      estado: 'bloqueada',
      pendencias: [
        ...t.pendencias,
        'Payload alterado após aprovação — hash divergente; aprovação invalidada (O2/T1).',
      ],
    }
  }
  return { ...t, estado: 'autorizada', payload_hash: aprovacao.payload_hash }
}

/** Adapter MOCK — NUNCA chama o ERP. Comportamento injetado pelos testes. */
export type AdapterMock = {
  /** Executa o efeito simulado e decide se a resposta chega (true) ou é cortada (false). */
  enviar: (payload: unknown) => { respostaChegou: boolean; efeitoAplicado: boolean }
}

export type ResultadoEnvio =
  | { estado: 'confirmada'; transacao: Transacao }
  | { estado: 'resultado_incerto'; transacao: Transacao }
  | { estado: 'negado'; motivo: string }

/**
 * Envia com aquisição atômica (O3/T2): só o worker que obtém o lease executa o
 * mutante; resposta cortada → resultado_incerto (O4/T3).
 */
export function enviarComAquisicao(
  t: Transacao,
  payload: unknown,
  adapter: AdapterMock,
  agora: Date,
  leaseMs: number,
  temLease: boolean,
): ResultadoEnvio {
  if (t.estado !== 'autorizada') {
    return {
      estado: 'negado',
      motivo: `Envio negado: transação em estado ${t.estado} — só autorizada envia (O3).`,
    }
  }
  if (!temLease) {
    return {
      estado: 'negado',
      motivo:
        'Aquisição falhou: outro trabalhador detém o lease desta OP/revisão/operação (O3/T2) — leia o estado, não envie.',
    }
  }
  const lease_ate = new Date(agora.getTime() + leaseMs).toISOString()
  const enviando: Transacao = {
    ...t,
    estado: 'enviando',
    lease_ate,
    posts_mutantes: t.posts_mutantes + 1,
  }
  const r = adapter.enviar(payload)
  if (!r.respostaChegou) {
    return { estado: 'resultado_incerto', transacao: { ...enviando, estado: 'resultado_incerto' } }
  }
  if (!r.efeitoAplicado) {
    return {
      estado: 'negado',
      motivo: 'Falha sem efeito comprovada pelo adapter (sem POST aceito).',
    }
  }
  return { estado: 'confirmada', transacao: { ...enviando, estado: 'confirmada' } }
}

/**
 * Consulta/reconciliação (O4/T3/T4): estado incerto ou lease vencido após
 * possível envio → SOMENTE consulta; a consulta conclusiva resolve
 * (confirmada) sem novo POST; consulta inconclusiva NÃO habilita retry.
 */
export function reconciliarPorConsulta(
  t: Transacao,
  consulta: { encontrou: boolean; quantidade: number | null },
): { estado: EstadoTransacao; transacao: Transacao; novoPostAutorizado: false } {
  if (t.estado === 'resultado_incerto' || t.estado === 'enviando') {
    if (consulta.encontrou && consulta.quantidade === t.quantidade) {
      return {
        estado: 'confirmada',
        transacao: { ...t, estado: 'confirmada', posts_mutantes: t.posts_mutantes },
        novoPostAutorizado: false,
      }
    }
    // Ausência inconclusiva: mantém incerto, sem retry mutante.
    return {
      estado: 'resultado_incerto',
      transacao: {
        ...t,
        pendencias: [
          ...t.pendencias,
          'Consulta inconclusiva — ausência não prova ausência de efeito; sem retry automático (O4/T4).',
        ],
      },
      novoPostAutorizado: false,
    }
  }
  return { estado: t.estado, transacao: t, novoPostAutorizado: false }
}

// ---------------------------------------------------------------------------
// Fixtures de demonstração — isoladas; nunca mesclar com dados reais.
// ---------------------------------------------------------------------------

export const OP_FILA_DEMO = {
  op_id: 'OP-S-2-005',
  revisao_consolidacao: 1,
  codigo_integracao: 'AG-OP-S-2-005-1',
}

/** Payload de demonstração para o mock (não é contrato real do Omie). */
export const PAYLOAD_DEMO = { op: 'OP-S-2-005', quantidade: 100, operacao: 'concluir_op' }
