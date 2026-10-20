// tests/pcp/spec-2-003-ponto.test.mjs — SPEC-2-003 CA-E1/E3 (task 64ac4f85)
// Recorte do executor: ligar eventos à OP publicada e acessos por ponto.
// Oráculos da SPEC: cozinha 40+60=100 (incrementos); encaixotamento 98 independente;
// ficha 100 UN→5 KG dá previsto 5 KG; anulação de 6 KG por retificação 0; encerramento
// por ponto com hash da projeção; evento após encerramento invalida; durante envio/incerto
// 409 estado_congelado; ponto sem acesso e OP cancelada negam.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  somaRealizadoPonto,
  projetarOP,
  encerrarPonto,
  podeRegistrarAposEncerramento,
  type EventoPonto,
} from '../../src/lib/pcp/ponto.ts'

const FICHA = {
  base_produto: 100,
  unidade_produto: 'UN',
  componente: { insumo: 'INS-1', quantidade: 5, unidade: 'KG' },
}

const ev = (id: string, tipo: any, quantidade: number, extra: any = {}): EventoPonto => ({
  id,
  op_id: 'OP-1',
  op_versao: 1,
  tipo,
  item: tipo.startsWith('realizado') ? null : 'INS-1',
  quantidade,
  unidade: tipo.startsWith('realizado') ? 'UN' : 'KG',
  ponto: tipo === 'realizado_cozinha' ? 'cozinha' : tipo === 'realizado_encaixotamento' ? 'encaixotamento' : 'cozinha',
  autor: 'r@x',
  criado_em: '2026-10-20T10:00:00Z',
  ...extra,
})

const BASE = () => [
  ev('e1', 'retirada', 6),
  ev('e2', 'realizado_cozinha', 40),
  ev('e3', 'realizado_cozinha', 60, { autor: 'j@x' }),
  ev('e4', 'realizado_encaixotamento', 98, { ponto: 'encaixotamento' }),
]

const SESSAO_OK = { pontos: ['cozinha', 'encaixotamento'] }

// T-A (E3): incrementos por execução do ponto SOMAM (não substituem).
test('A: cozinha 40+60=100', () => {
  assert.equal(somaRealizadoPonto(BASE(), 'cozinha'), 100)
})

// T-B (E3): encaixotamento é registro independente de resultado.
test('B: encaixotamento 98 permanece 98', () => {
  const p = projetarOP(BASE(), FICHA)
  assert.equal(p.cozinha, 100)
  assert.equal(p.encaixotamento, 98)
})

// T-C (E3): previsto usa soma eficaz do realizado_cozinha na unidade-base da ficha.
test('C: ficha 100 UN→5 KG com cozinha 100 dá previsto 5; retirada 6 dá diferença 1', () => {
  const p = projetarOP(BASE(), FICHA)
  assert.equal(p.previsto, 5)
  const ins = p.consumo.find((c) => c.item === 'INS-1')!
  assert.equal(ins.liquido, 6)
  assert.equal(ins.diferenca, 1)
  assert.equal(ins.perda_declarada, 0)
})

// T-D (E4/E3): anular lançamento errôneo 6 KG com retificação 0 (motivo) — líquido 0.
test('D: retificação 0 anula a retirada de 6 KG', () => {
  const eventos = [...BASE(), ev('e5', 'retificacao', 0, { evento_alvo: 'e1', motivo: 'lançamento errôneo' })]
  const p = projetarOP(eventos, FICHA)
  const ins = p.consumo.find((c) => c.item === 'INS-1')!
  assert.equal(ins.liquido, 0)
  assert.equal(p.previsto, 5)
})

// T-E (E1): encerramento por ponto com hash da projeção; replay idempotente.
test('E: encerra cozinha com hash; replay retorna o mesmo hash', () => {
  const a = encerrarPonto({ eventos: BASE(), ponto: 'cozinha', ficha: FICHA, sessao: SESSAO_OK, encerramentos: [], estadoOP: 'publicada', envio: null, autor: 'r@x' })
  assert.equal(a.estado, 'encerrado')
  const b = encerrarPonto({ eventos: BASE(), ponto: 'cozinha', ficha: FICHA, sessao: SESSAO_OK, encerramentos: [a.registro], estadoOP: 'publicada', envio: null, autor: 'r@x' })
  assert.equal(b.estado, 'replay')
  assert.equal(b.registro.hash, a.registro.hash)
})

// T-F (E1): encerramento exige realizado eficaz > 0 ou declaração 0 com motivo.
test('F: sem realizado nega; 0 sem motivo nega; 0 com motivo encerra', () => {
  const semNada = encerrarPonto({ eventos: [], ponto: 'cozinha', ficha: FICHA, sessao: SESSAO_OK, encerramentos: [], estadoOP: 'publicada', envio: null, autor: 'r@x' })
  assert.equal(semNada.estado, 'negado')
  const zeroSemMotivo = encerrarPonto({ eventos: [ev('z1', 'realizado_cozinha', 0)], ponto: 'cozinha', ficha: FICHA, sessao: SESSAO_OK, encerramentos: [], estadoOP: 'publicada', envio: null, autor: 'r@x' })
  assert.equal(zeroSemMotivo.estado, 'negado')
  const zeroComMotivo = encerrarPonto({ eventos: [ev('z2', 'realizado_cozinha', 0, { motivo: 'sem produto aproveitável' })], ponto: 'cozinha', ficha: FICHA, sessao: SESSAO_OK, encerramentos: [], estadoOP: 'publicada', envio: null, autor: 'r@x' })
  assert.equal(zeroComMotivo.estado, 'encerrado')
})

// T-G (E1/E2): evento após encerramento (antes da aquisição) invalida; durante envio/incerto 409.
test('G: evento pós-encerramento invalida; durante envio/incerto 409 estado_congelado', () => {
  const antes = podeRegistrarAposEncerramento({ encerrado: true, envio: null })
  assert.equal(antes.ok, true)
  assert.ok(antes.invalida.includes('encerramento'))
  assert.ok(antes.invalida.includes('conferencia'))
  assert.ok(antes.invalida.includes('aprovacao'))
  const durante = podeRegistrarAposEncerramento({ encerrado: true, envio: 'enviando' })
  assert.equal(durante.ok, false)
  assert.ok(durante.motivo.includes('estado_congelado'))
  const incerto = podeRegistrarAposEncerramento({ encerrado: true, envio: 'incerto' })
  assert.equal(incerto.ok, false)
})

// T-H (E1): ponto sem acesso nega sem pistas; OP cancelada nega.
test('H: ponto fora da sessão nega; OP cancelada nega', () => {
  const r1 = encerrarPonto({ eventos: BASE(), ponto: 'camara_fria', ficha: FICHA, sessao: SESSAO_OK, encerramentos: [], estadoOP: 'publicada', envio: null, autor: 'r@x' })
  assert.equal(r1.estado, 'negado')
  const r2 = encerrarPonto({ eventos: BASE(), ponto: 'cozinha', ficha: FICHA, sessao: SESSAO_OK, encerramentos: [], estadoOP: 'cancelada', envio: null, autor: 'r@x' })
  assert.equal(r2.estado, 'negado')
})