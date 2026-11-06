import pb from '@/lib/pocketbase/client'

/** Cliente das rotas de produção no servidor (SPEC-4-001). A tela grava e lê só por aqui. */

export interface OrdemProgramada {
  op_id: string
  versao_op: number
  produto: string
  quantidade: number
  data: string
  recurso: string
}

export interface EstadoProducao {
  programacao: {
    versao: number
    publicada_por: string
    publicada_em: string
    ops: OrdemProgramada[]
  } | null
  eventos: {
    evento_id: string
    op_id: string
    ponto: string
    tipo: string
    item: string
    quantidade: number
    unidade: string
    motivo: string | null
    retifica: string | null
    autor: string
  }[]
  conferencias: {
    registro_id: string
    op_id: string
    etapa: string
    quantidade: number
    unidade: string
    autor: string
  }[]
  aprovacoes: {
    aprovacao_id: string
    op_id: string
    quantidade_final: number
    motivo: string
    estado: string
    aprovador: string
  }[]
  ordens: { transacao_id: string; op_id: string; estado: string; quantidade: number }[]
}

export interface RespostaRota<T = any> {
  http: number
  corpo: T | null
}

/** Chama a rota e devolve o status e o corpo, inclusive nos erros 4xx (a tela decide a mensagem). */
async function chamar<T = any>(
  rota: string,
  opcoes: { method: 'GET' | 'POST'; body?: Record<string, unknown> },
): Promise<RespostaRota<T>> {
  try {
    const corpo = (await pb.send(`/backend/v1/pcp/producao/${rota}`, opcoes)) as T
    return { http: 200, corpo }
  } catch (err: any) {
    return { http: Number(err?.status ?? err?.response?.status ?? 0), corpo: err?.response ?? null }
  }
}

export const lerEstadoProducao = async (opId?: string): Promise<EstadoProducao | null> => {
  const r = await chamar<EstadoProducao>(
    `estado${opId ? `?op_id=${encodeURIComponent(opId)}` : ''}`,
    {
      method: 'GET',
    },
  )
  return r.http === 200 ? r.corpo : null
}

export const publicarProgramacaoServidor = (
  versaoEsperada: number,
  linhas: { produto: string; quantidade: number; data: string; recurso: string }[],
) =>
  chamar('programacao/publicar', {
    method: 'POST',
    body: { versao_esperada: versaoEsperada, linhas },
  })

export const registrarApontamentoServidor = (corpo: {
  evento_id: string
  op_id: string
  ponto: string
  tipo: string
  item: string
  quantidade: number
  unidade: string
  motivo?: string
  retifica?: string
}) => chamar('apontamento/registrar', { method: 'POST', body: corpo })

export const registrarConferenciaServidor = (corpo: {
  registro_id: string
  op_id: string
  etapa: 'recebimento_expedicao' | 'entrada_camara'
  quantidade: number
  unidade: string
}) => chamar('conferencia/registrar', { method: 'POST', body: corpo })

export const aprovarConsolidacaoServidor = (corpo: {
  aprovacao_id: string
  op_id: string
  quantidade_final: number
  motivo: string
  data_conclusao?: string
}) => chamar('consolidacao/aprovar', { method: 'POST', body: corpo })
