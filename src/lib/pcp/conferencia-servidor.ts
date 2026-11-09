/**
 * Conferências, aprovação e consolidações pelo servidor — SPEC-4-001 (CA-4-03, CA-4-05).
 * Contrato puro das telas /conferencias e /consolidacoes: quem pode o quê, mensagens provisórias
 * (a SPEC-4-004 centraliza), fila da ordem e linhas de consolidação lidas do estado do servidor.
 * Não muda regra de conferência, aprovação nem envio: elas ficam nas rotas e em conferencia.ts.
 */
import { montarFila, type Consolidacao, type RegistroConferencia } from './conferencia.ts'
import { resumoDaOrdem, type EventoLido } from './apontamento-servidor.ts'

export type EtapaServidor = 'recebimento_expedicao' | 'entrada_camara'

export interface PerfilTela {
  areas?: string[]
  acoes?: string[]
  pontos?: string[]
}

const REGRA_ETAPA: Record<EtapaServidor, { acao: string; ponto: string }> = {
  recebimento_expedicao: { acao: 'conferir_expedicao', ponto: 'expedicao' },
  entrada_camara: { acao: 'conferir_camara', ponto: 'camara_fria' },
}

/** Mesmo critério da rota: ação da etapa, ponto da etapa e a área conferir_expedicao. */
export function podeConferir(perfil: PerfilTela | null | undefined, etapa: EtapaServidor): boolean {
  if (!perfil) return false
  const r = REGRA_ETAPA[etapa]
  return (
    (perfil.acoes ?? []).includes(r.acao) &&
    (perfil.pontos ?? []).includes(r.ponto) &&
    (perfil.areas ?? []).includes('conferir_expedicao')
  )
}

/** Mesmo critério da rota de aprovação: ação aprovar_consolidacao e a área painel. */
export function podeAprovar(perfil: PerfilTela | null | undefined): boolean {
  if (!perfil) return false
  return (
    (perfil.acoes ?? []).includes('aprovar_consolidacao') && (perfil.areas ?? []).includes('painel')
  )
}

/** Identificador gerado na tela; a mesma tentativa reaproveita o mesmo até o servidor responder. */
export function novoId(prefixo: string): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  if (c && typeof c.randomUUID === 'function') return prefixo + '-' + c.randomUUID()
  return prefixo + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10)
}

export interface Mensagem {
  ok: boolean
  texto: string
  recarregar: boolean
  manterId: boolean
}

const SEM_ACESSO = 'Você não tem acesso a essa ação.'
const TENTE_DE_NOVO =
  'Não foi possível registrar agora. Tente de novo: o mesmo registro não duplica.'

export function mensagemDaConferencia(http: number, corpo: any): Mensagem {
  if (http === 200 && corpo?.estado === 'replay')
    return {
      ok: true,
      texto: 'Essa conferência já estava registrada. Nada foi duplicado.',
      recarregar: true,
      manterId: false,
    }
  if (http === 200)
    return {
      ok: true,
      texto: corpo?.aprovacao_invalidada
        ? 'Conferência registrada. A aprovação do PCP dessa ordem foi invalidada e precisa ser refeita.'
        : 'Conferência registrada.',
      recarregar: true,
      manterId: false,
    }
  if (http === 401 || http === 403)
    return { ok: false, texto: SEM_ACESSO, recarregar: false, manterId: false }
  if (http === 409 && corpo?.erro === 'ordem_em_envio')
    return {
      ok: false,
      texto: 'Essa ordem já está em envio ao Omie e não recebe mais conferência.',
      recarregar: true,
      manterId: false,
    }
  if (http === 409)
    return {
      ok: false,
      texto:
        'Esse identificador já foi usado com outro conteúdo. Recarregue a tela e registre de novo.',
      recarregar: true,
      manterId: false,
    }
  if (http === 422) {
    const m: Record<string, string> = {
      ordem_inexistente: 'Essa ordem não está na programação publicada.',
      quantidade_invalida: 'Digite a quantidade conferida (zero ou mais).',
      unidade_desconhecida: 'Informe a unidade.',
      registro_e_ordem_obrigatorios: 'Escolha a ordem.',
    }
    return {
      ok: false,
      texto: m[String(corpo?.erro ?? '')] ?? 'A conferência não foi aceita.',
      recarregar: false,
      manterId: false,
    }
  }
  return { ok: false, texto: TENTE_DE_NOVO, recarregar: false, manterId: true }
}

