import pb from '@/lib/pocketbase/client'
import type { OrigemOcorrencia } from '@/lib/pcp/faltantes'

export interface ItemFaltanteApi {
  codigo: string
  descricao: string | null
  onde: { origem: OrigemOcorrencia; referencia: string }[]
}

export interface RespostaFaltantes {
  situacao: 'ok' | 'catalogo_incompleto'
  motivo?: string
  itens: ItemFaltanteApi[]
  total?: number
  fontes_sem_leitura: OrigemOcorrencia[]
  atualizado_em: string | null
}

/** Lista do que falta cadastrar no Omie (rota autorizada; área catalogo conferida no servidor). */
export const obterFaltantes = () =>
  pb.send('/backend/v1/pcp/faltantes', { method: 'GET' }) as Promise<RespostaFaltantes>
