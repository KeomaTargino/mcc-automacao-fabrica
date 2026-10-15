/**
 * Visão de qualidade dos dados — SPEC-2-001 (task e57df8ff), recorte sintético.
 *
 * Contrato puro + fixtures isoladas de demonstração. Nenhuma chamada externa:
 * a conexão real (Omie) é pré-condição das tasks 5d8793fb/9318a299/e6aa4afa,
 * não desta. Nada é inventado: dado desconhecido é `null` e bloqueia o cálculo
 * dependente com motivo explícito.
 *
 * Regras (oráculos T1/T2/T3 da SPEC):
 * - Unidade desconhecida é `null` — NUNCA vira 'UN' por padrão (CA-D2).
 * - Ficha ausente é `null` — nenhum componente/rendimento inventado (CA-D3).
 * - Deduplicação por chave: uma linha por chave (replay não duplica).
 * - Evento com data fora do horizonte (D-89..D) é excluído.
 * - concluída soma; cancelada subtrai; devolução vinculada soma.
 * - Falha de página preserva o lote anterior ativo com aviso de cobertura
 *   incompleta; geração igual ou antiga é recusada (CA-D4).
 */

export type Bloqueio = 'calculo_estoque' | 'calculo_receita' | 'calculo_sugestao'

export interface FichaComponente {
  insumo: string
  quantidade: number
  unidade: string
}

export interface QualidadeProduto {
  produto_id: string
  codigo: string
  descricao: string
  /** null = desconhecida — nunca substituída por padrão. */
  unidade_oficial: string | null
  /** null = ficha ausente — nada inventado. */
  ficha: { componentes: FichaComponente[] } | null
  cobertura_dias: number | null
  cobertura_esperada: number
  bloqueios: Bloqueio[]
}

const ROTULO_BLOQUEIO: Record<Bloqueio, string> = {
  calculo_estoque:
    'Cálculos de estoque bloqueados — unidade oficial desconhecida (nada é presumido).',
  calculo_receita: 'Cálculos de receita/rendimento bloqueados — ficha técnica ausente.',
  calculo_sugestao: 'Sugestões bloqueadas — cobertura de histórico incompleta.',
}

export function rotuloBloqueio(b: Bloqueio): string {
  return ROTULO_BLOQUEIO[b]
}

/** Avalia a qualidade de um produto a partir dos dados oficiais disponíveis. */
export function avaliarProduto(entrada: {
  produto_id: string
  codigo: string
  descricao: string
  unidade: string | null
  ficha: { componentes: FichaComponente[] } | null
  cobertura_dias: number | null
  cobertura_esperada?: number
}): QualidadeProduto {
  const bloqueios: Bloqueio[] = []
  if (entrada.unidade === null) bloqueios.push('calculo_estoque')
  if (entrada.ficha === null) bloqueios.push('calculo_receita')
  const esperada = entrada.cobertura_esperada ?? 90
  if (entrada.cobertura_dias === null || entrada.cobertura_dias < esperada) {
    bloqueios.push('calculo_sugestao')
  }
  return {
    produto_id: entrada.produto_id,
    codigo: entrada.codigo,
    descricao: entrada.descricao,
    unidade_oficial: entrada.unidade,
    ficha: entrada.ficha,
    cobertura_dias: entrada.cobertura_dias,
    cobertura_esperada: esperada,
    bloqueios,
  }
}

export type StatusEvento = 'concluida' | 'cancelada' | 'devolucao'

export interface EventoProducao {
  /** Chave de replay: mesma chave nunca é contada duas vezes. */
  chave: string
  produto_id: string
  quantidade: number
  unidade: string
  status: StatusEvento
  /** Data do evento (yyyy-mm-dd). */
  data: string
  /** Documento de origem quando o evento se vincula a outro (devolução/cancelamento). */
  vinculo?: string
}

export interface ResultadoLiquido {
  produto_id: string
  unidade: string
  liquido: number
  concluidas: number
  canceladas: number
  devolucoes: number
  linhas_repetidas_descartadas: number
  eventos_fora_do_horizonte: number
}

/**
 * Mapa de produção líquida (oráculo T2): dedup por chave, exclui o que está
 * fora do horizonte D-89..D, concluída soma, cancelada subtrai e devolução
 * vinculada soma. Replay com as mesmas chaves devolve o mesmo resultado.
 */
export function producaoLiquida(
  eventos: EventoProducao[],
  horizonte: { inicio: string; fim: string },
): ResultadoLiquido[] {
  const unicos = new Map<string, EventoProducao>()
  let repetidas = 0
  for (const e of eventos) {
    if (unicos.has(e.chave)) {
      repetidas++
      continue
    }
    unicos.set(e.chave, e)
  }

  const acc = new Map<string, ResultadoLiquido>()
  let fora = 0
  for (const e of unicos.values()) {
    if (e.data < horizonte.inicio || e.data > horizonte.fim) {
      fora++
      continue
    }
    let r = acc.get(e.produto_id)
    if (!r) {
      r = {
        produto_id: e.produto_id,
        unidade: e.unidade,
        liquido: 0,
        concluidas: 0,
        canceladas: 0,
        devolucoes: 0,
        linhas_repetidas_descartadas: repetidas,
        eventos_fora_do_horizonte: 0,
      }
      acc.set(e.produto_id, r)
    }
    if (e.status === 'concluida') {
      r.concluidas += e.quantidade
      r.liquido += e.quantidade
    } else if (e.status === 'cancelada') {
      r.canceladas += e.quantidade
      r.liquido -= e.quantidade
    } else {
      r.devolucoes += e.quantidade
      r.liquido += e.quantidade
    }
  }
  for (const r of acc.values()) r.eventos_fora_do_horizonte = fora
  return [...acc.values()]
}

