// tests/pcp/spec-3-001-faltantes.test.mjs — SPEC-3-001 CA-3-02 (P3.01-02)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { diferencaEntreLeituras, listarFaltantes } from '../../src/lib/pcp/faltantes.ts'

const oc = (codigo, origem, referencia, descricao = null) => ({ codigo, origem, referencia, descricao })

test('P3.01-02: código do estoque sem cadastro entra na lista; some depois do cadastro simulado', () => {
  const ocorrencias = [oc('M001', 'estoque', 'local 10', 'MISTURA X'), oc('M002', 'estoque', 'local 10')]
  const antes = listarFaltantes(['M002'], ocorrencias)
  assert.equal(antes.situacao, 'ok')
  assert.deepEqual(
    antes.itens.map((i) => i.codigo),
    ['M001'],
  )
  assert.equal(antes.itens[0].descricao, 'MISTURA X')
  const depois = listarFaltantes(['M002', 'M001'], ocorrencias)
  assert.deepEqual(depois.itens, [])
  assert.deepEqual(diferencaEntreLeituras(['M001'], []), { cadastrados: ['M001'], novos: [] })
})

test('o mesmo código em estoque, ficha e pedido vira um item com os três lugares', () => {
  const r = listarFaltantes(
    [],
    [oc('m009', 'pedido', '1514'), oc('M009', 'estoque', 'local 3'), oc('M009', 'ficha', 'M011001'), oc('M009', 'estoque', 'local 3')],
  )
  assert.equal(r.itens.length, 1)
  assert.deepEqual(
    r.itens[0].onde.map((x) => x.origem),
    ['estoque', 'ficha', 'pedido'],
  )
})

test('catálogo não lido por inteiro: lista vazia com situação própria, nunca "tudo falta"', () => {
  const r = listarFaltantes(null, [oc('M001', 'estoque', 'local 10')], ['ficha', 'pedido'])
  assert.equal(r.situacao, 'catalogo_incompleto')
  assert.deepEqual(r.itens, [])
  assert.deepEqual(r.fontes_sem_leitura, ['ficha', 'pedido'])
})

test('código vazio é ignorado e a ordem é estável (replay devolve o mesmo)', () => {
  const o = [oc('B', 'estoque', 'x'), oc('', 'estoque', 'y'), oc('A', 'estoque', 'z')]
  const a = listarFaltantes([], o)
  const b = listarFaltantes([], o.slice().reverse())
  assert.deepEqual(a, b)
  assert.deepEqual(
    a.itens.map((i) => i.codigo),
    ['A', 'B'],
  )
})
