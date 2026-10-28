import pb from '@/lib/pocketbase/client'

export interface ContatoFornecedor {
  nome: string
  funcao: string
  telefone: string
  email: string
}

export interface FornecedorComplemento {
  fornecedor: string
  versao: number
  contatos: ContatoFornecedor[]
  prazo_entrega_dias: number | null
  observacao: string
  alterado_por: string
  alterado_em: string
}

export interface RespostaFornecedores {
  itens: FornecedorComplemento[]
  pode_editar: boolean
  leitura_omie: string
}

export interface ItemConversao {
  chave: string
  item: string
  fornecedor: string | null
  apresentacao: string
  unidade_compra: string
  fator: number
  unidade_estoque: string
  confirmado_por: string
  confirmado_em: string
  versao: number
  vigente: boolean
}

export interface RespostaConversoes {
  itens: ItemConversao[]
  pode_editar: boolean
}

export type EstadoPreco = 'comparavel' | 'sem_fator' | 'preco_pendente' | 'cancelado'

export interface RegistroHistorico {
  chave: string
  pedido_id: string
  linha_id: string
  fornecedor: string | null
  data: string | null
  quantidade: number | null
  unidade: string | null
  preco: number | null
  fator: number | null
  estado: EstadoPreco
}

export interface ResumoPrecos {
  menor: number
  maior: number
  media: number
  ultimo: number
  registros: number
}

export interface RespostaHistorico {
  item: string | null
  unidade_estoque: string | null
  registros: RegistroHistorico[]
  resumo: {
    por_fornecedor: (ResumoPrecos & { fornecedor: string | null })[]
    geral: ResumoPrecos | null
  }
  documentos: {
    pedido_id: string
    linha_id: string
    produto_id: string
    classificacao: string
    quantidade: number | null
    unidade_compra: string | null
    preco_unitario: number | null
  }[]
  a_classificar: {
    chave: string
    pedido_id: string
    produto_id: string
    fornecedor: string | null
    quantidade: number | null
    unidade_compra: string | null
    preco_unitario: number | null
  }[]
  pendencias: { a_classificar: number; sem_preco: number; sem_fator: number }
  ultima_atualizacao: string | null
  pode_classificar: boolean
}

export const obterHistorico = (filtro: { item?: string; de?: string; ate?: string }) => {
  const q = new URLSearchParams()
  if (filtro.item) q.set('item', filtro.item)
  if (filtro.de) q.set('de', filtro.de)
  if (filtro.ate) q.set('ate', filtro.ate)
  return pb.send('/backend/v1/pcp/compras/historico?' + q.toString(), {
    method: 'GET',
  }) as Promise<RespostaHistorico>
}

export const classificarLinhaPreco = (corpo: { chave: string; classificacao: string }) =>
  pb.send('/backend/v1/pcp/compras/historico/classificar', {
    method: 'POST',
    body: corpo,
  }) as Promise<any>

export const obterFornecedores = () =>
  pb.send('/backend/v1/pcp/compras/fornecedores', {
    method: 'GET',
  }) as Promise<RespostaFornecedores>

export const salvarFornecedor = (corpo: {
  fornecedor: string
  contatos: ContatoFornecedor[]
  prazo_entrega_dias: number | null
  observacao: string
}) => pb.send('/backend/v1/pcp/compras/fornecedor', { method: 'POST', body: corpo }) as Promise<any>

export const obterConversoes = () =>
  pb.send('/backend/v1/pcp/compras/conversoes', { method: 'GET' }) as Promise<RespostaConversoes>

export const salvarConversao = (corpo: {
  item: string
  fornecedor: string
  apresentacao: string
  unidade_compra: string
  fator: number
}) => pb.send('/backend/v1/pcp/compras/conversao', { method: 'POST', body: corpo }) as Promise<any>
