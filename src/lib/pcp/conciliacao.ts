/**
 * Conciliação de catálogo, unidades e fichas — SPEC-2-001 (task 5d8793fb), recorte REAL.
 *
 * Piloto real aprovado pelo owner (20/10/2026): M011001 — "MISTURA P/COOKIE TRADICIONAL
 * CX C/100 CONGELADO" (família Cookies), com ficha técnica real na fonte (malha).
 *
 * Regras (oráculos C1–C10; CA-D1/D2/D3 + CA-C3):
 * - Unidade oficial é a do cadastro Omie, preservada verbatim (CX aqui) — NUNCA 'UN'
 *   por padrão (defaultUN da F1 retirado; linha legada 'UN' fica INCOMPATÍVEL, sem conversão).
 * - Unidade ausente é `null` + bloqueio — nunca preenchida.
 * - Ficha ausente é `null` + bloqueio — nenhum componente/quantidade inventado.
 * - Itens da ficha preservados VERBATIM (identidade/quantidade/unidade/perda/tipo).
 * - Linha de estoque com unidade ≠ oficial → sinalizada incompatível, saldo preservado,
 *   SEM conversão e SEM soma entre unidades distintas.
 * - Linha de estoque sem unidade recebe a oficial do cadastro (join), sem flag.
 * - Determinístico: replay com as mesmas entradas devolve o mesmo resultado.
 */

export interface FichaItem {
  insumo: string
  descricao: string
  /** null = a fonte não informou — preservado como veio, nada inventado. */
  quantidade: number | null
  unidade: string
  /** null = a fonte não informou — preservado como veio, nada inventado. */
  perda_pct: number | null
  tipo: string
}

export interface LocalEstoque {
  local_id: string
  descricao: string
  padrao: boolean
  inativo: boolean
}

export interface EntradaProduto {
  produto_id: string
  codigo: string
  descricao: string
  unidade: string | null
  ficha: { itens: FichaItem[] } | null
  locais?: LocalEstoque[]
  /** Unidades vistas nas linhas de estoque da conta (para sinalizar divergência). */
  unidades_estoque?: string[]
}

export interface ProdutoConciliado {
  produto_id: string
  codigo: string
  descricao: string
  unidade_oficial: string | null
  ficha: { itens: FichaItem[] } | null
  locais: LocalEstoque[]
  bloqueios: string[]
  unidades_estoque_incompativeis: string[]
}

export type BloqueioConciliacao =
  | 'unidade_ausente'
  | 'ficha_ausente'
  | 'unidade_incompativel_estoque'

/**
 * Concilia um produto real com a fonte: unidade oficial preservada, ficha verbatim,
 * bloqueios explícitos para ausência/divergência. Nada é preenchido por padrão.
 */
export function conciliarProduto(e: EntradaProduto): ProdutoConciliado {
  const bloqueios: BloqueioConciliacao[] = []

  const unidadeBruta = typeof e.unidade === 'string' ? e.unidade.trim() : ''
  const unidadeOficial = unidadeBruta === '' ? null : unidadeBruta
  if (unidadeOficial === null) bloqueios.push('unidade_ausente')

  let ficha: { itens: FichaItem[] } | null = null
  if (e.ficha === null || e.ficha === undefined) {
    bloqueios.push('ficha_ausente')
  } else {
    // Preservação verbatim: cópia item a item, sem reordenação nem conversão.
    ficha = { itens: e.ficha.itens.map((i) => ({ ...i })) }
  }

  const locais: LocalEstoque[] = (e.locais || []).map((l) => ({ ...l }))

  const unidadesEstoque = [
    ...new Set((e.unidades_estoque || []).map((u) => String(u || '').trim()).filter(Boolean)),
  ]
  const incompativeis = unidadeOficial
    ? unidadesEstoque.filter((u) => u !== unidadeOficial).sort()
    : []
  if (incompativeis.length > 0) bloqueios.push('unidade_incompativel_estoque')

  return {
    produto_id: e.produto_id,
    codigo: e.codigo,
    descricao: e.descricao,
    unidade_oficial: unidadeOficial,
    ficha,
    locais,
    bloqueios,
    unidades_estoque_incompativeis: incompativeis,
  }
}

export interface LinhaEstoqueConciliada {
  produto_id: string
  local_id: string
  /** Unidade registrada na linha da fonte (pode ser legada/default — exibida como veio). */
  unidade_registrada: string
  /** Unidade oficial do cadastro (null = desconhecida — nunca 'UN' por padrão). */
  unidade_oficial: string | null
  /** true somente quando a linha tem unidade PRÓPRIA e ela difere da oficial. */
  unidade_incompativel: boolean
  /** Saldo preservado como veio — NUNCA convertido entre unidades. */
  saldo: number | null
}

/**
 * Concilia uma linha de estoque com a unidade oficial do cadastro:
 * divergente → incompatível (saldo preservado, sem conversão); vazia → herda a oficial;
 * oficial null → linha fica sem unidade oficial (nunca 'UN' por padrão).
 */
export function conciliarLinhaEstoque(
  linha: { produto_id: string; local_id: string; unidade?: string; saldo?: number | null },
  unidadeOficial: string | null,
): LinhaEstoqueConciliada {
  const registrada = typeof linha.unidade === 'string' ? linha.unidade.trim() : ''
  const oficial = unidadeOficial === null ? null : String(unidadeOficial).trim() || null
  return {
    produto_id: linha.produto_id,
    local_id: linha.local_id,
    unidade_registrada: registrada,
    unidade_oficial: oficial,
    unidade_incompativel: Boolean(oficial && registrada && oficial !== registrada),
    saldo: linha.saldo === undefined ? null : linha.saldo,
  }
}

/**
 * Mapa dos contratos de leitura provados na conta (CA-D3) — sondas dirigidas de
 * 20/10/2026, todas HTTP 200. A listagem de produtos está VAZIA nesta conta
 * (produto_servico_resumido = []); a consulta dirigida por código é o caminho provado.
 */
export const MAPA_FONTES = {
  piloto: { codigo: 'M011001', aprovado_por: 'owner (opcao 1, 20/10/2026)' },
  produto: {
    endpoint: 'https://app.omie.com.br/api/v1/geral/produtos/',
    call: 'ConsultarProduto',
    chave_codigo: 'codigo',
    autenticacao: 'app_key + app_secret (cofre)',
    provado_em: '2026-10-20',
  },
  produtos_listagem: {
    endpoint: 'https://app.omie.com.br/api/v1/geral/produtos/',
    call: 'ListarProdutosResumido',
    chave_resposta: 'produto_servico_resumido',
    estado_conta: 'listagem_vazia',
    provado_em: '2026-10-20',
  },
  ficha: {
    endpoint: 'https://app.omie.com.br/api/v1/geral/malha/',
    call: 'ConsultarEstrutura',
    chave_itens: 'itens',
    campos_item: [
      'codProdMalha',
      'descrProdMalha',
      'quantProdMalha',
      'unidProdMalha',
      'percPerdaProdMalha',
      'tipoProdMalha',
    ],
    provado_em: '2026-10-20',
  },
  locais: {
    endpoint: 'https://app.omie.com.br/api/v1/estoque/local/',
    call: 'ListarLocaisEstoque',
    chave_resposta: 'locaisEncontrados',
    provado_em: '2026-10-20',
  },
} as const
