// tests/pcp/spec-2-003-apontamento.test.mjs — SPEC-2-003 CA-E1/E2/E3/E4 (task be180fc1)
// Recorte sintético: eventos imutáveis com idempotência, consumo vs ficha,
// perda declarada separada, retificação auditável. Oráculos T1–T5 da SPEC.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  registrarEvento,
  retificarEvento,
  consumoLiquido,
  hashEvento,
  OP_DEMO,
  FICHA_DEMO,
  SESSAO_DEMO,
} from '../../src/lib/pcp/apontamento.ts'

const base = {
  evento_id: 'EV-1',
  op_id: OP_DEMO.op_id,
  ponto: 'cozinha',
  tipo: 'retirada',
  item: 'INS-1',
  quantidade: 6,
  unidade: 'KG',
  autor: 'arivaldo.missias',
}

// T1 — CA-E1/E3: líquido 6, previsto 5, diferença 1; perda 0,5 separada.
test('T1: consumo líquido 6 KG vs previsto 5 KG (diferença 1); perda 0,5 separada', () => {
  const ev = [
    { ...base, criado_em: 't', tipo: 'retirada', quantidade: 6 },
    { ...base, evento_id: 'EV-2', criado_em: 't', tipo: 'adicional', quantidade: 1 },
    { ...base, evento_id: 'EV-3', criado_em: 't', tipo: 'devolucao', quantidade: 1 },
    { ...base, evento_id: 'EV-4', criado_em: 't', tipo: 'perda', quantidade: 0.5 },
  ]
  const c = consumoLiquido(ev, FICHA_DEMO, 100, 'UN')
  const ins = c.find((x) => x.item === 'INS-1')
  assert.equal(ins.liquido, 6)
  assert.equal(ins.previsto, 5)
  assert.equal(ins.diferenca, 1)
  assert.equal(ins.perda_declarada, 0.5)
  assert.equal(ins.calculo_disponivel, true)
})

// T2 — CA-E2: replay não duplica; hash alterado = 409.
test('T2: duas submissões iguais = um evento (replay); terceira com mesma UUID e qtd alterada = 409', () => {
  const r1 = registrarEvento(base, 'publicada', [], SESSAO_DEMO)
  assert.equal(r1.estado, 'registrado')
  const lista = [r1.evento]
  const r2 = registrarEvento(base, 'publicada', lista, SESSAO_DEMO)
  assert.equal(r2.estado, 'replay')
  assert.equal(r2.evento.evento_id, 'EV-1')
  const r3 = registrarEvento({ ...base, quantidade: 7 }, 'publicada', lista, SESSAO_DEMO)
  assert.equal(r3.estado, 'conflito_hash')
  assert.equal(lista.length, 1) // nenhum evento novo
})

// T3 — CA-E1/E4: ponto errado, OP cancelada, unidade null, retificação preserva original.
test('T3a: cozinha tenta apontar câmara = negado (403 sem pistas)', () => {
  const r = registrarEvento({ ...base, ponto: 'camara_fria' }, 'publicada', [], SESSAO_DEMO)
  assert.equal(r.estado, 'negado')
  assert.ok(r.motivo.includes('ponto'))
})

test('T3b: OP cancelada não recebe evento', () => {
  const r = registrarEvento(base, 'cancelada', [], SESSAO_DEMO)
  assert.equal(r.estado, 'negado')
  assert.ok(r.motivo.includes('cancelada'))
})

test('T3c: unidade null bloqueia o apontamento (nada presumido)', () => {
  const r = registrarEvento({ ...base, unidade: null }, 'publicada', [], SESSAO_DEMO)
  assert.equal(r.estado, 'negado')
  assert.ok(r.motivo.includes('Unidade'))
})

test('T3d: retificar 6→5,8 preserva o original e o líquido passa a 5,8', () => {
  const r1 = registrarEvento(base, 'publicada', [], SESSAO_DEMO)
  const lista = [r1.evento]
  const r2 = retificarEvento(r1.evento, 5.8, 'balança corrigida', 'EV-RET-1', 'publicada', lista, SESSAO_DEMO)
  assert.equal(r2.estado, 'registrado')
  const c = consumoLiquido([...lista, r2.evento], FICHA_DEMO, 100, 'UN')
  const ins = c.find((x) => x.item === 'INS-1')
  assert.equal(ins.liquido, 5.8)
  assert.ok(lista.some((e) => e.evento_id === 'EV-1')) // original preservado
})

// T4 — CA-E2: timeout após persistência → consultar UUID = registro encontrado, nenhum novo evento.
test('T4: replay após timeout devolve o registro e não cria novo evento', () => {
  const r1 = registrarEvento(base, 'publicada', [], SESSAO_DEMO)
  const lista = [r1.evento]
  const r2 = registrarEvento(base, 'publicada', lista, SESSAO_DEMO)
  assert.equal(r2.estado, 'replay')
  assert.equal(lista.length, 1)
})

// T5 — CA-E1/E3/E4: realizado 0 com motivo ok; sem motivo negado; insumo 0 negado.
test('T5a: realizado 0 COM motivo registra; replay mantém um', () => {
  const ev = { ...base, evento_id: 'EV-R0', tipo: 'realizado', quantidade: 0, motivo: 'linha parada por manutenção', item: 'COOKIE-1', unidade: 'UN' }
  const r = registrarEvento(ev, 'publicada', [], SESSAO_DEMO)
  assert.equal(r.estado, 'registrado')
  const r2 = registrarEvento(ev, 'publicada', [r.evento], SESSAO_DEMO)
  assert.equal(r2.estado, 'replay')
})

test('T5b: realizado 0 SEM motivo = negado; insumo 0 = negado', () => {
  const r = registrarEvento({ ...base, evento_id: 'EV-R1', tipo: 'realizado', quantidade: 0, item: 'COOKIE-1', unidade: 'UN' }, 'publicada', [], SESSAO_DEMO)
  assert.equal(r.estado, 'negado')
  const r2 = registrarEvento({ ...base, evento_id: 'EV-I0', quantidade: 0 }, 'publicada', [], SESSAO_DEMO)
  assert.equal(r2.estado, 'negado')
})

// Isolamento e hash determinístico.
test('T0: hash determinístico e fixtures sintéticas', () => {
  assert.equal(hashEvento(base), hashEvento({ ...base }))
  assert.notEqual(hashEvento(base), hashEvento({ ...base, quantidade: 7 }))
  assert.equal(OP_DEMO.op_id, 'OP-S-2-001')
})