import pb from '@/lib/pocketbase/client'

export interface BlocoMeta {
  disponivel?: boolean
  motivo?: string
  fonte?: string
  recurso?: string
  lote?: string
  ultimo_sucesso?: string | null
  estado_tecnico?: string
  pendencias?: string[]
}

export interface BlocoEstoque extends BlocoMeta {
  autorizado: boolean
  total?: number
  resumo_por_unidade?: Record<string, number>
  itens?: Array<{
    produto_id: string
    codigo: string
    descricao: string
    local_id: string
    unidade: string
    saldo: number | null
    fisico: number | null
    reservado: number | null
  }>
  nota?: string
}

export interface BlocoPedidos extends BlocoMeta {
  autorizado: boolean
  oficiais?: BlocoMeta & {
    total_por_id_unico?: number
    por_etapa?: Record<string, number>
    nota?: string
  }
  complementares?: BlocoMeta & {
    contagem?: Record<string, number>
    aviso?: string
  }
}

export interface RespostaPainel {
  disponivel: boolean
  motivo?: string
  gerado_em?: string
  filtros?: Record<string, string>
  blocos?: {
    estoque: BlocoEstoque
    producao: BlocoMeta & { autorizado: boolean }
    compras: BlocoMeta & { autorizado: boolean }
    pedidos: BlocoPedidos
  }
}

/** Painel diário por área (rota autorizada; área painel + área por bloco no servidor). */
export const obterPainel = (
  filtros: {
    data_ini?: string
    data_fim?: string
    item?: string
    status?: string
    local?: string
  } = {},
) => {
  const qs = new URLSearchParams()
  if (filtros.data_ini) qs.set('data_ini', filtros.data_ini)
  if (filtros.data_fim) qs.set('data_fim', filtros.data_fim)
  if (filtros.item) qs.set('item', filtros.item)
  if (filtros.status) qs.set('status', filtros.status)
  if (filtros.local) qs.set('local', filtros.local)
  const query = qs.toString()
  return pb.send(`/backend/v1/pcp/painel${query ? '?' + query : ''}`, {
    method: 'GET',
  }) as Promise<RespostaPainel>
}
