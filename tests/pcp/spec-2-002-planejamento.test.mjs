// tests/pcp/spec-2-002-planejamento.test.mjs — SPEC-2-002 CA-P1/P2/P3 (task 3cd404e5)
// Recorte sintético: calendário + capacidade + OP local com fixtures isoladas.
// Oráculos da SPEC: T1 (300 em 3×100; 400 excede; nada nos dias exclusivos),
// T2 (frações de recurso compartilhado: 1 aceita, 1,02 recusa), T3 (capacidade null
// bloqueia; sem ação publica nega; concorrência: uma versão), T4 fica na task 87e4af63.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  criarCalendario,
  avaliarLinha,
  validarRascunho,
  publicarProgramacao,
  CALENDARIO_DEMO,
  RECURSOS_DEMO,
  PARAMETROS_DEMO,
} from '../../src/lib/pcp/planejamento.ts'

// T1 — CA-P1: capacidade por produto/dia; dias exclusivos não recebem cookies.
test('T1a: COOKIE-1 capacidade 100 UN/dia — 100/dia em 3 dias cobre 300 (3×100)', () => {
  const r = avaliarLinha({ produto: 'COOKIE-1', quantidade: 100, data: '2026-10-13', recurso: 'cookies' })
  assert.equal(r.estado, 'ok')
  assert.equal(r.carga_produto, 1)
})

test('T1b: 400 excede a capacidade de 3 dias disponíveis', () => {
  const r = avaliarLinha({ produto: 'COOKIE-1', quantidade: 400, data: '2026-10-13', recurso: 'cookies' })
  assert.equal(r.estado, 'excede_capacidade')
  assert.ok(r.motivo.includes('capacidade'))
})

test('T1c: nada nos dias exclusivos — data de outro recurso recusa linha de cookies', () => {
  const r = avaliarLinha({ produto: 'COOKIE-1', quantidade: 50, data: '2026-10-16', recurso: 'cookies' })
  assert.equal(r.estado, 'data_indisponivel')
  assert.ok(r.motivo.includes('calendário') || r.motivo.includes('calendario'))
})

// T2 — CA-P1: recurso compartilhado respeita frações (sem somar UN+KG).
test('T2a: fração 1,0 aceita (A 50/100 + B 25/50 no mesmo recurso)', () => {
  const r = avaliarLinha({ produto: 'B', quantidade: 25, data: '2026-10-13', recurso: 'compartilhado' }, { fracoesUsadas: { 'compartilhado|2026-10-13': 0.5 } })
  assert.equal(r.estado, 'ok')
  assert.equal(r.carga_recurso, 1)
})

test('T2b: fração 1,02 recusada (B 26/50 excede o recurso)', () => {
  const r = avaliarLinha({ produto: 'B', quantidade: 26, data: '2026-10-13', recurso: 'compartilhado' }, { fracoesUsadas: { 'compartilhado|2026-10-13': 0.5 } })
  assert.equal(r.estado, 'excede_capacidade')
  assert.ok(r.carga_recurso > 1)
})

// T3 — CA-P2/P3: dado faltante bloqueia publicação; sem ação nega; concorrência gera uma versão.
test('T3a: parâmetro com capacidade null bloqueia publicação (rascunho permanece)', () => {
  const rascunho = {
    linhas: [{ produto: 'COOKIE-1', quantidade: 100, data: '2026-10-13', recurso: 'cookies' }],
    parametros: { ...PARAMETROS_DEMO, capacidade_padrao: null },
  }
  const r = validarRascunho(rascunho, CALENDARIO_DEMO, RECURSOS_DEMO)
  assert.equal(r.pode_publicar, false)
  assert.ok(r.bloqueios.some((b) => b.includes('capacidade')))
})

test('T3b: publicar sem a ação publica_programacao é negado (403 sem pistas)', () => {
  const r = publicarProgramacao(
    { linhas: [], parametros: PARAMETROS_DEMO },
    { acoes: ['consultar_planejamento'], versao_esperada: 1 },
    CALENDARIO_DEMO,
    RECURSOS_DEMO,
    { versao_atual: 1 },
  )
  assert.equal(r.estado, 'negado')
  assert.ok(r.motivo.includes('autoriza'))
})

test('T3c: dois comandos com versão 1 concorrentes — um publica v2, outro conflito 409', () => {
  const cmd = { linhas: [{ produto: 'COOKIE-1', quantidade: 100, data: '2026-10-13', recurso: 'cookies' }], parametros: PARAMETROS_DEMO }
  const primeiro = publicarProgramacao(cmd, { acoes: ['publicar_programacao'], versao_esperada: 1 }, CALENDARIO_DEMO, RECURSOS_DEMO, { versao_atual: 1 })
  assert.equal(primeiro.estado, 'publicado')
  assert.equal(primeiro.op.versao, 2)
  const segundo = publicarProgramacao(cmd, { acoes: ['publicar_programacao'], versao_esperada: 1 }, CALENDARIO_DEMO, RECURSOS_DEMO, { versao_atual: 2 })
  assert.equal(segundo.estado, 'conflito_versao')
})

// CA-P3: OPs geradas ficam vinculadas à mesma versão/contexto.
test('T3d: publicação atômica gera OPs fatiadas por capacidade diária, mesma versão/contexto', () => {
  const cmd = {
    linhas: [
      { produto: 'COOKIE-1', quantidade: 100, data: '2026-10-13', recurso: 'cookies' },
      { produto: 'COOKIE-1', quantidade: 100, data: '2026-10-14', recurso: 'cookies' },
      { produto: 'COOKIE-1', quantidade: 100, data: '2026-10-15', recurso: 'cookies' },
    ],
    parametros: PARAMETROS_DEMO,
  }
  const r = publicarProgramacao(cmd, { acoes: ['publicar_programacao'], versao_esperada: 1 }, CALENDARIO_DEMO, RECURSOS_DEMO, { versao_atual: 1 })
  assert.equal(r.estado, 'publicado')
  assert.equal(r.op.versao, 2)
  assert.equal(r.op.contexto, 'sintetico')
  assert.equal(r.op.ops.length, 3) // 300 UN = 3 OPs de 100 (capacidade diária, 3 dias)
  assert.ok(r.op.ops.every((op) => op.versao === 2 && op.produto === 'COOKIE-1' && op.quantidade === 100))
})

// Isolamento: fixtures sintéticas com banner permanente.
test('T0: calendário de demonstração — 3 dias cookies + 2 exclusivos, banner presente', () => {
  const cal = criarCalendario()
  assert.equal(cal.dias.length, 5)
  const cookies = cal.dias.filter((d) => d.recursos.includes('cookies'))
  assert.equal(cookies.length, 3)
  const exclusivos = cal.dias.filter((d) => d.recursos.includes('exclusivo-a') || d.recursos.includes('exclusivo-b'))
  assert.equal(exclusivos.length, 2)
  assert.equal(cal.banner, 'demonstracao')
})