import pb from '@/lib/pocketbase/client'

/** Dados BRUTOS da fonte para o piloto M011001 (transporte puro — hook pcp_piloto). */
export interface ItemFichaPiloto {
  insumo: string
  descricao: string
  quantidade: number | null
  unidade: string
  perda_pct: number | null
  tipo: string
}

export interface RespostaPiloto {
  disponivel: boolean
  motivo?: string
  detalhe?: string
  piloto?: { codigo: string; aprovado_por: string }
  produto?: {
    produto_id: string
    codigo: string
    descricao: string
    unidade: string
    familia: string
    ativo: string
  }
  ficha?: { itens: ItemFichaPiloto[] } | null
  locais?: { local_id: string; descricao: string; padrao: boolean; inativo: boolean }[]
  unidades_estoque?: string[]
  lote_estoque?: string | null
  atualizado_em?: string
}

/** Piloto real (rota autorizada; área catalogo conferida no servidor). */
export const obterPiloto = () =>
  pb.send('/backend/v1/pcp/piloto', { method: 'GET' }) as Promise<RespostaPiloto>
