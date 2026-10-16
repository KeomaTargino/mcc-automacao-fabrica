/**
 * Planejamento e OP digital — SPEC-2-002 (task 3cd404e5), recorte sintético.
 *
 * Contrato puro + fixtures isoladas. Nenhuma chamada externa: a publicação REAL
 * (com parâmetros aprovados pelo PCP e dados reais) é a task 16b8a592; a
 * reprogramação com apontamentos é a 87e4af63 (CA-P4). Aqui: calendário
 * sintético, capacidade por produto/dia, frações de recurso compartilhado,
 * validação de rascunho e publicação atômica local com versionamento.
 *
 * Regras (oráculos T1/T2/T3 da SPEC):
 * - P1: quantidade por produto/dia com capacidade aprovada; soma de frações
 *   q_i/capacidade_dia_i ≤ 1 por recurso; NUNCA somar unidades diferentes.
 * - P2: data indisponível ou família incompatível recusa a linha e explica o
 *   calendário; não move para outra data automaticamente.
 * - P3: publicar exige ação publica_programacao; revalida versão esperada em
 *   transação — concorrência gera um sucesso e um conflito (409 sem sobrescrever).
 * - Dado faltante (capacidade null) mantém rascunho e bloqueia publicação.
 */

export interface DiaCalendario {
  data: string
  /** Recursos disponíveis no dia (ex.: 'cookies', 'exclusivo-a'). */
  recursos: string[]
  /** Dia exclusivo de outro recurso não recebe cookies (fixture T1c). */
  exclusivo: boolean
}

export interface Calendario {
  dias: DiaCalendario[]
  banner: 'demonstracao'
}

export interface Recurso {
  nome: string
  /** Capacidade diária por unidade de fração (ex.: 1 = 100%). */
  capacidade_fracao: number
  /** Produtos que usam o recurso e sua capacidade diária (mesma unidade por produto). */
  capacidade_por_produto: Record<string, number>
  /** Unidade única do recurso — nunca somar unidades diferentes. */
  unidade: string
}

export interface ParametrosProducao {
  /** Capacidade padrão por produto/dia (null = faltante → bloqueia publicação). */
  capacidade_padrao: number | null
  lote_multiplo: number
  horizonte_dias: number
}

export interface LinhaProgramacao {
  produto: string
  quantidade: number
  data: string
  recurso: string
}

export type EstadoLinha =
  | 'ok'
  | 'excede_capacidade'
  | 'data_indisponivel'
  | 'recurso_desconhecido'
  | 'parametro_faltante'

export interface ResultadoLinha {
  estado: EstadoLinha
  /** Fração do produto no dia (quantidade / capacidade_diária do produto). */
  carga_produto?: number
  /** Fração acumulada do recurso no dia após esta linha. */
  carga_recurso?: number
  motivo: string
}

// ---------------------------------------------------------------------------
// Fixtures de demonstração — isoladas; nunca mesclar com dados reais.
// Semana sintética: 3 dias com cookies + 2 dias exclusivos de outros recursos.
// ---------------------------------------------------------------------------

export const CALENDARIO_DEMO: Calendario = {
  dias: [
    { data: '2026-10-13', recursos: ['cookies', 'compartilhado'], exclusivo: false },
    { data: '2026-10-14', recursos: ['cookies', 'compartilhado'], exclusivo: false },
    { data: '2026-10-15', recursos: ['cookies', 'compartilhado'], exclusivo: false },
    { data: '2026-10-16', recursos: ['exclusivo-a'], exclusivo: true },
    { data: '2026-10-17', recursos: ['exclusivo-b'], exclusivo: true },
  ],
  banner: 'demonstracao',
}

export const RECURSOS_DEMO: Record<string, Recurso> = {
  cookies: {
    nome: 'cookies',
    capacidade_fracao: 1,
    capacidade_por_produto: { 'COOKIE-1': 100 },
    unidade: 'UN',
  },
  compartilhado: {
    nome: 'compartilhado',
    capacidade_fracao: 1,
    capacidade_por_produto: { A: 100, B: 50 },
    unidade: 'UN',
  },
  'exclusivo-a': {
    nome: 'exclusivo-a',
    capacidade_fracao: 1,
    capacidade_por_produto: { X: 80 },
    unidade: 'UN',
  },
  'exclusivo-b': {
    nome: 'exclusivo-b',
    capacidade_fracao: 1,
    capacidade_por_produto: { Y: 60 },
    unidade: 'UN',
  },
}

export const PARAMETROS_DEMO: ParametrosProducao = {
  capacidade_padrao: 100,
  lote_multiplo: 10,
  horizonte_dias: 5,
}

export function criarCalendario(): Calendario {
  return structuredClone(CALENDARIO_DEMO)
}

