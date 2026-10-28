/**
 * Autorização do dono e conferência depois do envio — SPEC-3-002, CA-3-07.
 *
 * Camada pura sobre envio-op.ts e fila-omie.ts. O dono vê o que vai ser gravado (ordem, produto,
 * quantidade, data, local e efeito esperado no estoque) e autoriza UMA ordem por vez; conteúdo
 * diferente do que ele viu invalida a autorização. Depois do envio, a conferência só LÊ o Omie:
 * compara ordem, quantidade, status e estoque e devolve "gravado e conferido" ou a divergência,
 * sem nunca pedir nova gravação. Nenhuma função aqui chama o Omie.
 */
import { autorizarPayload, type Transacao } from './fila-omie.ts'
import {
  hashDoPayload,
  payloadCanonico,
  type ChaveEscrita,
  type PayloadConcluirOp,
} from './envio-op.ts'

export const ACAO_AUTORIZAR = 'autorizar_escrita_omie'

export interface ResumoParaDono {
  op_id: string
  ordem: string
  produto: string
  quantidade: number
  unidade: string
  data: string
  local: string
  efeito_no_estoque: string
  hash: string
}

/** Texto que o dono confere antes de autorizar. Informação que falta aparece como "não informado". */
export function resumoParaDono(
  t: Transacao,
  payload: PayloadConcluirOp,
  extra: { produto: string | null; local: string | null; unidade: string | null },
): ResumoParaDono {
  const produto = extra.produto ?? 'produto não informado'
  const unidade = extra.unidade ?? 'unidade desconhecida'
  const local = extra.local ?? 'local não informado'
  return {
    op_id: t.op_id,
    ordem: payload.cCodIntOP || String(payload.nCodOP ?? ''),
    produto,
    quantidade: payload.nQtdeProduzida,
    unidade,
    data: payload.dDtConclusao,
    local,
    efeito_no_estoque:
      'Esperado: o próprio Omie dá entrada de ' +
      payload.nQtdeProduzida +
      ' ' +
      unidade +
      ' de ' +
      produto +
      ' no estoque (' +
      local +
      ') ao concluir a ordem. O sistema não envia baixa adicional. O efeito exato é conferido na primeira gravação.',
    hash: hashDoPayload(payload),
  }
}

export type RespostaAutorizar =
  | { http: 403; erro: 'sem_permissao' }
  | { http: 409; erro: 'estado_nao_autoriza' | 'outra_ordem_autorizada'; motivo: string }
  | { http: 422; erro: 'conteudo_diferente_do_visto'; motivo: string }
  | {
      http: 200
      transacao: Transacao
      chave: ChaveEscrita
      autorizadaPor: string
      autorizadaEm: string
    }

/**
 * Só quem tem a ação autorizar_escrita_omie (o dono) liga a chave, e só para esta ordem. Uma ordem
 * por vez: com a chave já ligada para outra ordem, nega. O hash que o dono viu tem de ser o do
 * conteúdo atual.
 */
export function autorizarOrdem(entrada: {
  transacao: Transacao
  payload: PayloadConcluirOp
  hashVisto: string
  chaveAtual: ChaveEscrita
  conta: { acoes: string[]; usuario: string }
  agora: Date
}): RespostaAutorizar {
  const { transacao: t, payload, hashVisto, chaveAtual, conta } = entrada
  if (!conta.acoes.includes(ACAO_AUTORIZAR)) return { http: 403, erro: 'sem_permissao' }
  if (t.estado !== 'preparada') {
    return {
      http: 409,
      erro: 'estado_nao_autoriza',
      motivo: 'transação em estado ' + t.estado + ': só preparada pode ser autorizada',
    }
  }
  if (chaveAtual.ligada && chaveAtual.escopo !== t.transacao_id) {
    return {
      http: 409,
      erro: 'outra_ordem_autorizada',
      motivo: 'já existe outra ordem autorizada: uma por vez',
    }
  }
  const hashAtual = hashDoPayload(payload)
  if (hashVisto !== hashAtual || (t.payload_hash !== null && t.payload_hash !== hashAtual)) {
    return {
      http: 422,
      erro: 'conteudo_diferente_do_visto',
      motivo: 'o conteúdo mudou depois que você conferiu; confira de novo',
    }
  }
  const autorizada = autorizarPayload(
    t,
    { payload_hash: hashAtual, aprovador: conta.usuario },
    payloadCanonico(payload),
  )
  return {
    http: 200,
    transacao: autorizada,
    chave: { ligada: true, escopo: t.transacao_id },
    autorizadaPor: conta.usuario,
    autorizadaEm: entrada.agora.toISOString(),
  }
}

