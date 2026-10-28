/**
 * Ações de compras e recebimento — SPEC-3-003, CA-3-08.
 *
 * Registro das oito ações novas, a área de cada uma e a guarda que o servidor aplica em CADA chamada.
 * Área ou cargo nunca concede ação por implicação: a ação precisa estar no perfil E a área da ação
 * também. Qualquer motivo de recusa (sem perfil, perfil inativo, sem a ação, sem a área) devolve a
 * mesma resposta 403, sem pistas. Conta real só recebe ação nova pela matriz que o dono aprovar
 * (CL-003): enquanto não houver aprovação, nenhuma conta real recebe nenhuma ação desta lista.
 * A ação `autorizar_escrita_omie` é só do dono e não faz parte deste registro.
 */

export const ACOES_COMPRAS = [
  'consultar_compras',
  'editar_fornecedor',
  'editar_conversao',
  'editar_requisicao',
  'aprovar_compra',
  'autorizar_excecao_compra',
  'conferir_recebimento',
  'conferir_financeiro_recebimento',
] as const

export type AcaoCompras = (typeof ACOES_COMPRAS)[number]
export type AreaCompras = 'compras' | 'recebimento'

export const AREA_DA_ACAO: { [a in AcaoCompras]: AreaCompras } = {
  consultar_compras: 'compras',
  editar_fornecedor: 'compras',
  editar_conversao: 'compras',
  editar_requisicao: 'compras',
  aprovar_compra: 'compras',
  autorizar_excecao_compra: 'compras',
  conferir_recebimento: 'recebimento',
  conferir_financeiro_recebimento: 'recebimento',
}

export interface PerfilAcesso {
  ativo: boolean
  areas: string[]
  acoes: string[]
}

export type ResultadoGuarda =
  | { permitido: true }
  | { permitido: false; http: 403; erro: 'sem_permissao' }

const NEGADO: ResultadoGuarda = { permitido: false, http: 403, erro: 'sem_permissao' }

/** Guarda do servidor: perfil ativo, com a ação e com a área da ação. Uma única resposta de recusa. */
export function exigirAcao(perfil: PerfilAcesso | null | undefined, acao: string): ResultadoGuarda {
  if (!perfil || !perfil.ativo) return NEGADO
  const area = (AREA_DA_ACAO as { [a: string]: AreaCompras | undefined })[acao]
  if (!area) return NEGADO
  if (!Array.isArray(perfil.acoes) || perfil.acoes.indexOf(acao) === -1) return NEGADO
  if (!Array.isArray(perfil.areas) || perfil.areas.indexOf(area) === -1) return NEGADO
  return { permitido: true }
}

/** As ações de compras que esta conta pode exercer agora (o que a tela pode mostrar). */
export function acoesConcedidas(perfil: PerfilAcesso | null | undefined): AcaoCompras[] {
  return ACOES_COMPRAS.filter((a) => exigirAcao(perfil, a).permitido)
}

export interface MatrizAprovada {
  aprovadaPeloDono: boolean
  acoesAprovadas: string[]
}

/** Matriz vigente das ações de compras para contas reais: não aprovada (CL-003), logo vazia. */
export const MATRIZ_COMPRAS: MatrizAprovada = { aprovadaPeloDono: false, acoesAprovadas: [] }

/** Conta real só recebe ação nova se a matriz estiver aprovada pelo dono e listar a ação. */
export function contaRealPodeReceber(
  acao: string,
  matriz: MatrizAprovada = MATRIZ_COMPRAS,
): boolean {
  return matriz.aprovadaPeloDono === true && matriz.acoesAprovadas.indexOf(acao) !== -1
}

/** Ações de compras que uma lista de concessão traria para conta real SEM estar na matriz aprovada. */
export function concessoesForaDaMatriz(
  acoes: string[],
  matriz: MatrizAprovada = MATRIZ_COMPRAS,
): string[] {
  return acoes.filter(
    (a) =>
      (ACOES_COMPRAS as readonly string[]).indexOf(a) !== -1 && !contaRealPodeReceber(a, matriz),
  )
}

/** Perfis de teste (só para prova; nunca viram conta real). */
export const PERFIS_DE_TESTE: { [nome: string]: PerfilAcesso } = {
  comprador: {
    ativo: true,
    areas: ['compras'],
    acoes: ['consultar_compras', 'editar_fornecedor', 'editar_conversao', 'editar_requisicao'],
  },
  aprovador: {
    ativo: true,
    areas: ['compras'],
    acoes: ['consultar_compras', 'aprovar_compra', 'autorizar_excecao_compra'],
  },
  almoxarifado: {
    ativo: true,
    areas: ['compras', 'recebimento'],
    acoes: ['consultar_compras', 'conferir_recebimento'],
  },
  financeiro: {
    ativo: true,
    areas: ['compras', 'recebimento'],
    acoes: ['consultar_compras', 'conferir_financeiro_recebimento'],
  },
}