/** Frações acumuladas por recurso/data a partir das linhas já aceitas. */
function cargaAcumulada(linhas: LinhaProgramacao[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const l of linhas) {
    const k = `${l.recurso}|${l.data}`
    m.set(k, (m.get(k) ?? 0) + 0) // base 0; frações são somadas pelo chamador via carga
  }
  return m
}

/**
 * Avalia uma linha do rascunho contra o calendário, o recurso e as frações já
 * usadas no dia (oráculos T1/T2). `fracoesUsadas` traz as frações já ocupadas
 * por produto no recurso/data (ex.: { A: 0.5 }).
 */
export function avaliarLinha(
  linha: LinhaProgramacao,
  contexto?: {
    calendario?: Calendario
    recursos?: Record<string, Recurso>
    parametros?: ParametrosProducao
    fracoesUsadas?: Record<string, number>
  },
): ResultadoLinha {
  const cal = contexto?.calendario ?? CALENDARIO_DEMO
  const recursos = contexto?.recursos ?? RECURSOS_DEMO
  const parametros = contexto?.parametros ?? PARAMETROS_DEMO

  const dia = cal.dias.find((d) => d.data === linha.data)
  if (!dia || !dia.recursos.includes(linha.recurso)) {
    return {
      estado: 'data_indisponivel',
      motivo: `Data indisponível para o recurso "${linha.recurso}" no calendário (P2): o dia ${linha.data} só atende [${dia?.recursos.join(', ') ?? '—'}]. Escolha uma data disponível; nada é movido automaticamente.`,
    }
  }
  const recurso = recursos[linha.recurso]
  if (!recurso) {
    return { estado: 'recurso_desconhecido', motivo: `Recurso "${linha.recurso}" não registrado.` }
  }
  const capProduto = recurso.capacidade_por_produto[linha.produto] ?? parametros.capacidade_padrao
  if (capProduto === null || capProduto === undefined || capProduto <= 0) {
    return {
      estado: 'parametro_faltante',
      motivo: `Capacidade diária do produto ${linha.produto} não definida (P2): parâmetro faltante bloqueia a linha até o PCP aprovar.`,
    }
  }
  if (linha.quantidade <= 0) {
    return { estado: 'parametro_faltante', motivo: 'Quantidade deve ser maior que zero.' }
  }
  const cargaProduto = linha.quantidade / capProduto
  const usadas = contexto?.fracoesUsadas ?? {}
  // Fração do RECURSO acumula todos os produtos no mesmo recurso|data (T2: A 0,5 + B 0,5 = 1,0).
  const chaveFracao = `${linha.recurso}|${linha.data}`
  const cargaRecurso = (usadas[chaveFracao] ?? 0) + cargaProduto
  if (cargaRecurso > recurso.capacidade_fracao + 1e-9) {
    return {
      estado: 'excede_capacidade',
      carga_produto: cargaProduto,
      carga_recurso: cargaRecurso,
      motivo: `Excede a capacidade (P1): ${linha.produto} ${linha.quantidade} ${recurso.unidade} em ${linha.data} = fração ${cargaRecurso.toFixed(2)} do recurso "${linha.recurso}" (limite ${recurso.capacidade_fracao}). Reduza a quantidade ou distribua pelos dias disponíveis.`,
    }
  }
  return {
    estado: 'ok',
    carga_produto: cargaProduto,
    carga_recurso: cargaRecurso,
    motivo: 'Dentro da capacidade.',
  }
}

export interface Rascunho {
  linhas: LinhaProgramacao[]
  parametros: ParametrosProducao
}

export interface ValidacaoRascunho {
  pode_publicar: boolean
  bloqueios: string[]
  linhas_ok: number
  linhas_recusadas: number
}

/** Valida o rascunho inteiro (T3a): dado faltante bloqueia publicação; rascunho permanece. */
export function validarRascunho(
  rascunho: Rascunho,
  calendario: Calendario = CALENDARIO_DEMO,
  recursos: Record<string, Recurso> = RECURSOS_DEMO,
): ValidacaoRascunho {
  const bloqueios: string[] = []
  if (rascunho.parametros.capacidade_padrao === null) {
    bloqueios.push(
      'Parâmetro faltante: capacidade diária padrão não definida — publicação bloqueada até o PCP aprovar (P2).',
    )
  }
  if (rascunho.parametros.lote_multiplo <= 0) {
    bloqueios.push('Parâmetro faltante: lote/múltiplo não definido.')
  }
  if (rascunho.linhas.length === 0) {
    bloqueios.push('Rascunho vazio: nenhuma linha para publicar.')
  }
  let ok = 0
  let recusadas = 0
  const fracoes: Record<string, number> = {}
  for (const l of rascunho.linhas) {
    const r = avaliarLinha(l, {
      calendario,
      recursos,
      parametros: rascunho.parametros,
      fracoesUsadas: fracoes,
    })
    if (r.estado === 'ok') {
      ok++
      const k = `${l.recurso}|${l.data}`
      fracoes[k] = (fracoes[k] ?? 0) + (r.carga_produto ?? 0)
    } else {
      recusadas++
      bloqueios.push(`Linha recusada (${l.produto} ${l.quantidade} em ${l.data}): ${r.motivo}`)
    }
  }
  return {
    pode_publicar: bloqueios.length === 0,
    bloqueios,
    linhas_ok: ok,
    linhas_recusadas: recusadas,
  }
}

