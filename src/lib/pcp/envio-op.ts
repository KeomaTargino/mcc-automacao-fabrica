/**
 * Envio da conclusão da ordem de produção ao Omie, com a chave desligada — SPEC-3-002, CA-3-06.
 *
 * Camada pura sobre a fila da fase 2 (fila-omie.ts): monta o payload canônico de ConcluirOrdemProducao
 * (campos da documentação oficial de produtos/op, em contratos-fase-3.md), confere ação, chave, hash,
 * lease e estado nesta ordem e só então chama o adapter. Chave desligada responde 423 e zero chamadas.
 * Um simulador do Omie com o mesmo contrato prova clique duplo, dois trabalhadores, resposta perdida
 * e recusa. Nenhuma função aqui chama o Omie de verdade: o adapter entra por parâmetro.
 */
import {
  enviarComAquisicao,
  reconciliarPorConsulta,
  type AdapterMock,
  type Transacao,
} from './fila-omie.ts'

export const CHAVE_OP = 'omie_op_escrita'
export const MENSAGEM_DESLIGADA = 'envio desligado: aguarda autorização do dono'

export interface ChaveEscrita {
  ligada: boolean
  /** Única transação que o dono autorizou enquanto a chave está ligada. */
  escopo: string | null
}

export interface PayloadConcluirOp {
  operacao: 'concluir_op'
  nCodOP: string | null
  cCodIntOP: string
  dDtConclusao: string
  nQtdeProduzida: number
  cObsConclusao: string
}

/** "aaaa-mm-dd" → "dd/mm/aaaa" (formato do Omie); qualquer outra coisa é inválida. */
function dataParaOmie(iso: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ''))
  if (!m) return null
  const mes = Number(m[2])
  const dia = Number(m[3])
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null
  return m[3] + '/' + m[2] + '/' + m[1]
}

/** Objeto com as chaves sempre na mesma ordem: é o que vai ao adapter e o que a aprovação cobre. */
export function payloadCanonico(p: PayloadConcluirOp): PayloadConcluirOp {
  return {
    operacao: p.operacao,
    nCodOP: p.nCodOP,
    cCodIntOP: p.cCodIntOP,
    dDtConclusao: p.dDtConclusao,
    nQtdeProduzida: p.nQtdeProduzida,
    cObsConclusao: p.cObsConclusao,
  }
}

/** Hash = o JSON canônico (mesmo critério da fila da fase 2: JSON.stringify do payload). */
export function hashDoPayload(p: PayloadConcluirOp): string {
  return JSON.stringify(payloadCanonico(p))
}

export function montarPayloadConcluir(ordem: {
  nCodOP: string | null
  cCodIntOP: string
  dataConclusao: string
  quantidade: number
  observacao?: string
}): { ok: true; payload: PayloadConcluirOp; hash: string } | { ok: false; motivo: string } {
  const cod = String(ordem.cCodIntOP ?? '').trim()
  const nCod =
    ordem.nCodOP === null || ordem.nCodOP === undefined ? null : String(ordem.nCodOP).trim() || null
  if (!cod && !nCod) return { ok: false, motivo: 'ordem sem número nem código de integração' }
  if (!Number.isFinite(ordem.quantidade) || ordem.quantidade <= 0) {
    return { ok: false, motivo: 'quantidade final zero ou negativa nunca é enviada' }
  }
  const data = dataParaOmie(ordem.dataConclusao)
  if (!data) return { ok: false, motivo: 'data de conclusão inválida' }
  const payload: PayloadConcluirOp = {
    operacao: 'concluir_op',
    nCodOP: nCod,
    cCodIntOP: cod,
    dDtConclusao: data,
    nQtdeProduzida: ordem.quantidade,
    cObsConclusao: String(ordem.observacao ?? '')
      .trim()
      .slice(0, 200),
  }
  return { ok: true, payload, hash: hashDoPayload(payload) }
}

export type RespostaEnvio =
  | { http: 403; erro: 'sem_permissao' }
  | { http: 423; erro: 'escrita_desligada'; mensagem: string }
  | { http: 409 | 422; erro: string; motivo: string }
  | {
      http: 200
      estado: 'confirmada' | 'resultado_incerto' | 'falhou_sem_efeito'
      transacao: Transacao
      /** A chave volta a desligar depois de uma tentativa: uma ordem por vez. */
      chaveDepois: ChaveEscrita
    }

