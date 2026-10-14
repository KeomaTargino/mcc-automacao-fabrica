import pb from '@/lib/pocketbase/client'

export interface PerfilPCP {
  usuario: string
  areas: string[]
  /** Ações F2 da matriz nominal v1.2 (SPEC-2-000) — concessão explícita, nunca por área/cargo. */
  acoes?: string[]
  /** Pontos físicos de apontamento/conferência da matriz v1.2. */
  pontos?: string[]
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

export interface RespostaPrimeiraSenha {
  primeira_senha_trocada: boolean
  exige_troca: boolean
}

/** Perfil do usuário logado (rota autorizada; área nunca vem do navegador). */
export const obterPerfil = () =>
  pb.send('/backend/v1/pcp/perfil', { method: 'GET' }) as Promise<RespostaPerfil>

/** Dados de demonstração por área, autorizados no servidor. */
export const obterDados = () =>
  pb.send('/backend/v1/pcp/dados', { method: 'GET' }) as Promise<RespostaDados>

/** A troca da senha inicial é obrigatória para esta conta? (rota autorizada) */
export const verificarPrimeiraSenha = () =>
  pb.send('/backend/v1/pcp/primeira-senha', { method: 'GET' }) as Promise<RespostaPrimeiraSenha>
