import pb from '@/lib/pocketbase/client'

export interface RespostaLoop {
  loop: string
  config: {
    ativo: boolean
    baseline_pct: number | null
    alvo_pct: number | null
    janela_dias: number | null
    validador: string | null
  }
  faltam_para_ligar: string[]
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
    pendente: boolean
    veredito: string | null
    veredito_por: string | null
    veredito_em: string | null
    veredito_texto: string | null
    congelada: boolean
  }[]
  pode_validar: boolean
  pode_configurar: boolean
  aviso: string
}

const BASE = '/backend/v1/pcp/alertas/loop'

export const obterLoop = () => pb.send(BASE, { method: 'GET' }) as Promise<RespostaLoop>
export const configurarLoop = (c: {
  baseline_pct?: number | null
  alvo_pct?: number | null
  janela_dias?: number | null
  validador?: string | null
  ligar?: boolean
}) => pb.send(`${BASE}/config`, { method: 'POST', body: c }) as Promise<any>
export const registrarVeredito = (c: {
  ciclo_inicio: string
  veredito: 'atingido' | 'nao_atingido'
  texto?: string
}) => pb.send(`${BASE}/veredito`, { method: 'POST', body: c }) as Promise<any>
