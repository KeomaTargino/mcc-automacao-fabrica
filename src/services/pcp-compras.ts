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

export interface CotacaoRequisicao {
  id: string
  item: string
  fornecedor: string
  preco_compra: number
  unidade_compra: string
  preco_estoque: number | null
  ultimo_preco: number | null
  diferenca_percentual: number | null
  acima_da_tolerancia: boolean
  prazo_dias: number
  condicao_pagamento: string
  validade: string | null
  escolhida: boolean
}

export interface ItemDaRequisicao {
  item: string
  quantidadeEstoque: number
  unidadeEstoque: string
  apresentacao: string | null
  unidadeCompra: string | null
  quantidadeCompra: number | null
  fatorUsado: number | null
  pendencias: string[]
}

export interface RequisicaoCompra {
  id: string
  vinculo: { estado: string; numero_omie: string | null; origem: string } | null
  fornecedor: string
  itens: ItemDaRequisicao[]
  data_necessaria: string
  emergencial: boolean
  motivo_emergencia: string | null
  estado: string
  versao: number
  criado_por: string
  criado_em: string
  cotacoes: CotacaoRequisicao[]
  valor: number | null
  aprovacoes: {
    aprovador: string
    decisao: string
    valor: number
    alcada_usada: number | null
    motivo: string
    hora: string
    valida: boolean
    confere: boolean
  }[]
}

export interface EntregaCompra {
  pedido_id: string
  numero: string | null
  linha_id: string
  fornecedor: string | null
  produto_id: string
  unidade: string | null
  quantidade_pedida: number
  quantidade_recebida: number
  restante: number
  data_prevista: string | null
  dias_atraso: number
  atrasado: boolean
  cancelado: boolean
  emergencial: boolean
}

export interface RespostaEntregas {
  entregas: EntregaCompra[]
  resumo: { fornecedor: string; em_aberto: number; atrasadas: number }[]
  ultima_leitura: string | null
  hoje: string
}

export const obterEntregas = () =>
  pb.send('/backend/v1/pcp/compras/entregas', { method: 'GET' }) as Promise<RespostaEntregas>

export const ligarPedidoCompra = (corpo: { requisicao: string; numero: string }) =>
  pb.send('/backend/v1/pcp/compras/pedido/ligar', { method: 'POST', body: corpo }) as Promise<any>

export const lancarPedidoCompra = (requisicao: string) =>
  pb.send('/backend/v1/pcp/compras/pedido/lancar', {
    method: 'POST',
    body: { requisicao },
  }) as Promise<any>

export const conferirPedidoCompra = (requisicao: string) =>
  pb.send('/backend/v1/pcp/compras/pedido/conferir', {
    method: 'POST',
    body: { requisicao },
  }) as Promise<any>

export interface RespostaRequisicoes {
  requisicoes: RequisicaoCompra[]
  alcadas_cadastradas: number
  tolerancia_percentual: number | null
  pode_editar: boolean
  pode_aprovar: boolean
}

export const obterRequisicoes = () =>
  pb.send('/backend/v1/pcp/compras/requisicoes', { method: 'GET' }) as Promise<RespostaRequisicoes>

export const criarRequisicao = (necessidades: any[]) =>
  pb.send('/backend/v1/pcp/compras/requisicoes', {
    method: 'POST',
    body: { necessidades },
  }) as Promise<any>

export const registrarCotacao = (corpo: {
  requisicao: string
  item: string
  preco: number
  prazo_dias: number
  condicao_pagamento: string
  validade: string
}) => pb.send('/backend/v1/pcp/compras/cotacao', { method: 'POST', body: corpo }) as Promise<any>

export const escolherCotacao = (id: string) =>
  pb.send('/backend/v1/pcp/compras/cotacao/escolher', {
    method: 'POST',
    body: { id },
  }) as Promise<any>

export const enviarParaAprovacao = (id: string, versao: number) =>
  pb.send('/backend/v1/pcp/compras/requisicao/enviar', {
    method: 'POST',
    body: { id, versao },
  }) as Promise<any>

export const alterarQuantidadeRequisicao = (corpo: {
  id: string
  versao: number
  item: string
  quantidade_estoque: number
}) =>
  pb.send('/backend/v1/pcp/compras/requisicao/alterar', {
    method: 'POST',
    body: corpo,
  }) as Promise<any>

export const decidirCompra = (corpo: {
  id: string
  decisao: 'aprovada' | 'recusada'
  motivo: string
}) => pb.send('/backend/v1/pcp/compras/aprovacao', { method: 'POST', body: corpo }) as Promise<any>

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
