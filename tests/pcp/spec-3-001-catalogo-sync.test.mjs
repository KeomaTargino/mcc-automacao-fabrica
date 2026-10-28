// tests/pcp/spec-3-001-catalogo-sync.test.mjs — SPEC-3-001 CA-3-01 (P3.01-01)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  classificarResposta,
  escolherCatalogoAtivo,
  executarSubLote,
  loteCompleto,
  novoSync,
  resumoSync,
} from '../../src/lib/pcp/catalogo-sync.ts'

const T0 = new Date('2026-10-28T10:00:00Z')
const ok = (d, u = 'CX') => ({ tipo: 'ok', descricao: d, unidade: u, inativo: 'N' })

test('P3.01-01: bloqueio 425 no terceiro código — para, cursor salvo, próxima tentativa +12h', () => {
  const s = novoSync(['A1', 'A2', 'A3', 'A4', 'A5'])
  const consulta = (c) => (c === 'A3' ? { tipo: 'bloqueado', motivo: 'http_425' } : ok('P ' + c))
  const r = executarSubLote(s, consulta, { tamanho: 10, agora: T0 })
  assert.equal(r.parou, 'bloqueio_omie')
  assert.equal(r.estado.cursor, 2) // A3 não foi resolvido
  assert.deepEqual(Object.keys(r.estado.porCodigo), ['A1', 'A2'])
  assert.equal(r.estado.proximaTentativa, '2026-10-28T22:00:00.000Z')
  assert.equal(r.estado.motivoBloqueio, 'http_425')
  assert.equal(resumoSync(r.estado).situacao, 'bloqueado_omie')
})

test('guarda: antes da hora não consulta nada; depois da hora retoma de A3', () => {
  const s = novoSync(['A1', 'A2', 'A3'])
  const bloqueia = (c) => (c === 'A3' ? { tipo: 'bloqueado', motivo: 'consumo_redundante' } : ok(c))
  const r1 = executarSubLote(s, bloqueia, { tamanho: 10, agora: T0 })
  let chamadas = 0
  const conta = (c) => {
    chamadas += 1
    return ok(c)
  }
  const cedo = executarSubLote(r1.estado, conta, { tamanho: 10, agora: new Date('2026-10-28T12:00:00Z') })
  assert.equal(cedo.parou, 'aguardando_guarda')
  assert.equal(chamadas, 0)
  const tarde = executarSubLote(r1.estado, conta, { tamanho: 10, agora: new Date('2026-10-28T22:00:01Z') })
  assert.equal(tarde.parou, 'fim_da_lista')
  assert.equal(chamadas, 1) // só A3
  assert.equal(loteCompleto(tarde.estado), true)
})

test('sub-lotes pequenos: tamanho 2 percorre 5 códigos em 3 chamadas, sem repetir consulta', () => {
  let s = novoSync(['a1', 'A1', 'A2', 'A3', 'A4', 'A5'])
  assert.equal(s.codigos.length, 5) // maiúsculas e sem repetição
  const vistos = []
  const consulta = (c) => {
    vistos.push(c)
    return ok(c)
  }
  const paradas = []
  for (let i = 0; i < 3; i++) {
    const r = executarSubLote(s, consulta, { tamanho: 2, agora: T0 })
    paradas.push(r.parou)
    s = r.estado
  }
  assert.deepEqual(paradas, ['fim_do_sublote', 'fim_do_sublote', 'fim_da_lista'])
  assert.deepEqual(vistos, ['A1', 'A2', 'A3', 'A4', 'A5'])
})

test('catálogo ativo só troca com lote completo; incompleto mantém o anterior intacto', () => {
  const anterior = { Z9: { codigo: 'Z9', descricao: 'velho', unidade: 'KG', ativo: true, origem: 'consulta_dirigida' } }
  const s = novoSync(['A1', 'A2', 'A3'])
  const parcial = executarSubLote(s, (c) => (c === 'A3' ? { tipo: 'bloqueado', motivo: 'http_425' } : ok(c)), {
    tamanho: 10,
    agora: T0,
  })
  const e1 = escolherCatalogoAtivo(anterior, parcial.estado)
  assert.equal(e1.trocou, false)
  assert.deepEqual(Object.keys(e1.ativo), ['Z9'])
  const completo = executarSubLote(novoSync(['A1']), (c) => ok(c), { tamanho: 10, agora: T0 })
  const e2 = escolherCatalogoAtivo(anterior, completo.estado)
  assert.equal(e2.trocou, true)
  assert.deepEqual(Object.keys(e2.ativo), ['A1'])
})

test('não encontrado vira faltante, nunca produto; unidade ausente fica null', () => {
  const s = novoSync(['A1', 'A2'])
  const r = executarSubLote(
    s,
    (c) => (c === 'A1' ? { tipo: 'nao_encontrado' } : { tipo: 'ok', descricao: 'Sem unidade', unidade: null, inativo: 'N' }),
    { tamanho: 10, agora: T0 },
  )
  assert.deepEqual(r.estado.naoEncontrados, ['A1'])
  assert.equal(r.estado.porCodigo['A1'], undefined)
  assert.equal(r.estado.porCodigo['A2'].unidade, null)
})

test('erro transitório não avança o cursor', () => {
  const s = novoSync(['A1', 'A2'])
  const r = executarSubLote(s, (c) => (c === 'A2' ? { tipo: 'erro', detalhe: 'http_500' } : ok(c)), {
    tamanho: 10,
    agora: T0,
  })
  assert.equal(r.parou, 'erro_transitorio')
  assert.equal(r.estado.cursor, 1)
  assert.equal(loteCompleto(r.estado), false)
})

test('classificarResposta: 425, consumo redundante, ok, ausente, 500', () => {
  assert.deepEqual(classificarResposta(425, null, null), { tipo: 'bloqueado', motivo: 'http_425' })
  assert.deepEqual(classificarResposta(500, 'Consumo redundante detectado', null), {
    tipo: 'bloqueado',
    motivo: 'consumo_redundante',
  })
  assert.equal(classificarResposta(200, null, { descricao: 'X', unidade: 'CX' }).tipo, 'ok')
  assert.equal(classificarResposta(200, null, {}).tipo, 'nao_encontrado')
  assert.equal(classificarResposta(500, 'erro interno', null).tipo, 'erro')
})

test('entrada não é alterada (estado imutável entre chamadas)', () => {
  const s = novoSync(['A1', 'A2'])
  executarSubLote(s, (c) => ok(c), { tamanho: 10, agora: T0 })
  assert.equal(s.cursor, 0)
  assert.deepEqual(s.porCodigo, {})
})
