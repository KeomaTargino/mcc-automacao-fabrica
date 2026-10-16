/**
 * Aceitar sugestão → rascunho — SPEC-2-006 (task 8bb4ef77), CA-S3/T7, recorte sintético.
 *
 * Contrato puro. Regras (oráculo T7 da SPEC):
 * - Conta SEM editar_programacao: aceitar → negado (403 sem pistas) e zero rascunho.
 * - Conta COM editar_programacao: aceitar cria RASCUNHO no próprio escopo;
 *   NÃO publica programação e NÃO envia pedido de compra (gates mantidos).
 * - Replay do mesmo aceitar (mesma sugestão/hash) não duplica rascunho.
 * - Sugestão alterada (versão/hash divergente) → 409, exige recálculo/revisão.
 * - Publicação acima da capacidade continua negada (rascunho não publica).
 */

export type AcaoConta = 'consultar' | 'editar_programacao'

export interface SugestaoAceitavel {
  id: string
  tipo: 'producao' | 'compra'
  item: string
  unidade: string
  quantidade: number
  /** Hash do conteúdo da sugestão calculada (memória reproduzível). */
  hash_conteudo: string
  versao_parametros: string
  estado: 'calculada' | 'bloqueada'
}

export interface Rascunho {
  rascunho_id: string
  sugestao_id: string
  tipo: 'producao' | 'compra'
  item: string
  unidade: string
  quantidade: number
  /** Rascunho NUNCA publica nem compra: gates explícitos. */
  publicado: false
  pedido_compra_enviado: false
  criado_por: string
  hash_sugestao: string
}

export type ResultadoAceitar =
  | { estado: 'rascunho_criado'; rascunho: Rascunho }
  | { estado: 'replay'; rascunho: Rascunho }
  | { estado: 'negado'; motivo: string }
  | { estado: 'conflito'; motivo: string }

function hashRascunho(s: SugestaoAceitavel, conta: string): string {
  return JSON.stringify([s.id, s.hash_conteudo, s.versao_parametros, conta])
}

/**
 * Aceita uma sugestão calculada (T7). Sugestão bloqueada não é aceitável;
 * sem editar_programacao nega sem pistas; hash divergente = conflito 409;
 * replay idempotente; rascunho criado NUNCA publica nem envia compra.
 */
export function aceitarSugestao(
  sugestao: SugestaoAceitavel,
  conta: { acoes: AcaoConta[]; usuario: string },
  rascunhosExistentes: Rascunho[],
): ResultadoAceitar {
  if (!conta.acoes.includes('editar_programacao')) {
    return {
      estado: 'negado',
      motivo:
        'Aceitar sugestão exige a ação editar_programacao (403). Peça ao gestor a concessão no seu perfil.',
    }
  }
  if (sugestao.estado !== 'calculada') {
    return {
      estado: 'negado',
      motivo:
        'Sugestão bloqueada (faltante) não pode ser aceita — resolva as pendências e recalcule.',
    }
  }
  const h = hashRascunho(sugestao, conta.usuario)
  const existente = rascunhosExistentes.find(
    (r) => r.rascunho_id === `RD-${sugestao.id}-${conta.usuario}`,
  )
  if (existente) {
    const conteudoAtual = JSON.stringify([
      sugestao.tipo,
      sugestao.item,
      sugestao.quantidade,
      sugestao.unidade,
    ])
    if (existente.hash_sugestao === h && sugestao.hash_conteudo === conteudoAtual)
      return { estado: 'replay', rascunho: existente }
    return {
      estado: 'conflito',
      motivo:
        'Conflito (409): sugestão alterada desde o rascunho — recalcule e revise antes de aceitar de novo.',
    }
  }
  if (
    sugestao.hash_conteudo !==
    JSON.stringify([sugestao.tipo, sugestao.item, sugestao.quantidade, sugestao.unidade])
  ) {
    return {
      estado: 'conflito',
      motivo:
        'Conflito (409): hash da sugestão divergente do conteúdo — recalcule antes de aceitar.',
    }
  }
  return {
    estado: 'rascunho_criado',
    rascunho: {
      rascunho_id: `RD-${sugestao.id}-${conta.usuario}`,
      sugestao_id: sugestao.id,
      tipo: sugestao.tipo,
      item: sugestao.item,
      unidade: sugestao.unidade,
      quantidade: sugestao.quantidade,
      publicado: false,
      pedido_compra_enviado: false,
      criado_por: conta.usuario,
      hash_sugestao: h,
    },
  }
}

/**
 * Gate de publicação do rascunho (T4/T7): publicar exige editar_programacao E
 * capacidade suficiente; rascunho acima da capacidade é negado (a publicação
 * real por área é a task 16b8a592 — aqui apenas o gate é provado).
 */
export function publicarRascunho(
  rascunho: Rascunho,
  conta: { acoes: AcaoConta[]; usuario: string },
  capacidadeDia: number | null,
): { estado: 'negado' | 'gate_ok'; motivo: string } {
  if (!conta.acoes.includes('editar_programacao')) {
    return { estado: 'negado', motivo: 'Publicar exige editar_programacao (403).' }
  }
  if (capacidadeDia !== null && rascunho.quantidade > capacidadeDia) {
    return {
      estado: 'negado',
      motivo: `Publicação negada: ${rascunho.quantidade} ${rascunho.unidade} excede a capacidade diária (${capacidadeDia}). Reduza ou reprograme (excedente declarado).`,
    }
  }
  return {
    estado: 'gate_ok',
    motivo: 'Rascunho apto ao fluxo de publicação por área (task 16b8a592 — fora deste recorte).',
  }
}
