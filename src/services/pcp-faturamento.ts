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
  manual: boolean
  motivo_manual: string | null
  referencia: string | null
  frete: { modalidade: string; transportadora: string } | null
  volumes: { quantidade: number; peso_bruto: number | null; por: string; em: string } | null
  versao_prep: number
  estado: 'bloqueado' | 'apto' | 'liberado'
  motivos_fila: string[]
  duplicata: { situacao: 'nenhuma' | 'duplicata' | 'possivel'; com?: string; motivo?: string }
  decisao_duplicata: string | null
  liberacao: { por: string; em: string } | null
  gravacoes: { operacao: string; estado: string }[]
  para_lancar: object[]
  hash_visto?: string
}

export interface RespostaPedidosPreparacao {
  disponivel: boolean
  motivo?: string
  omie_lote?: boolean
  ultimo_sucesso?: string | null
  pedidos?: PedidoPreparacao[]
  totais?: {
    pedidos: number
    sem_unidade: number
    nomes_a_revisar: number
    aptos: number
    bloqueados: number
    duplicatas_a_revisar: number
  }
  chave?: { ligada: boolean; escopo: string | null }
  pode?: { preparar: boolean; conferir_volumes: boolean; liberar: boolean }
  aviso?: string
}

const BASE = '/backend/v1/pcp/faturamento'
const enviar = (rota: string, corpo: object) =>
  pb.send(`${BASE}/${rota}`, { method: 'POST', body: corpo }) as Promise<any>

export const definirFrete = (c: {
  pedido_id: string
  modalidade: string
  transportadora?: string
  versao_esperada: number
}) => enviar('pedido/frete', c)
export const contarVolumes = (c: {
  pedido_id: string
  quantidade: number
  peso_bruto?: number | null
  versao_esperada: number
}) => enviar('pedido/volumes', c)
export const liberarPedido = (c: {
  pedido_id: string
  hash_visto: string
  versao_esperada: number
}) => enviar('pedido/liberar', c)
export const criarPedidoManual = (c: {
  cliente_omie: string
  data: string
  itens: { item: string; quantidade: number }[]
  motivo: string
  referencia?: string
}) => enviar('pedido/manual', c)
export const decidirDuplicata = (c: {
  pedido_id: string
  decisao: 'nao_e_duplicata' | 'e_duplicata'
  motivo: string
}) => enviar('pedido/duplicata', c)
export const gravarVenda = (c: {
  pedido_id: string
  operacao: 'incluir_manual' | 'volumes_frete'
}) => enviar('venda/gravar', c)
export const conferirVenda = (c: {
  pedido_id: string
  operacao: 'incluir_manual' | 'volumes_frete'
}) => enviar('venda/conferir', c)

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
