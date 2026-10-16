// tests/pcp/spec-2-004-conferencia.test.mjs — SPEC-2-004 CA-C1/C2/C3 (task 556da315)
// Recorte sintético: duas etapas de conferência com escopo por ponto, replay
// único e fila revisável. Oráculos T1–T5 da SPEC (C4 fica na task 30118f65).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  registrarConferencia,
  montarFila,
  OP_CONFERENCIA_DEMO,
  SESSAO_EXPEDICAO,
  SESSAO_CAMARA,
} from '../../src/lib/pcp/conferencia.ts'

const op = OP_CONFERENCIA_DEMO
const exp = {
  conferencia_id: 'CF-1',
  op_id: op.op_id,
  versao_op: op.versao_op,
  etapa: 'recebimento_expedicao',
  ponto: 'expedicao',
  quantidade: 97,
  unidade: 'UN',
  local: 'doca',
  conferente: 'angela.silva',
}
const cam = {
  conferencia_id: 'CF-2',
  op_id: op.op_id,
  versao_op: op.versao_op,
  etapa: 'entrada_camara',
  ponto: 'camara_fria',
  quantidade: 96,
  unidade: 'UN',
  local: 'camara-1',
  conferente: 'angela.silva',
}

// T1 — CA-C1/C3: quatro quantidades independentes; deltas preservados; fila bloqueada.
test('T1: cozinha 100, encaixotado 98, expedição 97, câmara 96 → deltas −1/−1, fila bloqueada', () => {
  const fila = montarFila(op, 100, 98, [
    { ...exp, criado_em: 't' },
    { ...cam, criado_em: 't' },
  ])
  assert.equal(fila.quantidades.produzido, 100)
  assert.equal(fila.quantidades.encaixotado, 98)
  assert.equal(fila.quantidades.recebido_expedicao, 97)
  assert.equal(fila.quantidades.entrada_camara, 96)
  assert.equal(fila.deltas.encaixotado, -2)
  assert.equal(fila.deltas.recebido, -1)
  assert.equal(fila.deltas.camara, -1)
  assert.equal(fila.estado, 'bloqueada')
  assert.ok(fila.pendencias.some((p) => p.includes('Divergência')))
})

// T2 — CA-C2: câmara primeiro é bloqueada; ponto errado nega; replay único.
test('T2a: câmara sem expedição eficaz é bloqueada', () => {
  const r = registrarConferencia(cam, [], SESSAO_CAMARA)
  assert.equal(r.estado, 'negado')
  assert.ok(r.motivo.includes('câmara') || r.motivo.includes('camara'))
})

test('T2b: cozinha (sem acesso a expedição) tenta conferir expedição = negado', () => {
  const r = registrarConferencia(exp, [], SESSAO_CAMARA)
  assert.equal(r.estado, 'negado')
  assert.ok(r.motivo.includes('ponto'))
})

test('T2c: replay do mesmo UUID+hash não duplica; hash diferente = 409', () => {
  const r1 = registrarConferencia(exp, [], SESSAO_EXPEDICAO)
  assert.equal(r1.estado, 'registrado')
  const lista = [r1.registro]
  const r2 = registrarConferencia(exp, lista, SESSAO_EXPEDICAO)
  assert.equal(r2.estado, 'replay')
  const r3 = registrarConferencia({ ...exp, quantidade: 98 }, lista, SESSAO_EXPEDICAO)
  assert.equal(r3.estado, 'conflito_hash')
  assert.equal(lista.length, 1)
})

// T3 — CA-C3: igualdade exata libera fila revisável (sem transação/envio).
test('T3: tudo 100 → fila revisável e coincidente', () => {
  const tudo100 = [
    { ...exp, quantidade: 100, criado_em: 't' },
    { ...cam, quantidade: 100, criado_em: 't' },
  ]
  const fila = montarFila(op, 100, 100, tudo100)
  assert.equal(fila.estado, 'revisavel')
  assert.equal(fila.coincidente, true)
  assert.equal(fila.pendencias.length, 0)
})

// T5 — CA-C1/C3: zeros explícitos com motivo; ausência não vira 0; recebimento 1 é divergência.
test('T5a: conferência 0 sem motivo = negado; com motivo registra e preserva zeros', () => {
  const r = registrarConferencia({ ...exp, quantidade: 0 }, [], SESSAO_EXPEDICAO)
  assert.equal(r.estado, 'negado')
  const r2 = registrarConferencia({ ...exp, quantidade: 0, motivo: 'nada recebido — OP não chegou à doca' }, [], SESSAO_EXPEDICAO)
  assert.equal(r2.estado, 'registrado')
  const fila = montarFila(op, 0, 0, [r2.registro])
  assert.equal(fila.quantidades.recebido_expedicao, 0)
  assert.equal(fila.quantidades.entrada_camara, null) // ausência não vira 0
  assert.equal(fila.estado, 'bloqueada')
})

test('T5b: recebimento 1 vs produzido 0 é divergência com registros originais', () => {
  const fila = montarFila(op, 0, 0, [
    { ...exp, quantidade: 1, criado_em: 't' },
    { ...cam, quantidade: 1, criado_em: 't' },
  ])
  assert.equal(fila.estado, 'bloqueada')
  assert.ok(fila.pendencias.some((p) => p.includes('Divergência')))
})

// Isolamento.
test('T0: fixtures sintéticas e sessões por ponto', () => {
  assert.equal(OP_CONFERENCIA_DEMO.op_id, 'OP-S-2-001')
  assert.deepEqual(SESSAO_EXPEDICAO.pontos, ['expedicao'])
  assert.deepEqual(SESSAO_CAMARA.pontos, ['camara_fria'])
})