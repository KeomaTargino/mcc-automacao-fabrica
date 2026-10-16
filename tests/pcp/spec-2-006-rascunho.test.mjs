// tests/pcp/spec-2-006-rascunho.test.mjs — SPEC-2-006 CA-S3 (task 8bb4ef77), recorte sintético
// Oráculo T7 da SPEC (e gate de publicação do T4). Publicação real por área = 16b8a592.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aceitarSugestao, publicarRascunho, type SugestaoAceitavel } from '../../src/lib/pcp/rascunho.ts'

const sugestaoOK: SugestaoAceitavel = {
  id: 'S-T1',
  tipo: 'producao',
  item: 'COOKIE-1',
  unidade: 'UN',
  quantidade: 50,
  hash_conteudo: JSON.stringify(['producao', 'COOKIE-1', 50, 'UN']),
  versao_parametros: 'sintetico-fixture',
  estado: 'calculada',
}

const contaPCP = { acoes: ['editar_programacao' as const], usuario: 'keoma.targino' }
const contaConsulta = { acoes: ['consultar' as const], usuario: 'arivaldo.missias' }

// T7a — CA-S3: conta sem editar_programacao → negado e zero rascunho.
test('T7a: conta de consulta tenta aceitar → negado (403), zero rascunho', () => {
  const r = aceitarSugestao(sugestaoOK, contaConsulta, [])
  assert.equal(r.estado, 'negado')
  assert.ok(r.motivo.includes('editar_programacao'))
})

// T7b — CA-S3: aceitar cria rascunho SEM publicar e SEM enviar compra.
test('T7b: aceitar cria rascunho; publicado=false e pedido_compra_enviado=false', () => {
  const r = aceitarSugestao(sugestaoOK, contaPCP, [])
  assert.equal(r.estado, 'rascunho_criado')
  if (r.estado === 'rascunho_criado') {
    assert.equal(r.rascunho.publicado, false)
    assert.equal(r.rascunho.pedido_compra_enviado, false)
    assert.equal(r.rascunho.quantidade, 50)
    assert.equal(r.rascunho.item, 'COOKIE-1')
  }
})

// T7c — CA-S3: replay não duplica; sugestão alterada = 409.
test('T7c: replay do mesmo aceitar não duplica; sugestão alterada → conflito 409', () => {
  const r1 = aceitarSugestao(sugestaoOK, contaPCP, [])
  assert.equal(r1.estado, 'rascunho_criado')
  const lista = r1.estado === 'rascunho_criado' ? [r1.rascunho] : []
  const r2 = aceitarSugestao(sugestaoOK, contaPCP, lista)
  assert.equal(r2.estado, 'replay')
  assert.equal(lista.length, 1)
  const alterada = { ...sugestaoOK, quantidade: 60 }
  const r3 = aceitarSugestao(alterada, contaPCP, lista)
  assert.equal(r3.estado, 'conflito')
  assert.ok(r3.motivo.includes('409'))
})

// Sugestão bloqueada não é aceitável.
test('Sugestão bloqueada (faltante) → negado', () => {
  const r = aceitarSugestao({ ...sugestaoOK, estado: 'bloqueada' }, contaPCP, [])
  assert.equal(r.estado, 'negado')
  assert.ok(r.motivo.includes('bloqueada'))
})

// Gate de publicação (T4): acima da capacidade negado; conta sem ação negada.
test('Publicar rascunho acima da capacidade → negado; sem editar_programacao → negado', () => {
  const r1 = aceitarSugestao(sugestaoOK, contaPCP, [])
  if (r1.estado !== 'rascunho_criado') throw new Error('setup')
  const pub1 = publicarRascunho(r1.rascunho, contaPCP, 30)
  assert.equal(pub1.estado, 'negado')
  assert.ok(pub1.motivo.includes('capacidade'))
  const pub2 = publicarRascunho(r1.rascunho, contaConsulta, null)
  assert.equal(pub2.estado, 'negado')
  assert.ok(pub2.motivo.includes('editar_programacao'))
  const pub3 = publicarRascunho(r1.rascunho, contaPCP, 60)
  assert.equal(pub3.estado, 'gate_ok')
})

// Compra: aceitar sugestão de compra NÃO envia pedido.
test('Sugestão de compra aceita → rascunho com pedido_compra_enviado=false', () => {
  const compra: SugestaoAceitavel = {
    id: 'C-T1',
    tipo: 'compra',
    item: 'FARINHA',
    unidade: 'KG',
    quantidade: 6,
    hash_conteudo: JSON.stringify(['compra', 'FARINHA', 6, 'KG']),
    versao_parametros: 'sintetico-fixture',
    estado: 'calculada',
  }
  const r = aceitarSugestao(compra, contaPCP, [])
  assert.equal(r.estado, 'rascunho_criado')
  if (r.estado === 'rascunho_criado') {
    assert.equal(r.rascunho.pedido_compra_enviado, false)
    assert.equal(r.rascunho.quantidade, 6)
  }
})