export interface LoteImportacao {
  /** Geração monotônica do lote; geração igual ou antiga é recusada. */
  geracao: number
  paginas_ok: number
  paginas_total: number
  eventos: EventoProducao[]
}

export type ResultadoAtivacao =
  | { estado: 'ativado'; lote: LoteImportacao }
  | {
      estado: 'recusado_geracao_antiga'
      geracao_recebida: number
      geracao_ativa: number
    }
  | {
      estado: 'lote_anterior_preservado'
      motivo: 'pagina_falhou'
      paginas_ok: number
      paginas_total: number
      aviso: string
    }

/**
 * Ativação atômica de lote (oráculo T3): página que falhou NUNCA ativa lote
 * parcial — o lote anterior permanece ativo com aviso de cobertura incompleta;
 * geração igual ou antiga é recusada.
 */
export function ativarLote(
  candidato: LoteImportacao,
  loteAtivo: LoteImportacao | null,
): ResultadoAtivacao {
  if (loteAtivo && candidato.geracao <= loteAtivo.geracao) {
    return {
      estado: 'recusado_geracao_antiga',
      geracao_recebida: candidato.geracao,
      geracao_ativa: loteAtivo.geracao,
    }
  }
  if (candidato.paginas_ok < candidato.paginas_total) {
    return {
      estado: 'lote_anterior_preservado',
      motivo: 'pagina_falhou',
      paginas_ok: candidato.paginas_ok,
      paginas_total: candidato.paginas_total,
      aviso:
        'Cobertura incompleta: uma página falhou na importação. O lote anterior permanece ativo e nada parcial entrou no ar.',
    }
  }
  return { estado: 'ativado', lote: candidato }
}

// ---------------------------------------------------------------------------
// Fixtures de demonstração — isoladas neste módulo; nunca mesclar com dados reais.
// Horizonte de exemplo: 2026-07-08..2026-10-05 = 90 dias (D-89..D).
// ---------------------------------------------------------------------------

export const HORIZONTE_DEMO = { inicio: '2026-07-08', fim: '2026-10-05' }

/** 90 datas consecutivas dentro do horizonte. */
function datas90(): string[] {
  const datas: string[] = []
  const d = new Date('2026-07-08T12:00:00Z')
  for (let i = 0; i < 90; i++) {
    datas.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return datas
}

/**
 * Fixture do mapa (oráculo T2): 100 UN concluídas em 90 datas do horizonte,
 * 1 linha repetida (mesma chave — descartada), 1 evento com data fora do
 * horizonte (excluído), 20 UN canceladas e 10 UN de devolução vinculada.
 * Resultado esperado: 90 UN líquidas.
 */
export function eventosDemonstracao(): EventoProducao[] {
  const datas = datas90()
  const eventos: EventoProducao[] = []
  for (let i = 0; i < 100; i++) {
    eventos.push({
      chave: `OP-DEMO-${String(i + 1).padStart(3, '0')}`,
      produto_id: 'COOKIE-1',
      quantidade: 1,
      unidade: 'UN',
      status: 'concluida',
      data: datas[i % datas.length],
    })
  }
  // Linha repetida: mesma chave da primeira — deve ser descartada (uma linha/chave).
  eventos.push({ ...eventos[0] })
  // Evento com data fora do horizonte — deve ser excluído.
  eventos.push({
    chave: 'OP-DEMO-FORA',
    produto_id: 'COOKIE-1',
    quantidade: 1,
    unidade: 'UN',
    status: 'concluida',
    data: '2026-10-06',
  })
  for (let i = 0; i < 20; i++) {
    eventos.push({
      chave: `OP-DEMO-CANC-${String(i + 1).padStart(2, '0')}`,
      produto_id: 'COOKIE-1',
      quantidade: 1,
      unidade: 'UN',
      status: 'cancelada',
      data: datas[i % datas.length],
    })
  }
  for (let i = 0; i < 10; i++) {
    eventos.push({
      chave: `OP-DEMO-DEV-${String(i + 1).padStart(2, '0')}`,
      produto_id: 'COOKIE-1',
      quantidade: 1,
      unidade: 'UN',
      status: 'devolucao',
      data: datas[i % datas.length],
      vinculo: `OP-DEMO-${String(i + 1).padStart(3, '0')}`,
    })
  }
  return eventos
}

/** Produtos de demonstração: os 4 estados da visão de qualidade. */
export function produtosDemonstracao(): QualidadeProduto[] {
  const fichaCookie = { componentes: [{ insumo: 'INS-1', quantidade: 0.05, unidade: 'KG' }] }
  return [
    avaliarProduto({
      produto_id: 'COOKIE-1',
      codigo: 'COOKIE-1',
      descricao: 'Cookie de demonstração',
      unidade: 'UN',
      ficha: fichaCookie,
      cobertura_dias: 90,
    }),
    avaliarProduto({
      produto_id: 'P2',
      codigo: 'P2',
      descricao: 'Produto demonstração 2 (unidade desconhecida)',
      unidade: null,
      ficha: fichaCookie,
      cobertura_dias: 90,
    }),
    avaliarProduto({
      produto_id: 'P3',
      codigo: 'P3',
      descricao: 'Produto demonstração 3 (ficha ausente)',
      unidade: 'UN',
      ficha: null,
      cobertura_dias: 90,
    }),
    avaliarProduto({
      produto_id: 'P4',
      codigo: 'P4',
      descricao: 'Produto demonstração 4 (cobertura incompleta)',
      unidade: 'UN',
      ficha: fichaCookie,
      cobertura_dias: 45,
    }),
  ]
}
