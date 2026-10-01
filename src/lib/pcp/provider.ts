/**
 * Provider de leitura do PCP — SPEC-1-000 (fundamento).
 *
 * Interface estável: o consumidor (telas) nunca sabe a origem; trocar o
 * provider de demonstração pelo real (SPEC-1-002) não muda nenhum componente.
 *
 * Estados explícitos (CA-F3): 'ok' | 'vazio' | 'indisponivel' | 'falha'.
 * Nenhuma chamada externa nesta etapa (CA-F3): fixtures isoladas aqui.
 */

export type EstadoLeitura = 'ok' | 'vazio' | 'indisponivel' | 'falha'

export interface ResultadoLeitura<T> {
  estado: EstadoLeitura
  /** Dados quando estado === 'ok'; nunca fabricados quando vazio/falha. */
  dados: T[] | null
  /** Origem da leitura; sempre 'demonstracao' nesta SPEC. */
  fonte: 'demonstracao'
  /** Horário UTC/ISO da geração da leitura. */
  observado_em: string
  /** Mensagem sanitizada quando estado !== 'ok'. */
  erro?: string
}

export interface EstoqueItem {
  produto_id: string
  codigo: string
  descricao: string
  unidade: string
  local: string
  saldo: number
}

export interface ProducaoItem {
  documento_id: string
  produto: string
  quantidade: number
  unidade: string
  status_original: string
  data_prevista: string | null
}

export interface CompraItem {
  documento_id: string
  item: string
  quantidade: number
  unidade: string
  status_original: string
  data_prevista: string | null
}

export interface PedidoItem {
  documento_id: string
  canal: 'omie' | 'nuvemshop'
  oficial: boolean
  cliente: string
  status_original: string
  data: string
}

export interface RecursosPCP {
  estoque: EstoqueItem[]
  producao: ProducaoItem[]
  compras: CompraItem[]
  pedidos: PedidoItem[]
}

/** Fixtures da SPEC-1-000 — isoladas neste módulo; nunca mesclar com provider real. */
const FIXTURES: RecursosPCP = {
  estoque: [
    {
      produto_id: 'P1',
      codigo: 'P1',
      descricao: 'Produto demonstração 1',
      unidade: 'UN',
      local: 'A',
      saldo: 10,
    },
    {
      produto_id: 'P2',
      codigo: 'P2',
      descricao: 'Produto demonstração 2',
      unidade: 'KG',
      local: 'B',
      saldo: 2,
    },
  ],
  producao: [
    {
      documento_id: 'OP-1',
      produto: 'Produto demonstração 1',
      quantidade: 5,
      unidade: 'UN',
      status_original: 'aberta',
      data_prevista: null,
    },
  ],
  compras: [
    {
      documento_id: 'C-1',
      item: 'Insumo demonstração',
      quantidade: 20,
      unidade: 'UN',
      status_original: 'aberta',
      data_prevista: null,
    },
  ],
  pedidos: [
    {
      documento_id: 'OM-11',
      canal: 'omie',
      oficial: true,
      cliente: 'Cliente demonstração',
      status_original: 'aberto',
      data: '2026-10-01',
    },
    {
      documento_id: 'OM-L1',
      canal: 'omie',
      oficial: true,
      cliente: 'Cliente demonstração',
      status_original: 'liberado',
      data: '2026-10-01',
    },
    {
      documento_id: 'NS-10',
      canal: 'nuvemshop',
      oficial: false,
      cliente: 'Cliente demonstração',
      status_original: 'pendente',
      data: '2026-10-01',
    },
  ],
}

export type ModoProvider = 'ok' | 'vazio' | 'indisponivel' | 'falha'

/**
 * Provider de demonstração. O modo é controlado apenas em ambiente de
 * homologação (VITE_PCP_PROVIDER_MODO); em produção/homologação normal o
 * valor padrão é 'ok'. Nenhum dado real entra por aqui.
 */
export function criarProviderDemonstracao(modo: ModoProvider = 'ok') {
  return {
    fonte: 'demonstracao' as const,
    async ler(): Promise<ResultadoLeitura<RecursosPCP>> {
      const observado_em = new Date().toISOString()
      if (modo === 'ok') {
        return {
          estado: 'ok',
          dados: structuredClone(FIXTURES),
          fonte: 'demonstracao',
          observado_em,
        }
      }
      if (modo === 'vazio') {
        return { estado: 'vazio', dados: null, fonte: 'demonstracao', observado_em }
      }
      if (modo === 'indisponivel') {
        return {
          estado: 'indisponivel',
          dados: null,
          fonte: 'demonstracao',
          observado_em,
          erro: 'Fonte de demonstração indisponível',
        }
      }
      return {
        estado: 'falha',
        dados: null,
        fonte: 'demonstracao',
        observado_em,
        erro: 'Falha na leitura da fonte de demonstração',
      }
    },
  }
}
