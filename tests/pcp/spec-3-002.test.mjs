// tests/pcp/spec-3-002.test.mjs — SPEC-3-002 CA-3-06 (P3.02-01, P3.02-03, P3.02-04)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  conferirDepoisDoEnvio,
  criarSimuladorOmie,
  enviarOp,
  hashDoPayload,
  montarPayloadConcluir,
  payloadCanonico,
} from '../../src/lib/pcp/envio-op.ts'
import { autorizarPayload, prepararTransacao } from '../../src/lib/pcp/fila-omie.ts'

const AGORA = new Date('2026-10-28T12:00:00Z')
const CONTA = { acoes: ['executar_sync_omie'] }
const LIGADA = { ligada: true, escopo: 'T1' }
const DESLIGADA = { ligada: false, escopo: null }

function ordem100() {
  const m = montarPayloadConcluir({
    nCodOP: '9858633368',
    cCodIntOP: 'AG-OP-1',
    dataConclusao: '2026-10-28',
    quantidade: 100,
    observacao: 'conferida pelo PCP',
  })
  assert.equal(m.ok, true)
  const prep = prepararTransacao({
    transacao_id: 'T1',
    op_id: 'OP-1',
    revisao_consolidacao: 1,
    operacao: 'concluir_op',
    codigo_integracao: 'AG-OP-1',
    quantidade: 100,
  })
  const t = autorizarPayload(prep.transacao, { payload_hash: m.hash, aprovador: 'dono' }, payloadCanonico(m.payload))
  assert.equal(t.estado, 'autorizada')
  return { payload: m.payload, t }
}

const envia = (t, payload, sim, extra = {}) =>
  enviarOp({ transacao: t, chave: LIGADA, conta: CONTA, payload, adapter: sim.adapter, agora: AGORA, leaseMs: 60000, temLease: true, ...extra })

test('P3.02-01: chave desligada responde 423 e não faz nenhuma chamada', () => {
  const { payload, t } = ordem100()
  const sim = criarSimuladorOmie('normal')
  const r = envia(t, payload, sim, { chave: DESLIGADA })
  assert.equal(r.http, 423)
  assert.equal(r.mensagem, 'envio desligado: aguarda autorização do dono')
  assert.equal(sim.gravacoes(), 0)
})

test('chave ligada para outra transação também responde 423; sem a ação, 403; ambos sem chamadas', () => {
  const { payload, t } = ordem100()
  const sim = criarSimuladorOmie('normal')
  assert.equal(envia(t, payload, sim, { chave: { ligada: true, escopo: 'OUTRA' } }).http, 423)
  assert.equal(envia(t, payload, sim, { conta: { acoes: [] } }).http, 403)
  assert.equal(sim.gravacoes(), 0)
})

test('P3.02-03: ordem de 100 UN autorizada no simulador conclui uma vez e a leitura confere 100', () => {
  const { payload, t } = ordem100()
  const sim = criarSimuladorOmie('normal')
  const r = envia(t, payload, sim)
  assert.equal(r.http, 200)
  assert.equal(r.estado, 'confirmada')
  assert.equal(sim.gravacoes(), 1)
  assert.equal(r.transacao.posts_mutantes, 1)
  assert.deepEqual(sim.consultar('AG-OP-1'), { encontrou: true, quantidade: 100, concluida: true })
  assert.deepEqual(r.chaveDepois, { ligada: false, escopo: null })
})

test('clique duplo e dois trabalhadores: uma gravação só', () => {
  const { payload, t } = ordem100()
  const sim = criarSimuladorOmie('normal')
  const primeiro = envia(t, payload, sim)
  const segundo = envia(primeiro.transacao, payload, sim) // clique duplo: já confirmada
  assert.equal(segundo.http, 409)
  const { t: t2 } = ordem100()
  const semLease = envia(t2, payload, criarSimuladorOmie('normal'), { temLease: false })
  assert.equal(semLease.http, 409)
  assert.equal(sim.gravacoes(), 1)
})

test('P3.02-04: resposta perdida → incerto → só consulta → confirmada, total de gravações = 1', () => {
  const { payload, t } = ordem100()
  const sim = criarSimuladorOmie('corta_resposta')
  const r = envia(t, payload, sim)
  assert.equal(r.estado, 'resultado_incerto')
  const repetir = envia(r.transacao, payload, sim)
  assert.equal(repetir.http, 409) // nunca reenvia depois de incerto
  const c = conferirDepoisDoEnvio(r.transacao, sim.consultar('AG-OP-1'))
  assert.equal(c.estado, 'confirmada')
  assert.equal(c.novoPostAutorizado, false)
  assert.equal(sim.gravacoes(), 1)
})

test('timeout sem efeito: consulta não acha, segue incerto, sem nova gravação', () => {
  const { payload, t } = ordem100()
  const sim = criarSimuladorOmie('timeout_sem_efeito')
  const r = envia(t, payload, sim)
  assert.equal(r.estado, 'resultado_incerto')
  const c = conferirDepoisDoEnvio(r.transacao, sim.consultar('AG-OP-1'))
  assert.equal(c.estado, 'resultado_incerto')
  assert.equal(c.novoPostAutorizado, false)
  assert.equal(sim.gravacoes(), 1)
})

test('recusa do Omie: falhou sem efeito e a chave volta a desligar', () => {
  const { payload, t } = ordem100()
  const r = envia(t, payload, criarSimuladorOmie('recusa'))
  assert.equal(r.estado, 'falhou_sem_efeito')
  assert.equal(r.chaveDepois.ligada, false)
})

test('conteúdo alterado depois da autorização: 422 e zero chamadas', () => {
  const { payload, t } = ordem100()
  const sim = criarSimuladorOmie('normal')
  const alterado = { ...payload, nQtdeProduzida: 99 }
  assert.equal(hashDoPayload(alterado) === t.payload_hash, false)
  const r = envia(t, alterado, sim)
  assert.equal(r.http, 422)
  assert.equal(sim.gravacoes(), 0)
})

test('quantidade zero ou negativa nunca monta payload nem prepara envio', () => {
  for (const q of [0, -5, NaN]) {
    const m = montarPayloadConcluir({ nCodOP: '1', cCodIntOP: 'X', dataConclusao: '2026-10-28', quantidade: q })
    assert.equal(m.ok, false)
  }
  const p = prepararTransacao({
    transacao_id: 'T0',
    op_id: 'OP-0',
    revisao_consolidacao: 1,
    operacao: 'concluir_op',
    codigo_integracao: 'X',
    quantidade: 0,
  })
  assert.equal(p.estado, 'bloqueada')
})

test('data fora do formato e ordem sem identificação são recusadas', () => {
  assert.equal(montarPayloadConcluir({ nCodOP: '1', cCodIntOP: 'X', dataConclusao: '28/10/2026', quantidade: 1 }).ok, false)
  assert.equal(montarPayloadConcluir({ nCodOP: null, cCodIntOP: '', dataConclusao: '2026-10-28', quantidade: 1 }).ok, false)
  const ok = montarPayloadConcluir({ nCodOP: null, cCodIntOP: 'X', dataConclusao: '2026-10-28', quantidade: 2.5 })
  assert.equal(ok.ok, true)
  assert.equal(ok.payload.dDtConclusao, '28/10/2026')
})
