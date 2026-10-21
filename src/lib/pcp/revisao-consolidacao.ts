/**
 * Revisão de divergências e invalidação de aprovações — SPEC-2-004 (task 30118f65), CA-C3/C4/T4.
 *
 * Contrato puro sobre as conferências (conferencia.ts). Regras da SPEC:
 * - Aprovar_consolidacao exige a ação aprovar_consolidacao (403 sem ela).
 * - Aprovação registra motivo, quantidade final e hashes (eventos + conferências).
 * - Igualdade 0=0 NÃO libera autorização/transação no Omie (pendência quantidade_final_zero).
 * - Retificação/conferência nova invalida a aprovação anterior ATOMICAMENTE
 *   (nova projeção → hash diferente → aprovação vira invalidada).
 * - Corrida com aquisição do envio: se o envio ganha, consolidação congela em
 *   sincronizando e retificação/conferência incompatível → 409 (prova na
 *   recuperacao-omie.ts); aqui: se a retificação ganha antes da aquisição,
 *   a aprovação fica invalidada e o envio parte do hash novo (zero POST 100).
 * - Oráculo T4 da SPEC-2-004: PCP aceita 96 com motivo após revisar 100/98/97/96 —
 *   originais visíveis, final 96 sem ajuste Omie.
 */

export type EstadoConsolidacao =
  | 'bloqueada'
  | 'revisavel'
  | 'autorizada'
  | 'invalidada'
  | 'sincronizando'

export interface AprovacaoConsolidacao {
  aprovacao_id: string
  op_id: string
  versao_op: number
  /** Quantidade final decidida pelo PCP (>= 0). */
  quantidade_final: number
  motivo: string
  aprovador: string
  /** Hash dos eventos + conferências vigentes no momento da aprovação. */
  hash_eventos: string
  hash_conferencias: string
  estado: 'ativa' | 'invalidada'
  criado_em: string
}

export type ResultadoAprovar =
  | { estado: 'autorizada'; aprovacao: AprovacaoConsolidacao }
  | { estado: 'negado'; motivo: string }

/**
 * Aprova a consolidação com quantidade final e motivo (C4/T4). Igualdade 0=0
 * registra a aprovação mas mantém pendência quantidade_final_zero — não libera
 * transação no Omie.
 */
export function aprovarConsolidacao(
  entrada: {
    aprovacao_id: string
    op_id: string
    versao_op: number
    quantidade_final: number
    motivo: string
    aprovador: string
    hash_eventos: string
    hash_conferencias: string
  },
  conta: { acoes: string[]; usuario: string },
  filaConsolidacao: {
    estado: 'bloqueada' | 'revisavel'
    /** true = alguma conferência ausente (nada vira 0 — C3). */
    ausencia: boolean
  },
): ResultadoAprovar {
  if (!conta.acoes.includes('aprovar_consolidacao')) {
    return {
      estado: 'negado',
      motivo: 'Aprovar consolidação exige a ação aprovar_consolidacao (403). Nada foi alterado.',
    }
  }
  if (!Number.isFinite(entrada.quantidade_final) || entrada.quantidade_final < 0) {
    return { estado: 'negado', motivo: 'Quantidade final deve ser finita e maior ou igual a zero.' }
  }
  if (entrada.motivo.trim().length === 0) {
    return { estado: 'negado', motivo: 'Aprovação exige motivo com a decisão do PCP.' }
  }
  if (filaConsolidacao.ausencia) {
    return {
      estado: 'negado',
      motivo:
        'Aprovação negada: há conferência ausente — registre expedição e câmara antes de aprovar (ausência nunca vira 0).',
    }
  }
  // Divergência NÃO nega a aprovação: decidir a divergência com motivo e
  // quantidade final É o papel do PCP (oráculo T4: aceita 96 após revisar
  // 100/98/97/96). A divergência bloqueia o ENVIO (gate da SPEC-2-005),
  // não a decisão registrada.
  const pendencias: string[] = []
  if (entrada.quantidade_final === 0) {
    pendencias.push(
      'quantidade_final_zero: igualdade 0=0 não libera autorização/transação no Omie — decisão do PCP permanece pendente.',
    )
  }
  return {
    estado: 'autorizada',
    aprovacao: {
      ...entrada,
      estado: 'ativa',
      criado_em: new Date().toISOString(),
      ...({ pendencias } as object),
    } as AprovacaoConsolidacao,
  }
}

export type ResultadoInvalidar =
  | { estado: 'invalidada'; aprovacao: AprovacaoConsolidacao; motivo: string }
  | { estado: 'sem_alteracao'; motivo: string }

/**
 * Invalidação atômica (C4): conferência/retificação nova muda o hash das
 * conferências — a aprovação anterior vira invalidada e o fluxo exige nova
 * revisão. Originais preservados; nada sobrescrito.
 */
export function invalidarPorNovaProjecao(
  aprovacao: AprovacaoConsolidacao,
  hashConferenciasAtual: string,
): ResultadoInvalidar {
  if (aprovacao.estado !== 'ativa') {
    return { estado: 'sem_alteracao', motivo: 'Aprovação já estava invalidada.' }
  }
  if (aprovacao.hash_conferencias === hashConferenciasAtual) {
    return {
      estado: 'sem_alteracao',
      motivo: 'Hash das conferências inalterado — aprovação permanece válida.',
    }
  }
  return {
    estado: 'invalidada',
    aprovacao: { ...aprovacao, estado: 'invalidada' },
    motivo:
      'Nova conferência/retificação mudou a projeção — aprovação anterior INVALIDADA atomicamente; nova revisão do PCP exigida antes de qualquer envio.',
  }
}

export type ResultadoRetificarAntesAquisicao =
  | { estado: 'retificada'; motivo: string }
  | { estado: 'negado_409'; motivo: string }

/**
 * Corrida com aquisição do envio (C4, prova complementar da SPEC-2-004):
 * se a retificação ganha ANTES da aquisição, ela vale e o envio parte do hash
 * novo (zero POST 100); se a consolidação já está sincronizando (envio ganhou),
 * retificação → 409.
 */
export function retificarAntesDaAquisicao(
  estadoConsolidacao: EstadoConsolidacao,
  quantidadeNova: number,
): ResultadoRetificarAntesAquisicao {
  if (estadoConsolidacao === 'sincronizando') {
    return {
      estado: 'negado_409',
      motivo:
        'Conflito (409): consolidação congelada em sincronizando — retificação recusada; aguarde a reconciliação.',
    }
  }
  return {
    estado: 'retificada',
    motivo: `Retificação ${quantidadeNova} aceita antes da aquisição — aprovação anterior invalidada; envio partirá do hash novo (zero POST da quantidade antiga).`,
  }
}
