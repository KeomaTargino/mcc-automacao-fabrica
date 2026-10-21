// tests/pcp/spec-2-003-retificacao.test.mjs — SPEC-2-003 CA-E2/E4 (task 0096ab26)
// Oráculos: T2 replay/409; T3 retificar 6→5,8 com original preservado; T4 timeout→consulta
// por UUID sem novo evento; T5 realizado 0 com motivo / negativas; E4 OP/versão incompatível;
// E2 409 estado_congelado durante envio/incerto; E1 ponto sem acesso e OP cancelada.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buscarEventoPorUUID,
  retificarComGuardas,
} from '../../src/lib/pcp/retificacao.ts'

const original = {
  evento_id: 'EV-001',
  op_id: 'OP-1',
  op_versao: 1,
  ponto: 'cozinha',
  tipo: 'retirada',
  item: 'INS-1',
  quantidade: 6,
  unidade: 'KG',
  autor: 'r@x',
}
const ALVO = { op_id: 'OP-1', op_versao: 1 }
const OK = {
  original,
  op_alvo: ALVO,
  novaQuantidade: 5.8,
  motivo: 'conferência da balança',
  novoId: 'EV-002',
  estadoOP: 'publicada',
  envio: 'nao_iniciado',
  existentes: [original],
  pontosSessao: ['cozinha'],
  autor: 'r@x',
}

// T2 (E2): duas submissões iguais → um evento (replay); terceira com quantidade
// alterada e MESMO UUID → conflito 409.
test('R1: replay idempotente; mesmo UUID com payload diferente → 409', () => {
  const a = retificarComGuardas(OK)
  assert.equal(a.estado, 'registrado')
  const b = retificarComGuardas({ ...OK, existentes: [original, a.evento] })
  assert.equal(b.estado, 'replay')
  assert.equal(b.evento.evento_id, 'EV-002')
  const c = retificarComGuardas({ ...OK, novaQuantidade: 5, existentes: [original, a.evento] })
  assert.equal(c.estado, 'conflito_hash')
  assert.ok(c.motivo.includes('409'))
})

// T3 (E4): retificar 6 → 5,8 com motivo; líquido eficaz 5,8; original preservado.
test('R2: retificação 6→5,8 registra evento novo; original permanece', () => {
  const r = retificarComGuardas(OK)
  assert.equal(r.estado, 'registrado')
  assert.equal(r.evento.quantidade, 5.8)
  assert.equal(r.evento.retifica, 'EV-001')
  assert.equal(r.original_preservado, true)
  // líquido eficaz: retificações SUBSTITUEM o valor do alvo (não somam por si)
  const eficazes = [original, r.evento]
  const retifs = eficazes.filter((e) => e.retifica)
  const liquido = eficazes
    .filter((e) => !e.retifica)
    .reduce((s, e) => {
      const sub = retifs.find((x) => x.retifica === e.evento_id)
      return s + (sub ? sub.quantidade : e.quantidade)
    }, 0)
  assert.equal(liquido, 5.8)
})

// T4 (E2): timeout após persistência → consultar UUID → registro encontrado;
// repetir a mesma retificação → replay (nenhum evento novo).
test('R3: timeout → consulta por UUID encontra; retry é replay', () => {
  const achado = buscarEventoPorUUID([original], 'EV-001')
  assert.equal(achado.evento_id, 'EV-001')
  assert.equal(buscarEventoPorUUID([original], 'EV-XXX'), null)
  const r = retificarComGuardas(OK)
  const retry = retificarComGuardas({ ...OK, existentes: [original, r.evento] })
  assert.equal(retry.estado, 'replay')
})

// T5 (E1/E4): anulação 0 com motivo registra; 0 sem motivo nega; durante
// envio/incerto → 409 estado_congelado.
test('R4: anulação 0 com motivo; negativas; 409 estado_congelado', () => {
  const anula = retificarComGuardas({ ...OK, novaQuantidade: 0, motivo: 'lançamento errôneo' })
  assert.equal(anula.estado, 'registrado')
  assert.equal(anula.evento.quantidade, 0)
  const semMotivo = retificarComGuardas({ ...OK, motivo: '' })
  assert.equal(semMotivo.estado, 'negado')
  const enviando = retificarComGuardas({ ...OK, envio: 'enviando' })
  assert.equal(enviando.estado, 'negado')
  assert.ok(enviando.motivo.includes('estado_congelado'))
  const incerto = retificarComGuardas({ ...OK, envio: 'incerto' })
  assert.equal(incerto.estado, 'negado')
})

// E4: OP/versão incompatível impede a retificação.
test('R5: OP ou versão incompatível nega', () => {
  const outraOP = retificarComGuardas({ ...OK, op_alvo: { op_id: 'OP-9', op_versao: 1 } })
  assert.equal(outraOP.estado, 'negado')
  const outraVersao = retificarComGuardas({ ...OK, op_alvo: { op_id: 'OP-1', op_versao: 2 } })
  assert.equal(outraVersao.estado, 'negado')
})

// E1: ponto sem acesso nega sem pistas; OP cancelada nega.
test('R6: ponto fora da sessão nega; OP cancelada nega', () => {
  const semPonto = retificarComGuardas({ ...OK, pontosSessao: ['encaixotamento'] })
  assert.equal(semPonto.estado, 'negado')
  const cancelada = retificarComGuardas({ ...OK, estadoOP: 'cancelada' })
  assert.equal(cancelada.estado, 'negado')
})