// SPEC-4-004 — textos da operação num lugar só: rótulos de estado, mensagens de erro e a lista de
// padrões que não podem aparecer numa tela. Nenhuma regra muda: só o texto que a pessoa lê.

export const GENERICA_FALHA = 'Não foi possível falar com o servidor. Tente de novo em instantes.'
export const GENERICA_CONFERIR = 'Confira os campos destacados.'

/** Padrões proibidos em texto visível (CA-4-15). */
export const PADROES_PROIBIDOS: RegExp[] = [
  /\b(SPEC|CA|CL|LOOP|RQ|RN)-[A-Z]?\d/,
  /\([0-9a-f]{8}\)/i,
  /\b(oráculos?|oraculos?|null|payloads?|hash(?:es)?|leases?|replays?|MOCK|gates?|UUIDs?|endpoints?|fixtures?)\b/i,
  /\bPOST\b/,
  /\((401|403|404|409|422|423|425|5\d\d)\)|HTTP \d{3}/,
  /\bFase \d/,
  /\b[a-z]+(_[a-z0-9]+)+\b/,
]

export const temPadraoProibido = (texto: unknown): boolean => {
  const t = String(texto ?? '')
  return PADROES_PROIBIDOS.some((p) => p.test(t))
}

/** Estado do sistema → palavra da operação. Código sem rótulo vira "outro estado" (RN-02). */
export const ROTULOS_ESTADO: Record<string, string> = {
  // geral
  ativo: 'Ativo',
  inativo: 'Inativo',
  aberto: 'Aberto',
  aberta: 'Aberta',
  fechado: 'Fechado',
  fechada: 'Fechada',
  pendente: 'Pendente',
  rascunho: 'Rascunho',
  em_andamento: 'Em andamento',
  concluido: 'Concluído',
  concluida: 'Concluída',
  cancelado: 'Cancelado',
  cancelada: 'Cancelada',
  // produção e conferência
  programada: 'Programada',
  iniciada: 'Iniciada',
  conferida: 'Conferida',
  aprovada: 'Aprovada',
  reprovada: 'Reprovada',
  divergente: 'Divergente',
  retificado: 'Corrigido',
  ja_registrado: 'Já registrado',
  // envio ao Omie
  autorizada: 'Autorizada',
  autorizado: 'Autorizado',
  desautorizada: 'Autorização retirada',
  enviada: 'Enviada',
  enviado: 'Enviado',
  em_envio: 'Enviando',
  simulada: 'Simulada',
  simulado: 'Simulado',
  falhou: 'Não enviada',
  bloqueada: 'Bloqueada',
  bloqueado: 'Bloqueado',
  conferido: 'Conferido',
  // compras, recebimento, pedidos
  enviado_ao_fornecedor: 'Enviado ao fornecedor',
  aguardando: 'Aguardando',
  recebido: 'Recebido',
  recebida: 'Recebida',
  parcial: 'Parcial',
  atrasado: 'Atrasado',
  atrasada: 'Atrasada',
  liberado: 'Liberado',
  liberada: 'Liberada',
  lancado: 'Lançado',
  lancada: 'Lançada',
  pago: 'Pago',
  paga: 'Paga',
  // alertas
  assumido: 'Assumido',
  tratado: 'Tratado',
  tratada: 'Tratada',
  critico: 'Crítico',
  critica: 'Crítica',
  atencao: 'Atenção',
  informativo: 'Informativo',
  // estados que as telas usam (SPEC-4-004, CA-4-17)
  em_analise: 'Em análise',
  revisavel: 'Para revisar',
  confirmada: 'Confirmada',
  preparada: 'Preparada',
  enviando: 'Enviando',
  resultado_incerto: 'Resultado incerto',
  falhou_sem_efeito: 'O Omie recusou; nada foi gravado',
  gravado_e_conferido: 'Gravado e conferido',
  conferido_sem_estoque: 'Conferido; estoque ainda não comparado',
  inconclusivo: 'Inconclusivo',
  comparavel: 'Comparável',
  sem_fator: 'Sem fator de conversão',
  preco_pendente: 'Preço pendente',
  replay: 'Já registrado',
  aprovado: 'Aprovado',
  conflito_versao: 'Alguém alterou antes',
  registrado: 'Registrado',
  a_revisar: 'A revisar',
  bloqueado_duplicata: 'Bloqueado: pedido repetido',
  apto: 'Apto',
  ok: 'Certo',
  em_cotacao: 'Em cotação',
  em_aprovacao: 'Em aprovação',
  recusada: 'Recusada',
  ligado: 'Ligado',
  calculada: 'Calculada',
  rascunho_criado: 'Rascunho criado',
  igual: 'Igual ao operacional',
  trocar_senha: 'Troca de senha pendente',
  // demonstração
  demonstracao: 'Dados de demonstração',
}

export const OUTRO_ESTADO = 'outro estado'

export const rotuloEstado = (codigo: unknown): string => {
  const c = String(codigo ?? '').trim()
  if (c && Object.prototype.hasOwnProperty.call(ROTULOS_ESTADO, c)) return ROTULOS_ESTADO[c]
  try {
    console.warn('Estado sem rótulo no dicionário:', c)
  } catch {
    // sem console: segue
  }
  return OUTRO_ESTADO
}

/** Sem informação, com o motivo quando houver (substitui null / ausente / sem dado). */
export const semInformacao = (motivo?: string | null): string => {
  const m = String(motivo ?? '').trim()
  return m && !temPadraoProibido(m) ? `sem informação (${m})` : 'sem informação'
}

