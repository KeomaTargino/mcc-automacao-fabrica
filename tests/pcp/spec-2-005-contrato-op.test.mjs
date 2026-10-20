// tests/pcp/spec-2-005-contrato-op.test.mjs — SPEC-2-005 CA-O1 (task a2a4ccf1)
// Recorte REAL: contrato de produção no Omie comprovado na conta por sondas de LEITURA
// (20/10/2026 — ListarOrdemProducao e ConsultarOrdemProducao HTTP 200). NENHUM mutante
// executado (CA-O1): Incluir/Alterar/Upsert/Excluir/Concluir/Reverter ficam DOCUMENTADOS
// com executado:false e a guarda nega sem autorização específica do caso.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MAPA_OP, mutanteAutorizado } from '../../src/lib/pcp/contrato-op.ts'

// O1 — método de listagem correto (ListarOPs NÃO existe — provado 500 "Method not exists").
test('O1: listagem é ListarOrdemProducao no endpoint produtos/op', () => {
  assert.equal(MAPA_OP.listar.call, 'ListarOrdemProducao')
  assert.equal(MAPA_OP.listar.endpoint, 'https://app.omie.com.br/api/v1/produtos/op/')
  assert.equal(MAPA_OP.listar.chave_resposta, 'cadastros')
  assert.ok(MAPA_OP.listar.campos_request.includes('pagina'))
  assert.ok(MAPA_OP.listar.campos_request.includes('registros_por_pagina'))
  assert.ok(MAPA_OP.listar.campos_request.includes('cConcluida'))
})

// O2 — consulta dirigida provada com estrutura completa.
test('O2: ConsultarOrdemProducao documentado com identificacao/outrasInf/itensDetalhes', () => {
  assert.equal(MAPA_OP.consultar.call, 'ConsultarOrdemProducao')
  assert.ok(MAPA_OP.consultar.campos_request.includes('nCodOP'))
  assert.ok(MAPA_OP.consultar.campos_request.includes('cCodIntOP'))
  for (const k of ['identificacao', 'infAdicionais', 'outrasInf', 'itensDetalhes']) {
    assert.ok(MAPA_OP.consultar.campos_resposta.includes(k), k)
  }
  assert.ok(MAPA_OP.consultar.fault_oficial.includes('Client-101'))
})

// O3 — amostra real provada (OP do piloto M011001).
test('O3: amostra da OP real 9858633368 (M011001, 24 CX, local padrão, concluída)', () => {
  const a = MAPA_OP.amostra
  assert.equal(a.nCodOP, '9858633368')
  assert.equal(a.nCodProduto, '9337428906')
  assert.equal(a.nQtde, 24)
  assert.equal(a.codigo_local_estoque, '9300980125')
  assert.equal(a.cConcluida, 'S')
  assert.equal(a.total_de_registros, 1114)
  // baunilha: ficha 0,05 L × 24 = 1,2 — consistente entre ficha e OP
  assert.equal(a.baunilha_nqtde, 1.2)
})

// O4 — CA-O1: mutantes documentados, NENHUM executado.
test('O4: seis mutantes documentados com executado:false', () => {
  const m = MAPA_OP.mutantes
  assert.equal(m.length, 6)
  const nomes = m.map((x) => x.call).sort()
  assert.deepEqual(nomes, [
    'AlterarOrdemProducao',
    'ConcluirOrdemProducao',
    'ExcluirOrdemProducao',
    'IncluirOrdemProducao',
    'ReverterOrdemProducao',
    'UpsertOrdemProducao',
  ])
  assert.ok(m.every((x) => x.executado === false))
  const concluir = m.find((x) => x.call === 'ConcluirOrdemProducao')
  assert.ok(concluir.campos_request.includes('nQtdeProduzida'))
  assert.ok(concluir.campos_request.includes('dDtConclusao'))
})

// O5 — CA-O1: guarda nega sem autorização específica do caso.
test('O5: mutanteAutorizado nega null/vazio e só aceita caso explícito com autor', () => {
  assert.equal(mutanteAutorizado(null), false)
  assert.equal(mutanteAutorizado(undefined), false)
  assert.equal(mutanteAutorizado({}), false)
  assert.equal(mutanteAutorizado({ casoAutorizado: true }), false)
  assert.equal(
    mutanteAutorizado({ casoAutorizado: true, autorizadoPor: 'owner', revisao_hash: 'x' }),
    true,
  )
})

// O6 — replay determinístico do mapa.
test('O6: mapa é determinístico (replay igual)', () => {
  assert.deepEqual(MAPA_OP, MAPA_OP)
})