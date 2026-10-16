/**
 * Sugestões com memória de cálculo — SPEC-2-006 (task 0baec76e), recorte sintético.
 *
 * Contrato puro + fixtures isoladas. Nenhuma chamada externa: aprovação do método
 * (CL-006) e dados reais são a task 2ea1e7ab; aceitar→rascunho é a 8bb4ef77; fluxo
 * integrado é a 0d876150. Aqui: cálculo determinístico com memória reproduzível,
 * bloqueio por faltante (S1) e oráculos de lote/compra da SPEC.
 *
 * baseline90-v1 é PROPOSTA de configuração (não regra já aprovada). Nesta task o
 * cálculo roda apenas sobre fixtures sintéticas com o método proposto.
 *
 * Fórmulas propostas (SPEC-2-006):
 *   media_diaria      = vendas_liquidas90 / 90
 *   projecao          = media_diaria × horizonte_dias × (1 + margem)
 *   demanda_alvo      = max(projecao, pedidos_firmes_no_horizonte)
 *   necessidade       = max(0, demanda_alvo + estoque_minimo - saldo_oficial_utilizavel - producao_programada_nao_realizada)
 *   sugestao          = 0 se necessidade = 0; senão teto(max(necessidade, lote_minimo)/multiplo) × multiplo
 *   consumo_insumo    = soma(q_produto × componente_por_unidade)
 *   falta_insumo      = max(0, consumo + minimo_insumo - saldo_insumo - compras_confirmadas_a_receber_no_horizonte)
 *   sugestao_compra   = 0 se falta = 0; senão teto(max(falta, lote_minimo)/multiplo) × multiplo
 *
 * Regras: projeção e pedido firme NUNCA se somam (usa-se o máximo); faltante
 * produz quantidade null (nunca default); saldo negativo permanece sinalizado;
 * recebimento desconhecido bloqueia (não vira 0).
 */

export type TipoSugestao = 'producao' | 'compra'
export type EstadoSugestao = 'calculada' | 'bloqueada'

export interface EntradasProducao {
  /** Vendas líquidas dos últimos 90 dias (cancelamentos/devoluções já deduzidos). */
  vendas_liquidas90: number
  /** Dias de horizonte da projeção (ex.: 7). */
  horizonte_dias: number
  /** Margem comercial (0.2 = 20%). */
  margem: number
  /** Estoque mínimo aprovado. */
  estoque_minimo: number
  /** Saldo oficial utilizável (pode ser negativo — permanece sinalizado). */
  saldo_oficial_utilizavel: number
  /** Produção já programada e ainda não realizada (OPs em aberto). */
  producao_programada_nao_realizada: number
  /** Pedidos oficiais firmes no horizonte — null quando o mapa de firmeza não existe. */
  pedidos_firmes_no_horizonte: number | null
  /** Múltiplo de lote aprovado (arredonda para cima). */
  multiplo_lote: number
  /** Lote mínimo aprovado. */
  lote_minimo: number
  /** Capacidade diária do recurso (aplicada DEPOIS do arredondamento). */
  capacidade_dia: number | null
}

export interface EntradasCompra {
  /** Consumo do insumo: soma(q_produto × componente_por_unidade). */
  consumo_insumo: number
  minimo_insumo: number
  saldo_insumo: number
  /** Compras confirmadas a receber no horizonte — null quando o contrato não existe. */
  compras_confirmadas_a_receber: number | null
  multiplo_lote: number
  lote_minimo: number
}

export interface MemoriaCalculo {
  formula_id: string
  versao_parametros: string
  entradas: Record<string, unknown>
  passos: { nome: string; valor: number | null; formula: string }[]
  resultado_bruto: number | null
  resultado_arredondado: number | null
  excedente: number | null
  pendencias: string[]
}

export interface Sugestao {
  id: string
  tipo: TipoSugestao
  item: string
  unidade: string
  periodo: string
  quantidade: number | null
  estado: EstadoSugestao
  memoria: MemoriaCalculo
}

