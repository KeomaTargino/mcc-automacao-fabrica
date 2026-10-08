import pb from '@/lib/pocketbase/client'

export interface PerfilPCP {
  usuario: string
  areas: string[]
  pode_atualizar_fontes: boolean
}

export interface RespostaPerfil {
  superuser: boolean
  perfil: PerfilPCP | null
  motivo: string
}

export interface RespostaDados {
  areas_permitidas: string[]
  fonte: 'demonstracao'
  observado_em: string
  dados: {
    estoque?: unknown[]
    producao?: unknown[]
    compras?: unknown[]
    pedidos?: unknown[]
  }
  superuser: boolean
}

/** Perfil do usuário logado (rota autorizada; área nunca vem do navegador). */
export const obterPerfil = () =>
  pb.send('/backend/v1/pcp/perfil', { method: 'GET' }) as Promise<RespostaPerfil>

/** Dados de demonstração por área, autorizados no servidor. */
export const obterDados = () =>
  pb.send('/backend/v1/pcp/dados', { method: 'GET' }) as Promise<RespostaDados>
