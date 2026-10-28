import pb from '@/lib/pocketbase/client'

export interface ItemFilaOp {
  transacao_id: string
  op_id: string
  estado: string
  ordem: string
  produto: string
  quantidade: number
  unidade: string
  data: string
  local: string
  efeito_no_estoque: string
  hash: string
  autorizada_por: string | null
  autorizada_em: string | null
  posts_mutantes: number
  conferencia: {
    resultado: string
    detalhes: string[]
    conferida_em: string
  } | null
}

export interface RespostaFilaOp {
  chave: { ligada: boolean; escopo: string | null }
  pode_autorizar: boolean
  pode_enviar: boolean
  itens: ItemFilaOp[]
}

/** O que a tela de envio mostra (rota autorizada no servidor). */
export const obterFilaOp = () =>
  pb.send('/backend/v1/pcp/omie/op/fila', { method: 'GET' }) as Promise<RespostaFilaOp>

const enviarPost = (rota: string, corpo: Record<string, unknown>) =>
  pb.send(`/backend/v1/pcp/omie/op/${rota}`, { method: 'POST', body: corpo }) as Promise<any>

export const autorizarOp = (transacao_id: string, hash_visto: string) =>
  enviarPost('autorizar', { transacao_id, hash_visto })
export const desautorizarOp = (transacao_id: string) => enviarPost('desautorizar', { transacao_id })
export const enviarOp = (transacao_id: string) => enviarPost('enviar', { transacao_id })
export const conferirOp = (transacao_id: string) => enviarPost('conferir', { transacao_id })
