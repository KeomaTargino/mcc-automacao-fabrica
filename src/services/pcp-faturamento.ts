import pb from '@/lib/pocketbase/client'

export interface UnidadeOperacional {
  cliente_omie: string
  unidade: string
  nome_fantasia_operacional: string
  tipo: string
  ativo: boolean
  versao: number
  alterado_por: string
  alterado_em: string
}

export interface NomeDoCanal {
  canal: string
  cliente_omie: string
  nome_recebido: string
  estado: 'igual' | 'a_revisar' | 'aceito' | 'recusado'
  decidido_por: string | null
  decidido_em: string | null
}

export interface PrecoDaTabela {
  chave: string
  item: string
  preco: number
  unidade: string
  vigencia_inicio: string
  versao: number
  origem: string
}

export interface RespostaUnidades {
  unidades: UnidadeOperacional[]
  historico: UnidadeOperacional[]
  nomes: NomeDoCanal[]
  a_revisar: number
  tabela: PrecoDaTabela[]
  pode_editar: boolean
}

export interface PedidoPreparacao {
  pedido_id: string
  cliente_omie: string | null
  unidade: string | null
  nome_fantasia_operacional: string | null
  data: string
  origem: string
  situacao_canal: 'confirmado' | 'intencao' | null
  apto_para_preparar: boolean
  motivos: string[]
  itens: {
    item: string
    quantidade: number
    preco_pedido: number | null
    preco_tabela: number | null
    diferente_da_tabela: boolean
    sem_preco: boolean
  }[]
  subtotal_recalculado: number | null
  subtotal_pedido: number | null
  diferenca: number | null
  subtotal_pendente: string[]
}

export interface RespostaPedidosPreparacao {
  disponivel: boolean
  motivo?: string
  ultimo_sucesso?: string | null
  pedidos?: PedidoPreparacao[]
  totais?: { pedidos: number; sem_unidade: number; nomes_a_revisar: number }
  aviso?: string
}

export const obterUnidades = () =>
  pb.send('/backend/v1/pcp/faturamento/unidades', { method: 'GET' }) as Promise<RespostaUnidades>

export const salvarUnidade = (corpo: {
  cliente_omie: string
  unidade: string
  nome_fantasia_operacional: string
  tipo: string
  versao_esperada: number
}) =>
  pb.send('/backend/v1/pcp/faturamento/unidade', { method: 'POST', body: corpo }) as Promise<any>

export const registrarNomeCanal = (corpo: {
  canal: string
  cliente_omie: string
  nome_recebido: string
}) =>
  pb.send('/backend/v1/pcp/faturamento/nome-canal', { method: 'POST', body: corpo }) as Promise<any>

export const decidirNomeCanal = (corpo: {
  canal: string
  cliente_omie: string
  nome_recebido: string
  decisao: 'aceito' | 'recusado'
}) =>
  pb.send('/backend/v1/pcp/faturamento/nome-canal/decidir', {
    method: 'POST',
    body: corpo,
  }) as Promise<any>

export const salvarPrecoTabela = (corpo: {
  chave: string
  item: string
  preco: number
  unidade: string
  vigencia_inicio: string
}) =>
  pb.send('/backend/v1/pcp/faturamento/tabela-preco', {
    method: 'POST',
    body: corpo,
  }) as Promise<any>

export const obterPedidosPreparacao = () =>
  pb.send('/backend/v1/pcp/faturamento/pedidos', {
    method: 'GET',
  }) as Promise<RespostaPedidosPreparacao>