function tetoMultiplo(valor: number, multiplo: number): number {
  return Math.ceil(valor / multiplo) * multiplo
}

/**
 * Calcula a sugestão de PRODUÇÃO (CA-S1/S2). Faltante (firmeza ausente, cobertura
 * incompleta, entrada não finita) → quantidade null + pendências, nunca default.
 */
export function calcularSugestaoProducao(
  id: string,
  item: string,
  entradas: EntradasProducao,
): Sugestao {
  const pendencias: string[] = []
  const passos: MemoriaCalculo['passos'] = []
  const formula_id = 'baseline90-v1'
  const versao_parametros = 'sintetico-fixture'

  const finitos = Object.entries(entradas).every(([k, v]) =>
    v === null ? true : Number.isFinite(v as number),
  )
  if (!finitos) pendencias.push('Entrada não finita — cálculo bloqueado (S1).')
  if (entradas.pedidos_firmes_no_horizonte === null) {
    pendencias.push(
      'Mapa de pedidos firmes ausente — termo firme é null e a sugestão fica bloqueada (S1).',
    )
  }

  const bloqueado = pendencias.length > 0
  const media = bloqueado ? null : entradas.vendas_liquidas90 / 90
  const projecao = bloqueado ? null : media * entradas.horizonte_dias * (1 + entradas.margem)
  const alvo =
    bloqueado || entradas.pedidos_firmes_no_horizonte === null
      ? null
      : Math.max(projecao as number, entradas.pedidos_firmes_no_horizonte)
  const necessidade =
    alvo === null
      ? null
      : Math.max(
          0,
          alvo +
            entradas.estoque_minimo -
            entradas.saldo_oficial_utilizavel -
            entradas.producao_programada_nao_realizada,
        )

  let arredondado: number | null = null
  let excedente: number | null = null
  if (necessidade !== null) {
    arredondado =
      necessidade === 0
        ? 0
        : tetoMultiplo(Math.max(necessidade, entradas.lote_minimo), entradas.multiplo_lote)
    if (entradas.capacidade_dia !== null && arredondado > entradas.capacidade_dia) {
      excedente = arredondado - entradas.capacidade_dia
    }
  }

  passos.push({ nome: 'media_diaria', valor: media, formula: 'vendas_liquidas90 / 90' })
  passos.push({
    nome: 'projecao',
    valor: projecao,
    formula: 'media_diaria × horizonte_dias × (1 + margem)',
  })
  passos.push({
    nome: 'demanda_alvo',
    valor: alvo,
    formula: 'max(projecao, pedidos_firmes_no_horizonte) — NUNCA soma',
  })
  passos.push({
    nome: 'necessidade',
    valor: necessidade,
    formula: 'max(0, alvo + estoque_minimo - saldo_utilizavel - producao_programada)',
  })
  passos.push({ nome: 'resultado_bruto', valor: necessidade, formula: 'necessidade' })
  passos.push({
    nome: 'resultado_arredondado',
    valor: arredondado,
    formula: 'teto(max(necessidade, lote_minimo)/multiplo) × multiplo; necessidade 0 → 0',
  })
  passos.push({
    nome: 'excedente',
    valor: excedente,
    formula: 'arredondado - capacidade_dia quando excede',
  })

  return {
    id,
    tipo: 'producao',
    item,
    unidade: 'UN',
    periodo: 'horizonte-90',
    quantidade: arredondado,
    estado: pendencias.length > 0 ? 'bloqueada' : 'calculada',
    memoria: {
      formula_id,
      versao_parametros,
      entradas: { ...entradas },
      passos,
      resultado_bruto: necessidade,
      resultado_arredondado: arredondado,
      excedente,
      pendencias,
    },
  }
}

/**
 * Calcula a sugestão de COMPRA (fixture positiva da SPEC: 4,8 → 6 KG).
 * Recebimento desconhecido (null) bloqueia — não vira 0.
 */
