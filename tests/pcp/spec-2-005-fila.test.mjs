// tests/pcp/spec-2-005-fila.test.mjs — SPEC-2-005 CA-O1/O3/O4 (task c44c11da), recorte MOCK
// Oráculos T1/T2/T3/T4/T6 da SPEC. T5 (caso real autorizado) fica na task 6e38e5a3.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  prepararTransacao,
  autorizarPayload,
  enviarComAquisicao,
  reconciliarPorConsulta,
  OP_FILA_DEMO,
  PAYLOAD_DEMO,
} from '../../src/lib/pcp/fila-omie.ts'

const agora = new Date('2026-10-16T12:00:00Z')

// T1 — CA-O1/O2: sem aprovação zero POST; hash aprovado + payload alterado = bloqueio.
test('T1a: transação preparada sem aprovação → envio negado, zero POST mutante', () => {
  const p = prepararTransacao({ transacao_id: 'TR-1', op_id: OP_FILA_DEMO.op_id, revisao_consolidacao: 1, operacao: 'concluir_op', codigo_integracao: OP_FILA_DEMO.codigo_integracao, quantidade: 100 })
  assert.equal(p.estado, 'preparada')
  const chamadas = []
  const r = enviarComAquisicao(p.transacao, PAYLOAD_DEMO, { enviar: (x) => { chamadas.push(x); return { respostaChegou: true, efeitoAplicado: true } } }, agora, 60000, true)
  assert.equal(r.estado, 'negado')
  assert.equal(chamadas.length, 0)
  assert.equal(p.transacao.posts_mutantes, 0)
})

test('T1b: hash aprovado e payload alterado → bloqueada com aprovação invalidada', () => {
  const p = prepararTransacao({ transacao_id: 'TR-2', op_id: OP_FILA_DEMO.op_id, revisao_consolidacao: 1, operacao: 'concluir_op', codigo_integracao: OP_FILA_DEMO.codigo_integracao, quantidade: 100 })
  const hash = JSON.stringify(PAYLOAD_DEMO)
  const a = autorizarPayload(p.transacao, { payload_hash: hash, aprovador: 'pcp' }, PAYLOAD_DEMO)
  assert.equal(a.estado, 'autorizada')
  const b = autorizarPayload(p.transacao, { payload_hash: hash, aprovador: 'pcp' }, { ...PAYLOAD_DEMO, quantidade: 99 })
  assert.equal(b.estado, 'bloqueada')
  assert.ok(b.pendencias.some((x) => x.includes('invalidada')))
})

// T2 — CA-O3: dois workers/duplo clique → uma aquisição e uma chamada mutante.
test('T2: segundo worker sem lease → negado; primeiro envia uma vez (1 POST)', () => {
  const p = prepararTransacao({ transacao_id: 'TR-3', op_id: OP_FILA_DEMO.op_id, revisao_consolidacao: 1, operacao: 'concluir_op', codigo_integracao: OP_FILA_DEMO.codigo_integracao, quantidade: 100 })
  const a = autorizarPayload(p.transacao, { payload_hash: JSON.stringify(PAYLOAD_DEMO), aprovador: 'pcp' }, PAYLOAD_DEMO)
  const chamadas = []
  const adapter = { enviar: (x) => { chamadas.push(x); return { respostaChegou: true, efeitoAplicado: true } } }
  const r1 = enviarComAquisicao(a, PAYLOAD_DEMO, adapter, agora, 60000, true)
  assert.equal(r1.estado, 'confirmada')
  const r2 = enviarComAquisicao(a, PAYLOAD_DEMO, adapter, agora, 60000, false)
  assert.equal(r2.estado, 'negado')
  assert.ok(r2.motivo.includes('lease'))
  assert.equal(chamadas.length, 1)
})

