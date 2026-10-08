import pb from '@/lib/pocketbase/client'

export interface ProdutoCatalogo {
  produto_id: string
  codigo: string
  descricao: string
  unidade: string
  ativo: string
  familia: string
}

export interface RespostaCatalogo {
  disponivel: boolean
  motivo?: string
  fonte?: string
  lote_ativo?: string
  atualizado_em?: string | null
  total?: number
  pagina?: number
  paginas?: number
  busca?: string
  produtos?: ProdutoCatalogo[]
  pendencias?: string[]
}

export interface LinhaSaldo {
  local_id: string
  unidade: string
  saldo: number | null
  fisico: number | null
  reservado: number | null
  unidade_incompativel?: boolean
}

export interface DetalheCatalogo {
  disponivel: boolean
  motivo?: string
  produto?: ProdutoCatalogo & { origem_lote?: string; atualizado_em?: string | null }
  ficha?: {
    disponivel: false
    motivo: string
  }
  pendencias?: string[]
  saldo?: {
    disponivel: boolean
    motivo?: string
    por_local?: LinhaSaldo[]
  }
}

/** Catálogo real do Omie (rota autorizada; área catalogo conferida no servidor). */
export const obterCatalogo = (busca = '', pagina = 1) =>
  pb.send(`/backend/v1/pcp/catalogo?busca=${encodeURIComponent(busca)}&pagina=${pagina}`, {
    method: 'GET',
  }) as Promise<RespostaCatalogo>

/** Detalhe/ficha do produto (ficha indisponível nesta fase — estado explícito, nunca mock). */
export const obterDetalhe = (produtoId: string) =>
  pb.send(`/backend/v1/pcp/catalogo/${encodeURIComponent(produtoId)}`, {
    method: 'GET',
  }) as Promise<DetalheCatalogo>
