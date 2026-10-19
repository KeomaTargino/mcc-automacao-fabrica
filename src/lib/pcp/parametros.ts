/**
 * Parâmetros de produção — SPEC-2-002 (task d2a44349, CA-P1/P2), recorte do executor.
 *
 * Contrato puro: validação, aprovação (gate editar_parametros), replay idempotente
 * e consumo pela publicação real. A tela /parametros usa este contrato.
 *
 * Regras da SPEC:
 * - P2: parâmetro faltante (null/0) bloqueia publicação real; rascunho permanece;
 *   NUNCA preencher faltante com default (0 não é "ok").
 * - Unidades diferentes (UN vs KG) nunca somam — frações são por recurso.
 * - Aprovação exige ação editar_parametros; registra versão, aprovador, hora e
 *   hash determinístico dos valores (reprodutibilidade, SPEC-2-006 S2).
 * - Replay idêntico é idempotente; payload divergente → conflito 409 sem sobrescrever.
 * - Publicação REAL consome parâmetros APROVADOS; a demo (PARAMETROS_DEMO) permanece
 *   isolada e nunca é usada como se fosse aprovada.
 */

export interface RecursoParametros {
  nome: string
  /** Unidade única do recurso; null = faltante → bloqueia. */
  unidade: string | null
  capacidade_fracao: number
  capacidade_por_produto: Record<string, number>
}

export interface Parametros {
  /** Capacidade padrão por produto/dia; null = faltante → bloqueia. */
  capacidade_padrao: number | null
  lote_multiplo: number | null
  horizonte_dias: number | null
  recursos: RecursoParametros[]
}

export interface ValidacaoParametros {
  aprovavel: boolean
  bloqueios: string[]
}

export interface SessaoAprovacao {
  acoes: string[]
  usuario: string
}

export interface AprovacaoParametros {
  versao: number
  aprovador: string
  aprovado_em: string
  hash_parametros: string
  parametros: Parametros
}

export type ResultadoAprovacao =
  | { estado: 'aprovado'; aprovacao: AprovacaoParametros }
  | { estado: 'negado'; motivo: string }
  | { estado: 'replay'; aprovacao: AprovacaoParametros }
  | { estado: 'conflito_versao'; motivo: string }

export type ConsumoPublicacao =
  | { pode_publicar: true; origem: 'aprovada'; aprovacao: AprovacaoParametros }
  | { pode_publicar: false; origem: 'aprovada' | 'demonstracao'; bloqueios: string[] }

/** Hash determinístico dos valores (JSON canônico ordenado). */
function hashParametros(p: Parametros): string {
  const canon = JSON.stringify(p, (_k, v) =>
    v !== null && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  )
  // FNV-1a duplo em hex (determinístico, sem crypto nativo no goja)
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  for (let i = 0; i < canon.length; i++) {
    const c = canon.charCodeAt(i)
    h1 = ((h1 ^ c) * 0x01000193) >>> 0
    h2 = ((h2 + c * 31) * 0x85ebca6b) >>> 0
  }
  return (h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')).repeat(2)
}

/** T1/T2/T3: valida o conjunto de parâmetros; faltante bloqueia, nunca default. */
export function validarParametros(p: Parametros): ValidacaoParametros {
  const bloqueios: string[] = []
  if (p.capacidade_padrao === null || p.capacidade_padrao === undefined) {
    bloqueios.push(
      'Parâmetro faltante: capacidade diária padrão não definida — defina antes de aprovar (P2).',
    )
  } else if (!(p.capacidade_padrao > 0)) {
    bloqueios.push('Parâmetro inválido: capacidade diária padrão deve ser maior que zero.')
  }
  if (p.lote_multiplo === null || p.lote_multiplo === undefined || !(p.lote_multiplo > 0)) {
    bloqueios.push('Parâmetro faltante: lote/múltiplo não definido (deve ser > 0).')
  }
  if (p.horizonte_dias === null || p.horizonte_dias === undefined || !(p.horizonte_dias > 0)) {
    bloqueios.push('Parâmetro faltante: horizonte de dias não definido (deve ser > 0).')
  }
  if (!Array.isArray(p.recursos) || p.recursos.length === 0) {
    bloqueios.push('Parâmetro faltante: nenhum recurso registrado.')
  } else {
    for (const r of p.recursos) {
      if (!r.unidade) {
        bloqueios.push(
          `Parâmetro faltante: unidade do recurso "${r.nome}" não definida — unidades nunca são presumidas (P2).`,
        )
      }
      if (!(r.capacidade_fracao > 0)) {
        bloqueios.push(
          `Parâmetro faltante: fração de capacidade do recurso "${r.nome}" deve ser > 0.`,
        )
      }
    }
  }
  return { aprovavel: bloqueios.length === 0, bloqueios }
}

/** T4: aprovação com gate editar_parametros; registra versão/aprovador/hora/hash. */
export function aprovarParametros(
  p: Parametros,
  sessao: SessaoAprovacao,
  estadoAtual: { versao_atual: number },
): ResultadoAprovacao {
  if (!sessao.acoes.includes('editar_parametros')) {
    return {
      estado: 'negado',
      motivo:
        '403: sua conta não tem a ação de autorização para editar parâmetros (P2). Peça ao gestor a ação editar_parametros.',
    }
  }
  const v = validarParametros(p)
  if (!v.aprovavel) {
    return {
      estado: 'negado',
      motivo: `Parâmetros não aprováveis — resolva antes: ${v.bloqueios.join(' | ')}`,
    }
  }
  return {
    estado: 'aprovado',
    aprovacao: {
      versao: estadoAtual.versao_atual + 1,
      aprovador: sessao.usuario,
      aprovado_em: new Date().toISOString(),
      hash_parametros: hashParametros(p),
      parametros: structuredClone(p),
    },
  }
}

/** T5: replay idêntico idempotente; payload divergente → 409 sem sobrescrever. */
export function replayAprovacao(aprovacao: AprovacaoParametros, p: Parametros): ResultadoAprovacao {
  const hash = hashParametros(p)
  if (hash === aprovacao.hash_parametros) {
    return { estado: 'replay', aprovacao }
  }
  return {
    estado: 'conflito_versao',
    motivo:
      '409: os parâmetros divergem da aprovação registrada — recarregue a tela e reaprove com os valores atuais; nada foi sobrescrito.',
  }
}

/**
 * T6/T1: consumo pela publicação real. Sem aprovação registrada, a origem é
 * 'demonstracao' e a publicação REAL fica bloqueada (a demo continua isolada).
 */
export function consumoPublicacao(
  p: Parametros,
  contexto?: { aprovacao?: AprovacaoParametros },
): ConsumoPublicacao {
  if (contexto?.aprovacao) {
    const v = validarParametros(p)
    if (!v.aprovavel) {
      return { pode_publicar: false, origem: 'aprovada', bloqueios: v.bloqueios }
    }
    return { pode_publicar: true, origem: 'aprovada', aprovacao: contexto.aprovacao }
  }
  return {
    pode_publicar: false,
    origem: 'demonstracao',
    bloqueios: [
      'Publicação real bloqueada: os parâmetros em uso são de DEMONSTRAÇÃO — o PCP precisa aprovar os parâmetros oficiais em /parametros antes de publicar (P2).',
    ],
  }
}
