/**
 * Produção guardada no servidor — patch de 02/11/2026.
 *
 * Contrato puro das rotas /backend/v1/pcp/producao/*: programação publicada com versão, apontamentos
 * imutáveis com idempotência, conferências, aprovação da consolidação e a ordem preparada para o Omie
 * a partir da aprovação. Nada aqui chama o Omie: a ordem nasce `preparada`, com a chave de escrita
 * desligada, e só vai ao Omie pelas rotas de autorização e envio da SPEC-3-002.
 */
import { montarPayloadConcluir, hashDoPayload } from './envio-op.ts'

export interface LinhaProgramada {
  produto: string
  quantidade: number
  data: string
  recurso: string
}

/** Valida a programação a publicar: cada linha com produto, quantidade positiva, data e recurso. */
export function validarProgramacao(linhas: LinhaProgramada[]): { ok: boolean; motivos: string[] } {
  const motivos: string[] = []
  if (!Array.isArray(linhas) || linhas.length === 0) motivos.push('programação vazia')
  ;(linhas ?? []).forEach((l, i) => {
    const n = i + 1
    if (!String(l?.produto ?? '').trim()) motivos.push('linha ' + n + ': produto obrigatório')
    if (!Number.isFinite(l?.quantidade) || l.quantidade <= 0)
      motivos.push('linha ' + n + ': quantidade precisa ser maior que zero')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(l?.data ?? '')))
      motivos.push('linha ' + n + ': data inválida')
    if (!String(l?.recurso ?? '').trim()) motivos.push('linha ' + n + ': recurso obrigatório')
  })
  return { ok: motivos.length === 0, motivos }
}

/** Uma ordem por linha programada: OP-<versão>-<sequência de 3 dígitos>. */
export function ordensDaProgramacao(versao: number, linhas: LinhaProgramada[]) {
  return linhas.map((l, i) => ({
    op_id: 'OP-' + versao + '-' + String(i + 1).padStart(3, '0'),
    versao_op: versao,
    produto: l.produto.trim().toUpperCase(),
    quantidade: l.quantidade,
    data: l.data,
    recurso: l.recurso.trim(),
  }))
}

/** Publicação com versão esperada: outra publicação chegou antes = 409, nada é sobrescrito. */
export function decidirPublicacao(versaoAtual: number, versaoEsperada: number) {
  return versaoEsperada === versaoAtual
    ? ({ ok: true, versao: versaoAtual + 1 } as const)
    : ({ ok: false, http: 409, erro: 'conflito_de_versao', versaoAtual } as const)
}

export interface EventoGuardado {
  evento_id: string
  tipo: string
  ponto: string
  quantidade: number
  retifica?: string | null
}

/** Realizado eficaz de um ponto: eventos `realizado` não retificados, somando incrementos. */
export function realizadoDoPonto(eventos: EventoGuardado[], ponto: string): number {
  const retificados = new Set(eventos.filter((e) => e.retifica).map((e) => e.retifica as string))
  return eventos
    .filter((e) => e.tipo === 'realizado' && e.ponto === ponto && !retificados.has(e.evento_id))
    .reduce((s, e) => s + e.quantidade, 0)
}

export interface AprovacaoEntrada {
  aprovacao_id: string
  op_id: string
  quantidade_final: number
  motivo: string
  data_conclusao: string
  expedicao: number | null
  camara: number | null
  /** Conta de teste ou produto de demonstração: aprova e registra, mas não prepara ordem. */
  demonstracao?: boolean
}

export type DecisaoAprovacao =
  | { ok: false; http: 422; erro: string; motivo: string }
  | {
      ok: true
      pendencias: string[]
      /** null quando a quantidade final é 0: aprovação registrada, nenhuma ordem preparada. */
      ordem: {
        transacao_id: string
        op_id: string
        operacao: 'concluir_op'
        codigo_integracao: string
        quantidade: number
        payload: ReturnType<typeof montarPayloadConcluir> extends infer R
          ? R extends { ok: true; payload: infer P }
            ? P
            : never
          : never
        payload_hash: string
        estado: 'preparada'
      } | null
    }

/** Aprova a consolidação e, com quantidade final positiva, prepara a ordem para o Omie (sem enviar). */
export function decidirAprovacao(e: AprovacaoEntrada): DecisaoAprovacao {
  if (!Number.isFinite(e.quantidade_final) || e.quantidade_final < 0)
    return {
      ok: false,
      http: 422,
      erro: 'quantidade_invalida',
      motivo: 'quantidade final precisa ser finita e maior ou igual a zero',
    }
  if (!String(e.motivo ?? '').trim())
    return {
      ok: false,
      http: 422,
      erro: 'motivo_obrigatorio',
      motivo: 'a aprovação exige o motivo da decisão do PCP',
    }
  if (e.expedicao === null || e.camara === null)
    return {
      ok: false,
      http: 422,
      erro: 'conferencia_ausente',
      motivo:
        'registre a conferência de expedição e a de câmara antes de aprovar (ausência nunca vira 0)',
    }
  if (e.demonstracao === true)
    return {
      ok: true,
      ordem: null,
      pendencias: ['registro_de_demonstracao: nenhuma ordem preparada; nunca vai ao Omie'],
    }
  if (e.quantidade_final === 0)
    return {
      ok: true,
      ordem: null,
      pendencias: [
        'quantidade_final_zero: nenhuma ordem preparada; decisão do PCP permanece pendente',
      ],
    }
  const m = montarPayloadConcluir({
    nCodOP: null,
    cCodIntOP: e.op_id,
    dataConclusao: e.data_conclusao,
    quantidade: e.quantidade_final,
    observacao: e.motivo,
  })
  if (!m.ok) return { ok: false, http: 422, erro: 'payload_invalido', motivo: m.motivo }
  return {
    ok: true,
    pendencias: [],
    ordem: {
      transacao_id: 'TX-' + e.aprovacao_id,
      op_id: e.op_id,
      operacao: 'concluir_op',
      codigo_integracao: e.op_id,
      quantidade: e.quantidade_final,
      payload: m.payload,
      payload_hash: hashDoPayload(m.payload),
      estado: 'preparada',
    },
  }
}

/** Nova aprovação só substitui a ordem anterior se ela ainda não foi enviada (preparada ou autorizada). */
export function ordemAnteriorPodeSerSubstituida(estado: string): boolean {
  return estado === 'preparada' || estado === 'autorizada' || estado === 'bloqueada'
}
