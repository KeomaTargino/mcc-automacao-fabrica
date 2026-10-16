// tests/pcp/spec-2-002-reprogramacao.test.mjs — SPEC-2-002 CA-P4 (task 87e4af63), recorte sintético
// Oráculo T4 da SPEC: OP100, realizado40, transferir restante60; replay; corrida; conservação.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reprogramarSaldo, demandaExecutavel, type OP } from '../../src/lib/pcp/reprogramacao.ts'

const origemT4: OP = {
  op_id: 'OP-S-2-002',
  versao: 1,
  produto: 'COOKIE-1',
  unidade: 'UN',
  quantidade_planejada: 100,
  realizado: 40,
  saldo_executavel: 60,
  recurso: 'cozinha-1',
  data: '2026-10-17',
  estado: 'em_execucao',
}
const contaPCP = { acoes: ['editar_programacao'], usuario: 'keoma.targino' }
const contaConsulta = { acoes: ['consultar'], usuario: 'arivaldo.missias' }

// T4 — transferência do restante 60 com motivo; conservação do passado.
test('T4a: OP100/realizado40 → transfere 60 uma vez; origem conserva realizado40, saldo 0, histórico 100', () => {
  const r = reprogramarSaldo(origemT4, '2026-10-20', 'reprogramação: recurso indisponível', contaPCP, null, [], 1)
  assert.equal(r.estado, 'transferido')
  assert.equal(r.origem?.saldo_executavel, 0)
  assert.equal(r.origem?.realizado, 40)
  assert.equal(r.origem?.quantidade_planejada, 100)
  assert.equal(r.destino?.quantidade_planejada, 60)
  assert.equal(r.destino?.saldo_executavel, 60)
  assert.equal(r.destino?.data, '2026-10-20')
  assert.equal(r.vinculo?.quantidade_transferida, 60)
  assert.ok(r.motivo?.includes('histórica 100'))
})

test('T4b: demanda executável conta 60 só no destino (referência histórica não soma)', () => {
  const r = reprogramarSaldo(origemT4, '2026-10-20', 'm', contaPCP, null, [], 1)
  const ops = [r.origem!, r.destino!]
  assert.equal(demandaExecutavel(ops), 60)
})

// T4 — replay idempotente.
test('T4c: replay do mesmo comando retorna a transferência existente sem duplicar', () => {
  const r1 = reprogramarSaldo(origemT4, '2026-10-20', 'reprogramação: recurso indisponível', contaPCP, null, [], 1)
  const vinculos = r1.vinculo ? [r1.vinculo] : []
  const r2 = reprogramarSaldo({ ...origemT4, saldo_executavel: 0 }, '2026-10-20', 'reprogramação: recurso indisponível', contaPCP, null, vinculos, 1)
  assert.equal(r2.estado, 'replay')
  assert.equal(vinculos.length, 1)
  assert.equal(r2.origem?.saldo_executavel, 0)
})

// T4 — dois comandos concorrentes: versão divergente → 409 sem transferência parcial.
test('T4d: corrida — segundo comando com versão esperada antiga → 409, nada transferido', () => {
  const r = reprogramarSaldo(origemT4, '2026-10-21', 'outro motivo', contaPCP, null, [], 2)
  assert.equal(r.estado, 'conflito')
  assert.ok(r.motivo?.includes('409'))
  assert.equal(r.destino, undefined)
})

// Capacidade do destino insuficiente → nada parcial.
test('Capacidade do destino 50 < saldo 60 → negado sem transferência parcial', () => {
  const r = reprogramarSaldo(origemT4, '2026-10-20', 'm', contaPCP, 50, [], 1)
  assert.equal(r.estado, 'negado')
  assert.ok(r.motivo?.includes('nenhuma transferência'))
})

// Conta sem editar_programacao → 403 e zero mutação.
test('Conta de consulta tenta reprogramar → negado (403)', () => {
  const r = reprogramarSaldo(origemT4, '2026-10-20', 'm', contaConsulta, null, [], 1)
  assert.equal(r.estado, 'negado')
  assert.ok(r.motivo?.includes('403'))
})

// Estados congelados negam; sincronizada vira ocorrência separada.
test('OP sincronizando/resultado_incerto/sincronizada → reprogramação negada', () => {
  for (const estado of ['sincronizando', 'resultado_incerto', 'sincronizada'] as const) {
    const r = reprogramarSaldo({ ...origemT4, estado }, '2026-10-20', 'm', contaPCP, null, [], 1)
    assert.equal(r.estado, 'negado')
    assert.ok(r.motivo?.includes(estado))
  }
})

// Sem motivo → negado; saldo 0 → nada a transferir.
test('Sem motivo → negado; saldo executável 0 → nada a transferir', () => {
  const r1 = reprogramarSaldo(origemT4, '2026-10-20', '  ', contaPCP, null, [], 1)
  assert.equal(r1.estado, 'negado')
  const r2 = reprogramarSaldo({ ...origemT4, saldo_executavel: 0 }, '2026-10-20', 'm', contaPCP, null, [], 1)
  assert.equal(r2.estado, 'negado')
  assert.ok(r2.motivo?.includes('nada a transferir'))
})