/**
 * Ordem das conferências: ação do usuário → chave (ligada e para esta transação) → estado e hash
 * → lease → adapter. Falhou qualquer uma antes do adapter: zero chamadas que gravam.
 */
export function enviarOp(entrada: {
  transacao: Transacao
  chave: ChaveEscrita
  conta: { acoes: string[] }
  payload: PayloadConcluirOp
  adapter: AdapterMock
  agora: Date
  leaseMs: number
  temLease: boolean
}): RespostaEnvio {
  const { transacao: t, chave, conta, payload } = entrada
  if (!conta.acoes.includes('executar_sync_omie')) return { http: 403, erro: 'sem_permissao' }
  if (!chave.ligada || chave.escopo !== t.transacao_id) {
    return { http: 423, erro: 'escrita_desligada', mensagem: MENSAGEM_DESLIGADA }
  }
  if (t.estado !== 'autorizada') {
    return {
      http: 409,
      erro: 'estado_nao_envia',
      motivo: 'transação em estado ' + t.estado + ': só autorizada envia',
    }
  }
  if (t.payload_hash !== hashDoPayload(payload)) {
    return {
      http: 422,
      erro: 'conteudo_diferente_do_autorizado',
      motivo: 'o conteúdo mudou depois da autorização; é preciso autorizar de novo',
    }
  }
  const r = enviarComAquisicao(
    t,
    payloadCanonico(payload),
    entrada.adapter,
    entrada.agora,
    entrada.leaseMs,
    entrada.temLease,
  )
  const chaveDepois: ChaveEscrita = { ligada: false, escopo: null }
  if (r.estado === 'confirmada')
    return { http: 200, estado: 'confirmada', transacao: r.transacao, chaveDepois }
  if (r.estado === 'resultado_incerto') {
    return { http: 200, estado: 'resultado_incerto', transacao: r.transacao, chaveDepois }
  }
  if (r.motivo.indexOf('Falha sem efeito') === 0) {
    return {
      http: 200,
      estado: 'falhou_sem_efeito',
      transacao: { ...t, estado: 'falhou_sem_efeito', posts_mutantes: t.posts_mutantes + 1 },
      chaveDepois,
    }
  }
  // Outro trabalhador com o lease ou transação já tratada: lê o estado, não envia.
  return { http: 409, erro: 'sem_lease', motivo: r.motivo }
}

/** Depois de resposta perdida: só consulta. Consulta conclusiva confirma sem nova gravação. */
export function conferirDepoisDoEnvio(
  t: Transacao,
  consulta: { encontrou: boolean; quantidade: number | null },
) {
  return reconciliarPorConsulta(t, consulta)
}

// ---------------------------------------------------------------------------
// Simulador do Omie — mesmo contrato do adapter real (ConcluirOrdemProducao + consulta).
// ---------------------------------------------------------------------------

export type ModoSimulador = 'normal' | 'corta_resposta' | 'recusa' | 'timeout_sem_efeito'

export interface SimuladorOmie {
  adapter: AdapterMock
  /** Quantas vezes uma gravação chegou ao simulador (prova "uma conclusão"). */
  gravacoes: () => number
  consultar: (cCodIntOP: string) => {
    encontrou: boolean
    quantidade: number | null
    concluida: boolean
  }
}

export function criarSimuladorOmie(modo: ModoSimulador): SimuladorOmie {
  const concluidas: { [cod: string]: number } = {}
  let chamadas = 0
  return {
    adapter: {
      enviar(payload: unknown) {
        chamadas += 1
        const p = payload as PayloadConcluirOp
        if (modo === 'recusa') return { respostaChegou: true, efeitoAplicado: false }
        if (modo === 'timeout_sem_efeito') return { respostaChegou: false, efeitoAplicado: false }
        if (concluidas[p.cCodIntOP] !== undefined)
          return { respostaChegou: true, efeitoAplicado: false }
        concluidas[p.cCodIntOP] = p.nQtdeProduzida
        return { respostaChegou: modo === 'normal', efeitoAplicado: true }
      },
    },
    gravacoes: () => chamadas,
    consultar(cod: string) {
      const q = concluidas[cod]
      return q === undefined
        ? { encontrou: false, quantidade: null, concluida: false }
        : { encontrou: true, quantidade: q, concluida: true }
    },
  }
}
