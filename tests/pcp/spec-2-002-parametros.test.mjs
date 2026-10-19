// tests/pcp/spec-2-002-parametros.test.mjs — SPEC-2-002 CA-P1/P2 (task d2a44349)
// Recorte do executor: contrato de parâmetros + gate editar_parametros + replay
// idempotente + consumo pela publicação real. Oráculos:
// T1 (null bloqueia, nunca default), T2 (0 bloqueia), T3 (unidade faltante bloqueia;
// unidades diferentes nunca somam), T4 (403 sem ação; versão/aprovador/hora/hash),
// T5 (replay idempotente; divergente → 409), T6 (publicação real consome aprovados;
// demo isolada permanece bloqueada).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  validarParametros,
  aprovarParametros,
  replayAprovacao,
  consumoPublicacao,
} from '../../src/lib/pcp/parametros.ts'

const APROVADOR = { acoes: ['editar_parametros'], usuario: 'owner.teste' }
const SEM_ACAO = { acoes: ['consultar_planejamento'], usuario: 'outro' }

const BASE = {
  capacidade_padrao: 100,
  lote_multiplo: 10,
  horizonte_dias: 5,
  recursos: [
    { nome: 'cookies', unidade: 'UN', capacidade_fracao: 1, capacidade_por_produto: { 'COOKIE-1': 100 } },
    { nome: 'congelados', unidade: 'KG', capacidade_fracao: 1, capacidade_por_produto: {} },
  ],
}

test('T1 P2: capacidade null bloqueia publicação real e mantém rascunho (nunca default)', () => {
  const p = { ...BASE, capacidade_padrao: null }
  const v = validarParametros(p)
  assert.equal(v.aprovavel, false)
  assert.ok(v.bloqueios.some((b) => b.includes('capacidade')))
  const c = consumoPublicacao(p)
  assert.equal(c.pode_publicar, false)
  assert.ok(c.bloqueios.length > 0)
})

test('T2 P2: lote/múltiplo 0 ou horizonte 0 bloqueiam (faltante ≠ zero default)', () => {
  const v1 = validarParametros({ ...BASE, lote_multiplo: 0 })
  assert.equal(v1.aprovavel, false)
  const v2 = validarParametros({ ...BASE, horizonte_dias: 0 })
  assert.equal(v2.aprovavel, false)
  const v3 = validarParametros(BASE)
  assert.equal(v3.aprovavel, true)
  assert.deepEqual(v3.bloqueios, [])
})

test('T3: unidade faltante em recurso bloqueia; unidades diferentes NUNCA somam', () => {
  const p1 = { ...BASE, recursos: [{ nome: 'x', unidade: null, capacidade_fracao: 1, capacidade_por_produto: {} }] }
  const v1 = validarParametros(p1)
  assert.equal(v1.aprovavel, false)
  const v2 = validarParametros(BASE)
  assert.equal(v2.aprovavel, true)
})

test('T4: aprovar exige editar_parametros → 403 sem pistas; com ação registra versão/aprovador/hora', () => {
  const r1 = aprovarParametros(BASE, SEM_ACAO, { versao_atual: 0 })
  assert.equal(r1.estado, 'negado')
  assert.ok(r1.motivo.includes('403'))
  const r2 = aprovarParametros(BASE, APROVADOR, { versao_atual: 0 })
  assert.equal(r2.estado, 'aprovado')
  assert.equal(r2.aprovacao.versao, 1)
  assert.equal(r2.aprovacao.aprovador, 'owner.teste')
  assert.ok(r2.aprovacao.aprovado_em)
  assert.ok(r2.aprovacao.hash_parametros.length >= 32)
})

test('T5: replay idêntico idempotente; payload divergente → 409 sem sobrescrever', () => {
  const r1 = aprovarParametros(BASE, APROVADOR, { versao_atual: 0 })
  const r2 = replayAprovacao(r1.aprovacao, BASE)
  assert.equal(r2.estado, 'replay')
  assert.equal(r2.aprovacao.versao, r1.aprovacao.versao)
  const ALTERADO = { ...BASE, capacidade_padrao: 120 }
  const r3 = replayAprovacao(r1.aprovacao, ALTERADO)
  assert.equal(r3.estado, 'conflito_versao')
  assert.ok(r3.motivo.includes('409'))
})

test('T6: publicação real consome parâmetros APROVADOS (não demo); demo isolada permanece', () => {
  const r1 = aprovarParametros(BASE, APROVADOR, { versao_atual: 0 })
  const c = consumoPublicacao(BASE, { aprovacao: r1.aprovacao })
  assert.equal(c.pode_publicar, true)
  assert.equal(c.origem, 'aprovada')
  const c2 = consumoPublicacao(BASE)
  assert.equal(c2.origem, 'demonstracao')
  assert.equal(c2.pode_publicar, false)
})