export function mensagemDaAprovacao(http: number, corpo: any): Mensagem {
  if (http === 200 && corpo?.estado === 'replay')
    return {
      ok: true,
      texto: 'Essa aprovação já estava registrada. Nada foi duplicado.',
      recarregar: true,
      manterId: false,
    }
  if (http === 200) {
    const pend: string[] = Array.isArray(corpo?.pendencias) ? corpo.pendencias : []
    const base = corpo?.ordem
      ? 'Aprovação registrada. A ordem de conclusão ficou preparada; nada foi enviado ao Omie.'
      : 'Aprovação registrada. Nenhuma ordem foi preparada.'
    return {
      ok: true,
      texto: pend.length > 0 ? `${base} Pendência: ${pend[0]}` : base,
      recarregar: true,
      manterId: false,
    }
  }
  if (http === 401 || http === 403)
    return { ok: false, texto: SEM_ACESSO, recarregar: false, manterId: false }
  if (http === 409) {
    const m: Record<string, string> = {
      ordem_ja_enviada: 'Essa ordem já foi enviada ao Omie e não aceita nova aprovação.',
      ordem_autorizada: 'Essa ordem está autorizada para envio. O dono precisa desautorizar antes.',
      aprovacao_de_outra_ordem:
        'Esse identificador de aprovação pertence a outra ordem. Recarregue a tela.',
    }
    return {
      ok: false,
      texto: m[String(corpo?.erro ?? '')] ?? 'A aprovação não pôde ser registrada agora.',
      recarregar: true,
      manterId: false,
    }
  }
  if (http === 422) {
    const m: Record<string, string> = {
      conferencia_ausente:
        'Faltam as conferências de expedição e de câmara. Registre as duas antes de aprovar.',
      motivo_obrigatorio: 'Informe o motivo da decisão.',
      quantidade_invalida: 'Informe a quantidade final (zero ou mais).',
      payload_invalido: 'A data de conclusão é inválida.',
      ordem_inexistente: 'Essa ordem não está na programação publicada.',
      aprovacao_e_ordem_obrigatorias: 'Escolha a ordem.',
    }
    return {
      ok: false,
      texto: m[String(corpo?.erro ?? '')] ?? 'A aprovação não foi aceita.',
      recarregar: false,
      manterId: false,
    }
  }
  return {
    ok: false,
    texto: 'Não foi possível aprovar agora. Tente de novo: a mesma aprovação não duplica.',
    recarregar: false,
    manterId: true,
  }
}

export interface EstadoParaFila {
  programacao: { ops: { op_id: string; versao_op: number; produto: string }[] } | null
  eventos: EventoLido[]
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

/** Fila da ordem: produzido e encaixotado vêm dos apontamentos do servidor; a conta é a de conferencia.ts. */
export function filaDaOrdem(estado: EstadoParaFila, opId: string): Consolidacao | null {
  const op = estado.programacao?.ops.find((o) => o.op_id === opId)
  if (!op) return null
  const real = resumoDaOrdem(estado.eventos, opId).realizado
  const registros = estado.conferencias
    .filter((c) => c.op_id === opId)
    .map((c) => ({
      ...c,
      conferencia_id: c.registro_id,
      versao_op: op.versao_op,
    })) as unknown as RegistroConferencia[]
  return montarFila(
    { op_id: op.op_id, versao_op: op.versao_op },
    real['cozinha'] ?? 0,
    real['encaixotamento'] ?? 0,
    registros,
  )
}

export function aprovacaoAtiva(estado: EstadoParaFila, opId: string) {
  return estado.aprovacoes.find((a) => a.op_id === opId && a.estado === 'ativa') ?? null
}

export interface LinhaConsolidacao {
  op_id: string
  produto: string
  expedicao: number | null
  camara: number | null
  aprovacao: { quantidade_final: number; motivo: string; aprovador: string; estado: string } | null
  ordem: { estado: string; quantidade: number } | null
  situacao: string
}

/** Lista de /consolidacoes: só leitura. Nenhum botão de envio; o envio é a tela /envio-omie. */
export function linhasConsolidacao(estado: EstadoParaFila): LinhaConsolidacao[] {
  const ops = estado.programacao?.ops ?? []
  return ops.map((o) => {
    const doOp = estado.conferencias.filter((c) => c.op_id === o.op_id)
    const ultima = (etapa: string) =>
      [...doOp].reverse().find((c) => c.etapa === etapa)?.quantidade ?? null
    const ap = estado.aprovacoes.find((a) => a.op_id === o.op_id) ?? null
    const ativa = aprovacaoAtiva(estado, o.op_id)
    const ordem = estado.ordens.find((t) => t.op_id === o.op_id) ?? null
    let situacao = 'Sem conferência'
    if (ordem) situacao = `Ordem ${ordem.estado}`
    else if (ativa) situacao = 'Aprovada, sem ordem preparada'
    else if (ap) situacao = `Aprovação ${ap.estado}`
    else if (ultima('recebimento_expedicao') !== null && ultima('entrada_camara') !== null)
      situacao = 'Aguardando aprovação do PCP'
    else if (doOp.length > 0) situacao = 'Conferência incompleta'
    return {
      op_id: o.op_id,
      produto: o.produto,
      expedicao: ultima('recebimento_expedicao'),
      camara: ultima('entrada_camara'),
      aprovacao: ap
        ? {
            quantidade_final: ap.quantidade_final,
            motivo: ap.motivo,
            aprovador: ap.aprovador,
            estado: ap.estado,
          }
        : null,
      ordem: ordem ? { estado: ordem.estado, quantidade: ordem.quantidade } : null,
      situacao,
    }
  })
}