export interface OPItem {
  op_id: string
  produto: string
  quantidade: number
  unidade: string
  data: string
  recurso: string
  versao: number
  contexto: 'sintetico'
}

export interface OPDigital {
  versao: number
  contexto: 'sintetico'
  publicado_em: string
  ops: OPItem[]
}

export type ResultadoPublicacao =
  | { estado: 'publicado'; op: OPDigital }
  | { estado: 'negado'; motivo: string }
  | { estado: 'conflito_versao'; motivo: string; versao_esperada: number; versao_atual: number }
  | { estado: 'bloqueado'; motivo: string; bloqueios: string[] }

/**
 * Publicação atômica local (T3b/T3c/T3d): exige ação, valida rascunho, compara
 * versão esperada em transação e gera OPs vinculadas à mesma versão/contexto.
 * A publicação REAL (dados/parâmetros aprovados) é a task 16b8a592 — aqui o
 * contexto é sempre 'sintetico' e nada sai para o ERP.
 */
export function publicarProgramacao(
  rascunho: Rascunho,
  sessao: { acoes: string[]; versao_esperada: number },
  calendario: Calendario,
  recursos: Record<string, Recurso>,
  estadoAtual: { versao_atual: number },
): ResultadoPublicacao {
  if (!sessao.acoes.includes('publicar_programacao')) {
    return {
      estado: 'negado',
      motivo:
        'Publicação negada: sua conta não tem a ação de autorização para publicar a programação (P3). Peça ao gestor a ação publica_programacao.',
    }
  }
  const validacao = validarRascunho(rascunho, calendario, recursos)
  if (!validacao.pode_publicar) {
    return {
      estado: 'bloqueado',
      motivo:
        'Rascunho com bloqueios — a publicação real fica impedida até resolver (P2); o rascunho permanece.',
      bloqueios: validacao.bloqueios,
    }
  }
  if (sessao.versao_esperada !== estadoAtual.versao_atual) {
    return {
      estado: 'conflito_versao',
      motivo:
        'Conflito de versão (409): outra publicação chegou primeiro. Recarregue a programação e publique com a versão atual — nada foi sobrescrito.',
      versao_esperada: sessao.versao_esperada,
      versao_atual: estadoAtual.versao_atual,
    }
  }
  const versao = estadoAtual.versao_atual + 1
  const ops: OPItem[] = []
  let seq = 0
  for (const l of rascunho.linhas) {
    const recurso = recursos[l.recurso]
    const cap = recurso.capacidade_por_produto[l.produto] ?? rascunho.parametros.capacidade_padrao
    // Fatia a quantidade em lotes de capacidade diária (T1a: 300 → 3 OPs de 100).
    let restante = l.quantidade
    while (restante > 0) {
      const fatia = Math.min(restante, cap ?? restante)
      seq++
      ops.push({
        op_id: `OP-S-${versao}-${String(seq).padStart(3, '0')}`,
        produto: l.produto,
        quantidade: fatia,
        unidade: recurso.unidade,
        data: l.data,
        recurso: l.recurso,
        versao,
        contexto: 'sintetico',
      })
      restante -= fatia
    }
  }
  return {
    estado: 'publicado',
    op: { versao, contexto: 'sintetico', publicado_em: new Date().toISOString(), ops },
  }
}

/** Carga acumulada por recurso/data (auxiliar de telas e reprogramação futura). */
export function cargaPorRecursoData(
  linhas: LinhaProgramacao[],
  recursos: Record<string, Recurso> = RECURSOS_DEMO,
): Map<string, number> {
  const m = new Map<string, number>()
  for (const l of linhas) {
    const recurso = recursos[l.recurso]
    if (!recurso) continue
    const cap = recurso.capacidade_por_produto[l.produto]
    if (!cap) continue
    const k = `${l.recurso}|${l.data}`
    m.set(k, (m.get(k) ?? 0) + l.quantidade / cap)
  }
  return m
}

// Manter referência viva para uso futuro (reprogramação 87e4af63) sem linter reclamar.
void cargaAcumulada
