// tests/pcp/spec-2-001-catalogo-dirigido.test.mjs — 4e0fcf1c (consulta dirigida)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  aplicarResultados,
  cobertura,
  normalizarProduto,
  novoCatalogo,
  planoConsulta,
} from '../../src/lib/pcp/catalogo-dirigido.ts'

test('P1: normaliza produto encontrado — unidade preservada, IDs texto, ativo', () => {
  const r = normalizarProduto('M011001', { descricao: 'MISTURA P/COOKIE TRADICIONAL CX C/100 CONGELADO', unidade: 'CX', inativo: 'N' })
  assert.equal(r.estado, 'ok')
  assert.equal(r.linha.unidade, 'CX')
  assert.equal(r.linha.ativo, true)
  assert.equal(r.linha.origem, 'consulta_dirigida')
})

test('P2: unidade ausente → null (nunca vira UN); inativo S → ativo false', () => {
  const r = normalizarProduto('M043024', { descricao: 'CAIXA HOPE PEQUENA 25 UN', unidade: null, inativo: 'S' })
  assert.equal(r.estado, 'ok')
  assert.equal(r.linha.unidade, null)
  assert.equal(r.linha.ativo, false)
})

test('P3: não encontrado → pendência explícita, nunca inventa produto', () => {
  const r = normalizarProduto('M999999', null)
  assert.equal(r.estado, 'nao_encontrado')
  assert.ok(r.pendencia.includes('M999999'))
})

test('P4: plano de consulta divide em lotes de 30 com pausa entre eles', () => {
  const codigos = Array.from({ length: 91 }, (_, i) => 'C' + i)
  const plano = planoConsulta(codigos, 30)
  assert.equal(plano.length, 4)
  assert.equal(plano[0].codigos.length, 30)
  assert.equal(plano[3].codigos.length, 1)
  assert.equal(plano[0].pausa_ms, 0)
  assert.equal(plano[1].pausa_ms, 1000)
})

test('P5: aplicar resultados — replay idempotente; pendência não duplica e não vira produto', () => {
  const e = novoCatalogo()
  const ok1 = normalizarProduto('M011001', { descricao: 'MISTURA P/COOKIE TRADICIONAL', unidade: 'CX', inativo: 'N' })
  aplicarResultados(e, [ok1])
  aplicarResultados(e, [ok1]) // replay
  assert.equal(Object.keys(e.porCodigo).length, 1)
  const nf = normalizarProduto('M999999', null)
  aplicarResultados(e, [nf])
  aplicarResultados(e, [nf]) // pendência não duplica
  assert.equal(e.pendencias.length, 1)
  assert.ok(!e.porCodigo['M999999'])
})

test('P6: cobertura — ok/pendentes/total/pct sobre códigos únicos', () => {
  const e = novoCatalogo()
  aplicarResultados(e, [
    normalizarProduto('M011001', { descricao: 'A', unidade: 'CX', inativo: 'N' }),
    normalizarProduto('M043024', { descricao: 'B', unidade: 'PA', inativo: 'N' }),
    normalizarProduto('M999999', null),
  ])
  const c = cobertura(e, ['M011001', 'M043024', 'M043024', 'M999999'])
  assert.equal(c.total, 3)
  assert.equal(c.ok, 2)
  assert.equal(c.pendentes, 1)
  assert.equal(c.cobertura_pct, 66.7)
})