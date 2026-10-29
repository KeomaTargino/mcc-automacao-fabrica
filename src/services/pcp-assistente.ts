import pb from '@/lib/pocketbase/client'

export type RespostaAssistente =
  | {
      tipo: 'respondida'
      texto: string
      fontes: { nome: string; periodo: string; atualizadoEm: string | null }[]
      limites: string[]
      sugestao: boolean
      ferramentas: string[]
    }
  | { tipo: 'sem_acesso'; texto: string }
  | { tipo: 'acao_recusada'; texto: string; acao: string; tela: string }
  | { tipo: 'sem_dados'; texto: string; falta: string[]; ferramentas: string[] }
  | { tipo: 'sem_fonte'; texto: string }
  | { tipo: 'erro_ia'; texto: string }

export const perguntarAoAssistente = (pergunta: string) =>
  pb.send('/backend/v1/pcp/assistente', {
    method: 'POST',
    body: { pergunta },
  }) as Promise<RespostaAssistente>