export function calcularSugestaoCompra(
  id: string,
  item: string,
  entradas: EntradasCompra,
): Sugestao {
  const pendencias: string[] = []
  const passos: MemoriaCalculo['passos'] = []
  const formula_id = 'baseline90-v1-compra'
  const versao_parametros = 'sintetico-fixture'

  if (entradas.compras_confirmadas_a_receber === null) {
    pendencias.push(
      'Contrato de compras a receber ausente — termo não vira 0; compra bloqueada (S1).',
    )
  }

  const falta =
    entradas.compras_confirmadas_a_receber === null
      ? null
      : Math.max(
          0,
          entradas.consumo_insumo +
            entradas.minimo_insumo -
            entradas.saldo_insumo -
            entradas.compras_confirmadas_a_receber,
        )
  const arredondado =
    falta === null
      ? null
      : falta === 0
        ? 0
        : tetoMultiplo(Math.max(falta, entradas.lote_minimo), entradas.multiplo_lote)

  passos.push({
    nome: 'falta_insumo',
    valor: falta,
    formula: 'max(0, consumo + minimo - saldo - compras_confirmadas_a_receber)',
  })
  passos.push({ nome: 'resultado_bruto', valor: falta, formula: 'falta' })
  passos.push({
    nome: 'resultado_arredondado',
    valor: arredondado,
    formula: 'teto(max(falta, lote_minimo)/multiplo) × multiplo; falta 0 → 0',
  })

  return {
    id,
    tipo: 'compra',
    item,
    unidade: 'KG',
    periodo: 'horizonte-90',
    quantidade: arredondado,
    estado: pendencias.length > 0 ? 'bloqueada' : 'calculada',
    memoria: {
      formula_id,
      versao_parametros,
      entradas: { ...entradas },
      passos,
      resultado_bruto: falta,
      resultado_arredondado: arredondado,
      excedente: null,
      pendencias,
    },
  }
}

// ---------------------------------------------------------------------------
// Fixtures de demonstração — isoladas; nunca mesclar com dados reais.
// ---------------------------------------------------------------------------

/** T1: vendas900/90d, horizonte7, margem0, mínimo10, saldo20, produção futura10, firmes50, múltiplo10 → 50. */
export const FIXTURE_T1: EntradasProducao = {
  vendas_liquidas90: 900,
  horizonte_dias: 7,
  margem: 0,
  estoque_minimo: 10,
  saldo_oficial_utilizavel: 20,
  producao_programada_nao_realizada: 10,
  pedidos_firmes_no_horizonte: 50,
  multiplo_lote: 10,
  lote_minimo: 10,
  capacidade_dia: null,
}

/** T2: mesma fixture com firmes 80 → alvo 80, necessidade 60 (não soma 70+80). */
export const FIXTURE_T2: EntradasProducao = { ...FIXTURE_T1, pedidos_firmes_no_horizonte: 80 }

/** Prova não múltipla: saldo 19 → necessidade 51; múltiplo 10 / mínimo 10 → 60; capacidade 50 → excedente 10. */
export const FIXTURE_T4: EntradasProducao = {
  ...FIXTURE_T1,
  saldo_oficial_utilizavel: 19,
  capacidade_dia: 50,
}

/** Compra: consumo 5 KG (100 UN × 0,05), mínimo 2, saldo 1, confirmadas 1,2 → falta 4,8; múltiplo 2 / mínimo 3 → 6 KG. */
export const FIXTURE_COMPRA: EntradasCompra = {
  consumo_insumo: 5,
  minimo_insumo: 2,
  saldo_insumo: 1,
  compras_confirmadas_a_receber: 1.2,
  multiplo_lote: 2,
  lote_minimo: 3,
}

/** Compra com falta 1 KG, lote mínimo 5, múltiplo 2 → 6 KG. */
export const FIXTURE_COMPRA_LOTE_MINIMO: EntradasCompra = {
  consumo_insumo: 1,
  minimo_insumo: 0,
  saldo_insumo: 0,
  compras_confirmadas_a_receber: 0,
  multiplo_lote: 2,
  lote_minimo: 5,
}
