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
  ultima_rodada: string | null
  pode_rodar: boolean
}

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
export const rodarAlertas = () =>
  pb.send(`${BASE}/rodar`, { method: 'POST', body: {} }) as Promise<ResultadoRodada>
