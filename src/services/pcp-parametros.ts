import pb from '@/lib/pocketbase/client'

/** Aprovação vigente dos parâmetros oficiais (servidor decide; sem default inventado). */
export interface AprovacaoServidor {
  versao: number
  aprovador: string
  aprovado_em: string
  hash_parametros: string
}

export interface RespostaParametros {
  aprovacao: AprovacaoServidor | null
  origem: 'aprovada' | 'demonstracao'
}

export interface ResultadoAprovacaoServidor {
  estado: 'aprovado' | 'replay' | 'conflito_versao'
  aprovacao?: AprovacaoServidor
  versao_esperada?: number
  versao_atual?: number
}

/** Estado atual dos parâmetros oficiais (rota autorizada; sessão exigida). */
export const obterParametros = () =>
  pb.send('/backend/v1/pcp/parametros', { method: 'GET' }) as Promise<RespostaParametros>

/** Aprova parâmetros oficiais — servidor revalida (gate editar_parametros; 409 em divergência). */
export const aprovarParametrosServidor = (parametros: unknown, versaoEsperada?: number) =>
  pb.send('/backend/v1/pcp/parametros/aprovar', {
    method: 'POST',
    body: { parametros, versao_esperada: versaoEsperada ?? null },
  }) as Promise<ResultadoAprovacaoServidor>
