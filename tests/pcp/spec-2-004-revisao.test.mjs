// tests/pcp/spec-2-004-revisao.test.mjs — SPEC-2-004 CA-C3/C4 (task 30118f65), recorte sintético
// Oráculo T4 da SPEC (PCP aceita 96 com motivo) + invalidação atômica + corrida + 0=0.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aprovarConsolidacao, invalidarPorNovaProjecao, retificarAntesDaAquisicao } from '../../src/lib/pcp/revisao-consolidacao.ts'

const contaPCP = { acoes: ['aprovar_consolidacao'], usuario: 'keoma.targino' }
const contaConsulta = { acoes: ['consultar'], usuario: 'arivaldo.missias' }
const base = { aprovacao_id: 'AP-1', op_id: 'OP-S-2-001', versao_op: 2, hash_eventos: 'h-ev', hash_conferencias: 'h-cf' }

// T4 — CA-C4: PCP aceita 96 com motivo após revisar 100/98/97/96; originais visíveis.
test('T4: PCP aceita 96 com motivo → autorizada com hashes; fila revisável exigida', () => {
  const r = aprovarConsolidacao({ ...base, quantidade_final: 96, motivo: 'divergência revisada — final 96 UN' }, contaPCP, { estado: 'revisavel' })
  assert.equal(r.estado, 'autorizada')
  if (r.estado === 'autorizada') {
    assert.equal(r.aprovacao.quantidade_final, 96)
    assert.equal(r.aprovacao.hash_eventos, 'h-ev')
    assert.equal(r.aprovacao.hash_conferencias, 'h-cf')
    assert.equal(r.aprovacao.estado, 'ativa')
    assert.ok(r.aprovacao.motivo.includes('96'))
  }
})

test('T4-neg: fila bloqueada (divergência/ausência) → aprovação negada', () => {
  const r = aprovarConsolidacao({ ...base, quantidade_final: 96, motivo: 'm' }, contaPCP, { estado: 'bloqueada' })
  assert.equal(r.estado, 'negado')
  assert.ok(r.motivo.includes('bloqueada'))
})

// C4 — invalidação atômica: conferência nova muda o hash → aprovação anterior invalidada.
test('C4: nova conferência (hash diferente) invalida a aprovação atomicamente', () => {
  const r1 = aprovarConsolidacao({ ...base, quantidade_final: 96, motivo: 'm' }, contaPCP, { estado: 'revisavel' })
  if (r1.estado !== 'autorizada') throw new Error('setup')
  const r2 = invalidarPorNovaProjecao(r1.aprovacao, 'h-cf-novo')
  assert.equal(r2.estado, 'invalidada')
  assert.equal(r2.aprovacao.estado, 'invalidada')
  assert.ok(r2.motivo.includes('INVALIDADA'))
  // mesma hash → permanece válida
  const r3 = invalidarPorNovaProjecao(r1.aprovacao, 'h-cf')
  assert.equal(r3.estado, 'sem_alteracao')
})

// C3 — igualdade 0=0 NÃO libera transação no Omie (pendência quantidade_final_zero).
test('0=0: aprovação registrada com pendência quantidade_final_zero (não libera Omie)', () => {
  const r = aprovarConsolidacao({ ...base, quantidade_final: 0, motivo: 'nada produzido — OP cancelada pelo PCP' }, contaPCP, { estado: 'revisavel' })
  assert.equal(r.estado, 'autorizada')
  if (r.estado === 'autorizada') {
    const p = r.aprovacao.pendencias
    assert.ok(Array.isArray(p) && p.some((x) => x.includes('quantidade_final_zero')))
  }
})

// Ação exigida; motivo e quantidade válidos.
test('Sem aprovar_consolidacao → 403; quantidade negativa → negado; sem motivo → negado', () => {
  const r1 = aprovarConsolidacao({ ...base, quantidade_final: 96, motivo: 'm' }, contaConsulta, { estado: 'revisavel' })
  assert.equal(r1.estado, 'negado')
  assert.ok(r1.motivo.includes('403'))
  const r2 = aprovarConsolidacao({ ...base, quantidade_final: -1, motivo: 'm' }, contaPCP, { estado: 'revisavel' })
  assert.equal(r2.estado, 'negado')
  const r3 = aprovarConsolidacao({ ...base, quantidade_final: 96, motivo: ' ' }, contaPCP, { estado: 'revisavel' })
  assert.equal(r3.estado, 'negado')
})

// Corrida com aquisição do envio (prova complementar C4).
test('Corrida: retificação antes da aquisição vale (zero POST antigo); durante sincronizando → 409', () => {
  const r1 = retificarAntesDaAquisicao('autorizada', 99)
  assert.equal(r1.estado, 'retificada')
  assert.ok(r1.motivo.includes('zero POST'))
  const r2 = retificarAntesDaAquisicao('sincronizando', 99)
  assert.equal(r2.estado, 'negado_409')
  assert.ok(r2.motivo.includes('409'))
})