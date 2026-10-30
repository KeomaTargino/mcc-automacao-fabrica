import pb from '@/lib/pocketbase/client'

export interface PerguntaPrioritaria {
  codigo: string
  texto: string
  area: string
  ativa: boolean
  versao: number
}

export interface RevisaoPergunta {
  prioritaria: string
  ligada_por: string
  decisao: 'aceita' | 'recusada' | null
  motivo: string | null
  validador: string | null
  revisado_em: string | null
}

export interface PerguntaDoCiclo {
  id: string
  usuario: string
  pergunta: string
  criada_em: string
  resultado: string
  tem_fonte: boolean
  revisao: RevisaoPergunta | null
}

export interface RespostaLoop2Somente {
  somente_minhas: true
  prioritarias: PerguntaPrioritaria[]
  minhas: {
    id: string
    pergunta: string
    criada_em: string
    resultado: string
    tem_fonte: boolean
  }[]
}

export interface RespostaLoop2 {
  somente_minhas?: false
  loop: string
  config: {
    ativo: boolean
    baseline_pct: number | null
    alvo_pct: number | null
    janela_dias: number | null
    validador: string | null
  }
  faltam_para_ligar: string[]
  prioritarias: PerguntaPrioritaria[]
  perguntas: PerguntaDoCiclo[]
  atual: {
    ciclo_inicio: string
    ciclo_fim: string
    provisorio: boolean
    gerados: number
    tratados: number
    proporcao_pct: number | null
    nao_aplicavel: boolean
  }
  medicoes: {
    ciclo_inicio: string
    ciclo_fim: string
    gerados: number
    tratados: number
    proporcao_pct: number | null
    nao_aplicavel: boolean
    veredito: string | null
    veredito_por: string | null
    veredito_texto: string | null
    congelada: boolean
  }[]
  pode_cadastrar: boolean
  pode_validar: boolean
  pode_configurar: boolean
  aviso: string
}

const BASE = '/backend/v1/pcp/assistente/loop'

export const obterLoop2 = () =>
  pb.send(BASE, { method: 'GET' }) as Promise<RespostaLoop2 | RespostaLoop2Somente>
export const acaoLoop2 = (corpo: Record<string, unknown>) =>
  pb.send(`${BASE}/acao`, { method: 'POST', body: corpo }) as Promise<any>