/** "bloqueado: motivo" (substitui gate / bloqueia). */
export const bloqueadoPor = (motivo?: string | null): string => {
  const m = String(motivo ?? '').trim()
  return m && !temPadraoProibido(m) ? `bloqueado: ${m}` : 'bloqueado'
}

export interface ErroDaRota {
  status?: number
  codigo?: string
  motivo?: string
  proxima_tentativa?: string | number | null
  response?: Record<string, any> | null
  data?: Record<string, any> | null
  message?: string
}

const horaDe = (valor: unknown): string | null => {
  if (valor === null || valor === undefined || valor === '') return null
  const d = typeof valor === 'number' ? new Date(valor) : new Date(String(valor))
  if (Number.isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d)
}

/** Texto limpo do servidor, se houver; senão, nada. */
const motivoLimpo = (m: unknown): string | null => {
  const s = String(m ?? '').trim()
  return s && !temPadraoProibido(s) ? s : null
}

/** Mensagem para a tela a partir do erro de uma rota. Nunca mostra código, status nem texto técnico. */
export const mensagemDeErro = (erro: unknown): string => {
  const e = (erro ?? {}) as ErroDaRota
  const corpo = (e.response ?? e.data ?? {}) as Record<string, any>
  const status = Number(e.status ?? corpo.status ?? 0)
  const codigo = String(e.codigo ?? corpo.codigo ?? corpo.code ?? '')
  const motivo = e.motivo ?? corpo.motivo ?? corpo.mensagem ?? corpo.message ?? undefined
  const proxima = e.proxima_tentativa ?? corpo.proxima_tentativa ?? null

  if (status === 425 || codigo === 'omie_bloqueado' || codigo === 'omie_pausa') {
    const h = horaDe(proxima)
    return h
      ? `O Omie pediu uma pausa. Nova tentativa às ${h}.`
      : 'O Omie pediu uma pausa. Tente de novo mais tarde.'
  }
  if (status === 401) return 'Sua sessão terminou. Entre de novo.'
  if (status === 403) return 'Você não tem acesso a esta ação. Fale com o gestor.'
  if (status === 404) return 'Não encontramos este registro.'
  if (status === 409) {
    if (codigo === 'pedido_alterado_apos_autorizacao')
      return 'O pedido mudou depois da autorização. Peça a autorização de novo.'
    return 'Alguém alterou isto antes de você. A tela foi atualizada; confira e salve de novo.'
  }
  if (status === 422) {
    if (codigo === 'pedido_diferente') return 'A quantidade não bate com o pedido do Omie.'
    return motivoLimpo(motivo) ?? GENERICA_CONFERIR
  }
  if (status === 423) return 'O envio ao Omie está desligado. Só o dono liga.'
  if (status >= 400 && status < 500) return motivoLimpo(motivo) ?? GENERICA_FALHA
  return GENERICA_FALHA
}

/** Texto vindo de fora da tela (servidor ou módulo de regra): só aparece se estiver limpo. */
export const textoSeguro = (texto: unknown, alternativa: string = GENERICA_CONFERIR): string => {
  const t = String(texto ?? '').trim()
  return t && !temPadraoProibido(t) ? t : alternativa
}

/** Grupo de cada estado para o selo colorido (SPEC-4-005). Estado fora daqui mostra o selo neutro. */
export type GrupoSelo = 'verde' | 'amarelo' | 'vermelho' | 'azul' | 'demonstracao' | 'neutro'

const grupo = (g: GrupoSelo, estados: string[]): Record<string, GrupoSelo> =>
  Object.fromEntries(estados.map((e) => [e, g]))

export const GRUPOS_SELO: Record<string, GrupoSelo> = {
  ...grupo('verde', [
    'ativo',
    'concluido',
    'concluida',
    'conferida',
    'conferido',
    'aprovada',
    'aprovado',
    'tratado',
    'tratada',
    'registrado',
    'recebido',
    'recebida',
    'pago',
    'paga',
    'confirmada',
    'gravado_e_conferido',
    'comparavel',
    'calculada',
    'ok',
    'igual',
    'ja_registrado',
    'replay',
    'retificado',
    'iniciada',
    'rascunho_criado',
    'apto',
  ]),
  ...grupo('amarelo', [
    'pendente',
    'em_analise',
    'aguardando',
    'preparada',
    'rascunho',
    'revisavel',
    'a_revisar',
    'preco_pendente',
    'em_cotacao',
    'em_aprovacao',
    'resultado_incerto',
    'aberto',
    'aberta',
    'parcial',
    'em_andamento',
    'conferido_sem_estoque',
    'inconclusivo',
    'conflito_versao',
    'atrasado',
    'atrasada',
    'trocar_senha',
    'sem_fator',
    'atencao',
    'divergente',
  ]),
  ...grupo('vermelho', [
    'bloqueado',
    'bloqueada',
    'recusada',
    'reprovada',
    'falhou',
    'falhou_sem_efeito',
    'bloqueado_duplicata',
    'cancelado',
    'cancelada',
    'critico',
    'critica',
    'inativo',
  ]),
  ...grupo('azul', [
    'liberado',
    'liberada',
    'lancado',
    'lancada',
    'enviado',
    'enviada',
    'enviando',
    'em_envio',
    'enviado_ao_fornecedor',
    'autorizada',
    'autorizado',
    'desautorizada',
    'ligado',
    'simulada',
    'simulado',
    'programada',
    'assumido',
    'informativo',
  ]),
  ...grupo('demonstracao', ['demonstracao']),
  ...grupo('neutro', ['fechado', 'fechada']),
}

export const grupoDoEstado = (estado: unknown): GrupoSelo =>
  GRUPOS_SELO[String(estado ?? '').trim()] ?? 'neutro'
