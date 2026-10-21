// tests/pcp/spec-2-001-pedidos-firmes.test.mjs — 9318a299 (CA-D3), oráculos T5 da SPEC
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { saldoFirme } from '../../src/lib/pcp/pedidos-firmes.ts'

const MAPA = {
  versao: 'sintetico-v1',
  status_elegiveis: ['autorizado', 'faturado', 'parcial'],
  campo_data: 'data_operacional',
  horizonte_de: '2026-07-24',
  horizonte_ate: '2026-10-21',
}
const L = (o) => ({
  pedido_id: 'P1', linha_id: 'L1', produto_id: 'PRD-1', unidade: 'UN',
  quantidade_pedida: 20, quantidade_atendida: 5, status: 'faturado',
  data_operacional: '2026-10-01', ...o,
})

test('T5-1: confirmada 20, atendida 5, dentro do horizonte → 15', () => {
  const r = saldoFirme([L({})], MAPA)
  assert.equal(r.total_firme, 15)
  assert.equal(r.linhas[0].estado, 'elegivel')
})

test('T5-2: cancelada 7 e fora do horizonte 3 → 0 (excluídas)', () => {
  const r = saldoFirme([L({ linha_id: 'A', status: 'cancelado' }), L({ linha_id: 'B', data_operacional: '2026-05-01' })], MAPA)
  assert.equal(r.total_firme, 0)
  assert.ok(r.linhas.every((l) => l.estado === 'excluida' && l.firme === 0))
})

test('T5-3: replay da mesma linha (pedido+linha) mantém 15', () => {
  const r = saldoFirme([L({}), L({})], MAPA)
  assert.equal(r.total_firme, 15)
})

test('T5-4: status desconhecido → null e bloqueia (nunca 0)', () => {
  const r = saldoFirme([L({ status: 'nao_sei' })], MAPA)
  assert.equal(r.total_firme, null)
  assert.equal(r.linhas[0].estado, 'bloqueada')
  assert.equal(r.linhas[0].firme, null)
})

test('T5-5: data ausente bloqueia; borda do horizonte é inclusiva', () => {
  const semData = saldoFirme([L({ data_operacional: null })], MAPA)
  assert.equal(semData.total_firme, null)
  const borda = saldoFirme([L({ data_operacional: '2026-07-24' }), L({ linha_id: 'B', data_operacional: '2026-10-21' })], MAPA)
  assert.equal(borda.total_firme, 30)
})

test('T5-6: saldo nunca negativo; atendida > pedida bloqueia', () => {
  const ok = saldoFirme([L({ quantidade_pedida: 5, quantidade_atendida: 5 })], MAPA)
  assert.equal(ok.total_firme, 0)
  const ruim = saldoFirme([L({ quantidade_pedida: 5, quantidade_atendida: 8 })], MAPA)
  assert.equal(ruim.total_firme, null)
  assert.equal(ruim.linhas[0].motivo, 'saldo inconsistente')
})