// T3 — CA-O4: mock aplica efeito e corta resposta → incerto; consulta encontra → confirmada; POST total 1.
test('T3: resposta perdida → resultado_incerto; consulta conclusiva → confirmada sem novo POST', () => {
  const p = prepararTransacao({ transacao_id: 'TR-4', op_id: OP_FILA_DEMO.op_id, revisao_consolidacao: 1, operacao: 'concluir_op', codigo_integracao: OP_FILA_DEMO.codigo_integracao, quantidade: 100 })
  const a = autorizarPayload(p.transacao, { payload_hash: JSON.stringify(PAYLOAD_DEMO), aprovador: 'pcp' }, PAYLOAD_DEMO)
  let posts = 0
  const r = enviarComAquisicao(a, PAYLOAD_DEMO, { enviar: () => { posts++; return { respostaChegou: false, efeitoAplicado: true } } }, agora, 60000, true)
  assert.equal(r.estado, 'resultado_incerto')
  assert.equal(posts, 1)
  const rec = reconciliarPorConsulta(r.transacao, { encontrou: true, quantidade: 100 })
  assert.equal(rec.estado, 'confirmada')
  assert.equal(rec.novoPostAutorizado, false)
  assert.equal(r.transacao.posts_mutantes, 1)
})

// T4 — CA-O4: consulta inconclusiva → mantém incerto, sem retry; lease vencido não libera POST.
test('T4: consulta inconclusiva → incerto preservado, novoPostAutorizado=false', () => {
  const p = prepararTransacao({ transacao_id: 'TR-5', op_id: OP_FILA_DEMO.op_id, revisao_consolidacao: 1, operacao: 'concluir_op', codigo_integracao: OP_FILA_DEMO.codigo_integracao, quantidade: 100 })
  const a = autorizarPayload(p.transacao, { payload_hash: JSON.stringify(PAYLOAD_DEMO), aprovador: 'pcp' }, PAYLOAD_DEMO)
  const r = enviarComAquisicao(a, PAYLOAD_DEMO, { enviar: () => ({ respostaChegou: false, efeitoAplicado: true }) }, agora, 60000, true)
  assert.equal(r.estado, 'resultado_incerto')
  const rec = reconciliarPorConsulta(r.transacao, { encontrou: false, quantidade: null })
  assert.equal(rec.estado, 'resultado_incerto')
  assert.equal(rec.novoPostAutorizado, false)
  assert.ok(rec.transacao.pendencias.some((x) => x.includes('inconclusiva')))
  // lease vencido também não libera: reconciliarPorConsulta nunca autoriza POST
  const rec2 = reconciliarPorConsulta({ ...r.transacao, lease_ate: new Date(agora.getTime() - 1000).toISOString() }, { encontrou: false, quantidade: null })
  assert.equal(rec2.novoPostAutorizado, false)
})

// T6 — CA-O1/O2: quantidade final 0 → bloqueada com pendência, zero POST.
test('T6: quantidade final 0 → bloqueada com pendência explícita e zero POST', () => {
  const p = prepararTransacao({ transacao_id: 'TR-6', op_id: OP_FILA_DEMO.op_id, revisao_consolidacao: 1, operacao: 'concluir_op', codigo_integracao: OP_FILA_DEMO.codigo_integracao, quantidade: 0 })
  assert.equal(p.estado, 'bloqueada')
  assert.ok(p.transacao.pendencias.some((x) => x.includes('0')))
  const chamadas = []
  const r = enviarComAquisicao(p.transacao, PAYLOAD_DEMO, { enviar: (x) => { chamadas.push(x); return { respostaChegou: true, efeitoAplicado: true } } }, agora, 60000, true)
  assert.equal(r.estado, 'negado')
  assert.equal(chamadas.length, 0)
})

// Isolamento: fixtures sintéticas.
test('T0: fixtures sintéticas da fila', () => {
  assert.equal(OP_FILA_DEMO.op_id, 'OP-S-2-005')
  assert.equal(PAYLOAD_DEMO.quantidade, 100)
})