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
