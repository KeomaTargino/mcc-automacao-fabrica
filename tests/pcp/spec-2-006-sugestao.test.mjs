// tests/pcp/spec-2-006-sugestao.test.mjs — SPEC-2-006 CA-S1/S2 (task 0baec76e)
// Recorte sintético: cálculo determinístico com memória reproduzível e bloqueio
// por faltante. Oráculos T1–T4/T6 da SPEC (T5 fluxo integrado e T7 permissão
// ficam nas tasks 0d876150 e 8bb4ef77).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  calcularSugestaoProducao,
  calcularSugestaoCompra,
  FIXTURE_T1,
  FIXTURE_T2,
  FIXTURE_T4,
  FIXTURE_COMPRA,
  FIXTURE_COMPRA_LOTE_MINIMO,
} from '../../src/lib/pcp/sugestao.ts'

// T1 — CA-S1/S2: projeção 70, alvo 70 (máximo, não soma), necessidade 50, sugestão 50.
test('T1: vendas 900/90d, horizonte 7, margem 0, mínimo 10, saldo 20, futura 10, firmes 50, múltiplo 10 → 50', () => {
  const s = calcularSugestaoProducao('S-T1', 'COOKIE-1', FIXTURE_T1)
  assert.equal(s.estado, 'calculada')
  assert.equal(s.quantidade, 50)
  assert.equal(s.memoria.resultado_bruto, 50)
  const passos = Object.fromEntries(s.memoria.passos.map((p) => [p.nome, p.valor]))
  assert.equal(passos.media_diaria, 10)
  assert.equal(passos.projecao, 70)
  assert.equal(passos.demanda_alvo, 70)
  assert.equal(passos.necessidade, 50)
  assert.equal(passos.resultado_arredondado, 50)
  assert.equal(s.memoria.formula_id, 'baseline90-v1')
})

// T2 — CA-S2: firmes 80 → alvo 80 (máximo vence projeção 70; NÃO soma 150), necessidade 60.
test('T2: mesma fixture com firmes 80 → alvo 80, necessidade 60 (não soma 70+80)', () => {
  const s = calcularSugestaoProducao('S-T2', 'COOKIE-1', FIXTURE_T2)
  assert.equal(s.quantidade, 60)
  const passos = Object.fromEntries(s.memoria.passos.map((p) => [p.nome, p.valor]))
  assert.equal(passos.demanda_alvo, 80)
  assert.equal(passos.necessidade, 60)
})

// T6 — CA-S1/S2: mapa de firmeza ausente → null/bloqueada; com mapa → firme uma vez.
test('T6a: mapa de pedidos firmes ausente → quantidade null e bloqueada', () => {
  const s = calcularSugestaoProducao('S-T6', 'COOKIE-1', { ...FIXTURE_T1, pedidos_firmes_no_horizonte: null })
  assert.equal(s.estado, 'bloqueada')
  assert.equal(s.quantidade, null)
  assert.ok(s.memoria.pendencias.some((p) => p.includes('firmes')))
})

test('T6b: firmeza usa o mapa aprovado uma vez (50 firmes → alvo 70? não: max(70,50)=70)', () => {
  // Projeção 70 > firmes 50 → alvo 70 (o firme não soma nem substitui quando menor)
  const s = calcularSugestaoProducao('S-T6b', 'COOKIE-1', FIXTURE_T1)
  const passos = Object.fromEntries(s.memoria.passos.map((p) => [p.nome, p.valor]))
  assert.equal(passos.demanda_alvo, 70)
})

// T3 — CA-S1: entrada não finita → null + faltantes; outros itens válidos preservados.
test('T3: entrada não finita → bloqueada com pendência; item válido do mesmo lote preservado', () => {
  const s = calcularSugestaoProducao('S-T3', 'COOKIE-1', { ...FIXTURE_T1, vendas_liquidas90: NaN })
  assert.equal(s.estado, 'bloqueada')
  assert.equal(s.quantidade, null)
  const ok = calcularSugestaoProducao('S-T3-ok', 'COOKIE-2', FIXTURE_T1)
  assert.equal(ok.estado, 'calculada')
  assert.equal(ok.quantidade, 50)
})

// T4 — CA-S2: necessidade 51, múltiplo 10 → 60; capacidade 50 → excedente 10.
test('T4: saldo 19 → necessidade 51 → arredondado 60; capacidade 50 → excedente 10', () => {
  const s = calcularSugestaoProducao('S-T4', 'COOKIE-1', FIXTURE_T4)
  assert.equal(s.memoria.resultado_bruto, 51)
  assert.equal(s.memoria.resultado_arredondado, 60)
  assert.equal(s.memoria.excedente, 10)
})

// Necessidade 0 → sugestão 0 (sem aplicar lote mínimo positivo).
test('Necessidade 0 → sugestão 0, sem lote mínimo', () => {
  const s = calcularSugestaoProducao('S-ZERO', 'COOKIE-1', {
    ...FIXTURE_T1,
    estoque_minimo: 0,
    saldo_oficial_utilizavel: 100,
    producao_programada_nao_realizada: 0,
    pedidos_firmes_no_horizonte: 0,
  })
  assert.equal(s.quantidade, 0)
  assert.equal(s.estado, 'calculada')
})

// Compra — fixture positiva: falta 4,8 → 6 KG.
test('Compra: consumo 5, mínimo 2, saldo 1, confirmadas 1,2 → falta 4,8 → sugestão 6 KG', () => {
  const s = calcularSugestaoCompra('C-T1', 'FARINHA', FIXTURE_COMPRA)
  assert.equal(s.estado, 'calculada')
  assert.equal(s.memoria.resultado_bruto, 4.8)
  assert.equal(s.quantidade, 6)
  assert.equal(s.unidade, 'KG')
})

// Compra — lote mínimo: falta 1, mínimo 5, múltiplo 2 → 6 KG.
test('Compra: falta 1 com lote mínimo 5 e múltiplo 2 → 6 KG', () => {
  const s = calcularSugestaoCompra('C-T2', 'FARINHA', FIXTURE_COMPRA_LOTE_MINIMO)
  assert.equal(s.quantidade, 6)
})

// Compra — falta 0 → 0 (sem lote mínimo).
test('Compra: falta 0 → sugestão 0', () => {
  const s = calcularSugestaoCompra('C-ZERO', 'FARINHA', { ...FIXTURE_COMPRA, consumo_insumo: 0, minimo_insumo: 0 })
  assert.equal(s.quantidade, 0)
})

// Compra — recebimento desconhecido → bloqueada (não vira 0).
test('Compra: compras a receber desconhecidas → bloqueada, quantidade null', () => {
  const s = calcularSugestaoCompra('C-NULL', 'FARINHA', { ...FIXTURE_COMPRA, compras_confirmadas_a_receber: null })
  assert.equal(s.estado, 'bloqueada')
  assert.equal(s.quantidade, null)
  assert.ok(s.memoria.pendencias.some((p) => p.includes('receber')))
})

// Memória reproduzível: mesmas entradas → mesma memória (determinismo).
test('Memória de cálculo é determinística (replay reproduz passos)', () => {
  const a = calcularSugestaoProducao('S-R1', 'COOKIE-1', FIXTURE_T1)
  const b = calcularSugestaoProducao('S-R2', 'COOKIE-1', FIXTURE_T1)
  assert.deepEqual(a.memoria.passos, b.memoria.passos)
  assert.deepEqual(a.memoria.entradas, b.memoria.entradas)
})