/** O dono pode desfazer a autorização enquanto nada foi enviado: volta a preparada e a chave desliga. */
export function desautorizarOrdem(entrada: {
  transacao: Transacao
  chaveAtual: ChaveEscrita
  conta: { acoes: string[] }
}):
  | { http: 403; erro: 'sem_permissao' }
  | { http: 409; erro: 'ja_enviada'; motivo: string }
  | { http: 200; transacao: Transacao; chave: ChaveEscrita } {
  const { transacao: t, chaveAtual, conta } = entrada
  if (!conta.acoes.includes(ACAO_AUTORIZAR)) return { http: 403, erro: 'sem_permissao' }
  if (t.estado !== 'autorizada') {
    return {
      http: 409,
      erro: 'ja_enviada',
      motivo: 'transação em estado ' + t.estado + ': só autorizada pode ser desfeita',
    }
  }
  const chave: ChaveEscrita =
    chaveAtual.escopo === t.transacao_id ? { ligada: false, escopo: null } : chaveAtual
  return { http: 200, transacao: { ...t, estado: 'preparada', payload_hash: null }, chave }
}

export interface LeituraOrdem {
  encontrou: boolean
  quantidade: number | null
  /** cConcluida do Omie: true = concluída. null = a leitura não informou. */
  concluida: boolean | null
}

export interface LeituraEstoque {
  antes: number | null
  depois: number | null
}

export type ResultadoConferencia =
  | 'gravado_e_conferido'
  | 'conferido_sem_estoque'
  | 'divergente'
  | 'inconclusivo'

export interface Conferencia {
  resultado: ResultadoConferencia
  checagens: {
    ordem: boolean | null
    quantidade: boolean | null
    status: boolean | null
    estoque: boolean | null
  }
  detalhes: string[]
  /** Nunca há nova gravação por causa da conferência. */
  novaGravacaoAutorizada: false
}

/**
 * Compara o que o Omie mostra com o que foi enviado. Ordem não encontrada = inconclusivo (ausência
 * não prova ausência de efeito). Qualquer diferença = divergente. Estoque sem posição anterior não
 * é comparável: o resultado vira "conferido sem estoque", nunca "conferido".
 */
export function conferirDepoisDoEnvio(
  t: Transacao,
  leitura: LeituraOrdem,
  estoque: LeituraEstoque | null,
): Conferencia {
  const detalhes: string[] = []
  if (!leitura.encontrou) {
    return {
      resultado: 'inconclusivo',
      checagens: { ordem: null, quantidade: null, status: null, estoque: null },
      detalhes: [
        'A ordem não foi encontrada na leitura; ausência não prova que não houve efeito. Nenhuma nova gravação.',
      ],
      novaGravacaoAutorizada: false,
    }
  }
  const quantidade = leitura.quantidade === t.quantidade
  if (!quantidade) {
    detalhes.push(
      'Quantidade no Omie: ' + String(leitura.quantidade) + '; enviada: ' + t.quantidade + '.',
    )
  }
  const status = leitura.concluida === true
  if (!status) {
    detalhes.push(
      leitura.concluida === null
        ? 'O Omie não informou o status da ordem.'
        : 'A ordem não aparece como concluída no Omie.',
    )
  }
  let est: boolean | null = null
  if (estoque && estoque.antes !== null && estoque.depois !== null) {
    est = Math.abs(estoque.depois - estoque.antes - t.quantidade) < 1e-9
    if (!est) {
      detalhes.push(
        'Estoque variou ' + (estoque.depois - estoque.antes) + '; esperado ' + t.quantidade + '.',
      )
    }
  } else {
    detalhes.push('Estoque não comparado: falta a posição de antes do envio.')
  }
  const checagens = { ordem: true, quantidade, status, estoque: est }
  if (!quantidade || !status || est === false) {
    return { resultado: 'divergente', checagens, detalhes, novaGravacaoAutorizada: false }
  }
  return {
    resultado: est === true ? 'gravado_e_conferido' : 'conferido_sem_estoque',
    checagens,
    detalhes,
    novaGravacaoAutorizada: false,
  }
}
