import pb from '@/lib/pocketbase/client'

export type CampoParametro =
  | 'estoqueMinimo'
  | 'prazoFornecedorDias'
  | 'toleranciaPrecoPct'
  | 'atrasoAceitoDias'
  | 'tempoMaxParadoHoras'
  | 'compraSemPedidoDias'

export const CAMPOS: { campo: CampoParametro; rotulo: string }[] = [
  { campo: 'estoqueMinimo', rotulo: 'Estoque mínimo' },
  { campo: 'prazoFornecedorDias', rotulo: 'Prazo do fornecedor (dias)' },
  { campo: 'toleranciaPrecoPct', rotulo: 'Tolerância de preço (%)' },
  { campo: 'atrasoAceitoDias', rotulo: 'Atraso aceito de entrega (dias)' },
  { campo: 'tempoMaxParadoHoras', rotulo: 'Tempo máximo parado (horas)' },
  { campo: 'compraSemPedidoDias', rotulo: 'Compra sem pedido (dias)' },
]

export type ParametroAlerta = { escopo: 'produto' | 'familia'; chave: string } & Partial<
  Record<CampoParametro, number>
>

export interface DocParametrosAlerta {
  itens: ParametroAlerta[]
  gravidade: Partial<
    Record<'producao' | 'compra' | 'preco' | 'pedido' | 'divergencia', 'critico' | 'atencao'>
  >
}

export interface Lacuna {
  regra: string
  item: string
  campo: string
  motivo: string
}

export interface RespostaParametrosAlerta {
  vigente: {
    versao: number
    aprovador: string
    aprovado_em: string
    parametros: DocParametrosAlerta | null
  } | null
  familias: Record<string, string[]>
  lacunas: Lacuna[]
  pode_editar: boolean
  origem: 'aprovada' | 'sem_parametros'
}

export interface AlertaAberto {
  id: string
  estado: 'aberto' | 'em_analise' | 'tratado'
  versao: number
  responsavel: string | null
  anterior_id: string | null
  acao: string | null
  acao_texto: string | null
  tratado_por: string | null
  tratado_em: string | null
  pode_tratar: boolean
  chave: string
  tipo: 'estoque' | 'producao' | 'compra' | 'preco' | 'pedido' | 'divergencia'
  item: string
  referencia: string
  gravidade: 'critico' | 'atencao'
  regra: string
  valores: Record<string, number | string | null>
  versao_parametros: number
  aberto_em: string
  atualizado_em: string
  dado_em: string
  fonte_desatualizada: boolean
  atualizacoes: number
}

export interface RespostaAlertas {
  alertas: AlertaAberto[]
  lacunas: Lacuna[]
  regras_desligadas: string[]
  ultima_rodada: string | null
  pode_rodar: boolean
  pode_tratar: boolean
  pode_mudar_regra: boolean
}

export interface EventoAlerta {
  alerta_id: string
  ocorrencia: number
  evento: string
  autor: string
  em: string
  detalhe: string
}

export const ACOES_TRATAMENTO: [string, string][] = [
  ['compra_solicitada', 'Compra solicitada'],
  ['ordem_reprogramada', 'Ordem reprogramada'],
  ['fornecedor_contatado', 'Fornecedor contatado'],
  ['pedido_liberado', 'Pedido liberado'],
  ['risco_aceito', 'Risco aceito'],
  ['alerta_indevido', 'Alerta indevido (exige motivo)'],
  ['outra', 'Outra (descreva)'],
]

export interface ResultadoRodada {
  executou: boolean
  motivo?: string
  criados?: number
  atualizados?: number
  lacunas?: number
  hora?: string
  fontes_pendentes: string[]
}

const BASE = '/backend/v1/pcp/alertas'

export const obterParametrosAlerta = () =>
  pb.send(`${BASE}/parametros`, { method: 'GET' }) as Promise<RespostaParametrosAlerta>
export const aprovarParametrosAlerta = (corpo: DocParametrosAlerta & { versao_esperada: number }) =>
  pb.send(`${BASE}/parametros/aprovar`, { method: 'POST', body: corpo }) as Promise<any>
export const salvarFamilia = (corpo: { familia: string; produtos: string[] }) =>
  pb.send(`${BASE}/familia`, { method: 'POST', body: corpo }) as Promise<any>
export const obterAlertas = () => pb.send(BASE, { method: 'GET' }) as Promise<RespostaAlertas>
export const assumirAlerta = (c: { id: string; versao_esperada: number }) =>
  pb.send(`${BASE}/assumir`, { method: 'POST', body: c }) as Promise<any>
export const tratarAlerta = (c: {
  id: string
  versao_esperada: number
  acao: string
  texto?: string
}) => pb.send(`${BASE}/tratar`, { method: 'POST', body: c }) as Promise<any>
export const mudarRegraAlerta = (c: { tipo: string; ativa: boolean }) =>
  pb.send(`${BASE}/regra`, { method: 'POST', body: c }) as Promise<any>
export const obterHistoricoAlerta = (id: string) =>
  pb.send(`${BASE}/historico`, { method: 'GET', query: { id } }) as Promise<{
    alerta_id: string
    eventos: EventoAlerta[]
  }>
export const obterContadorAlertas = () =>
  pb.send(`${BASE}/contador`, { method: 'GET' }) as Promise<{ abertos: number }>
export const rodarAlertas = () =>
  pb.send(`${BASE}/rodar`, { method: 'POST', body: {} }) as Promise<ResultadoRodada>
