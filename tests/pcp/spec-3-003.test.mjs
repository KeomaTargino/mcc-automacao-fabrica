// tests/pcp/spec-3-003.test.mjs — SPEC-3-003 CA-3-09, CA-3-10, CA-3-11 (P3.03-02, 03, 04, 05 em fixture)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PERFIS_DE_TESTE } from '../../src/lib/pcp/acoes-compras.ts'
import {
  MENSAGEM_CADASTRAR,
  MENSAGEM_CATALOGO_INDISPONIVEL,
  autorizarExcecao,
  avaliarItem,
  contarAbertas,
  regularizar,
} from '../../src/lib/pcp/bloqueio-item.ts'
import { acrescentarVersao, converter, fatorVigente, validarFator } from '../../src/lib/pcp/conversao.ts'
import { salvarComplemento, validarContatos } from '../../src/lib/pcp/fornecedor-complemento.ts'

const AGORA = new Date('2026-10-28T16:00:00Z')
const { comprador, aprovador } = PERFIS_DE_TESTE

// ---- CA-3-10: item fora do cadastro ----
test('P3.03-02: item fora do catálogo é bloqueado com a mensagem; dentro do catálogo passa', () => {
  const base = { catalogo: ['FARINHA-DEMO'], documento: 'requisicao', documentoId: 'R1', excecoes: [] }
  const fora = avaliarItem({ ...base, item: 'ITEM-NOVO' })
  assert.equal(fora.liberado, false)
  assert.equal(fora.mensagem, MENSAGEM_CADASTRAR)
  assert.equal(MENSAGEM_CADASTRAR, 'cadastrar no Omie antes de comprar')
  assert.deepEqual(avaliarItem({ ...base, item: ' farinha-demo ' }), { liberado: true, via: 'catalogo' })
})

test('vale para cotação e recebimento; catálogo não lido não prova que existe (mensagem própria)', () => {
  for (const documento of ['cotacao', 'recebimento']) {
    assert.equal(avaliarItem({ item: 'X', catalogo: ['A'], documento, documentoId: 'D', excecoes: [] }).liberado, false)
  }
  const r = avaliarItem({ item: 'A', catalogo: null, documento: 'requisicao', documentoId: 'R1', excecoes: [] })
  assert.equal(r.liberado, false)
  assert.equal(r.mensagem, MENSAGEM_CATALOGO_INDISPONIVEL)
})

test('exceção sem motivo é recusada; sem a ação é 403; com motivo libera e fica pendente de regularização', () => {
  const pedido = { usuario: 'aprov', item: 'ITEM-NOVO', documento: 'requisicao', documentoId: 'R1', existentes: [], agora: AGORA }
  assert.equal(autorizarExcecao({ ...pedido, perfil: comprador, motivo: 'urgente' }).http, 403)
  const semMotivo = autorizarExcecao({ ...pedido, perfil: aprovador, motivo: '  ' })
  assert.equal(semMotivo.ok, false)
  assert.equal(semMotivo.http, 422)
  const ok = autorizarExcecao({ ...pedido, perfil: aprovador, motivo: 'fornecedor entrega amanhã' })
  assert.equal(ok.ok, true)
  assert.equal(ok.excecao.estado, 'aberta')
  assert.equal(ok.excecao.autorizadoPor, 'aprov')
  const livre = avaliarItem({ item: 'ITEM-NOVO', catalogo: ['A'], documento: 'requisicao', documentoId: 'R1', excecoes: [ok.excecao] })
  assert.deepEqual(livre, { liberado: true, via: 'excecao', pendenteDeRegularizacao: true })
  // a exceção vale só para aquele documento
  assert.equal(avaliarItem({ item: 'ITEM-NOVO', catalogo: ['A'], documento: 'requisicao', documentoId: 'R2', excecoes: [ok.excecao] }).liberado, false)
})

test('uma exceção por item e documento (idempotente); regularização fecha quando o item entra no catálogo', () => {
  const base = { perfil: aprovador, usuario: 'aprov', item: 'ITEM-NOVO', documento: 'requisicao', documentoId: 'R1', motivo: 'urgente', agora: AGORA }
  const a = autorizarExcecao({ ...base, existentes: [] })
  const b = autorizarExcecao({ ...base, existentes: [a.excecao] })
  assert.equal(b.criada, false)
  assert.equal(contarAbertas([a.excecao]), 1)
  assert.equal(contarAbertas(regularizar([a.excecao], ['A'])), 1) // ainda fora do catálogo
  assert.equal(contarAbertas(regularizar([a.excecao], null)), 1) // catálogo não lido: não regulariza
  const depois = regularizar([a.excecao], ['A', 'item-novo'])
  assert.equal(depois[0].estado, 'regularizada')
  assert.equal(contarAbertas(depois), 0)
})

// ---- CA-3-11: conversão ----
const base = {
  item: 'FARINHA-DEMO',
  fornecedor: null,
  apresentacao: 'saco 25 kg',
  unidadeCompra: 'SC',
  fator: 25,
  unidadeEstoque: 'KG',
  confirmadoPor: 'comprador',
  confirmadoEm: '2026-10-28T15:00:00Z',
}

test('P3.03-04: fator 25 e 4 sacos a R$ 250,00 → 100 KG a R$ 10,00 por KG', () => {
  const a = acrescentarVersao([], base)
  assert.equal(a.ok, true)
  const r = converter(a.lista, { item: 'FARINHA-DEMO', fornecedor: 'F1', apresentacao: 'saco 25 kg', unidadeCompra: 'SC', quantidade: 4, precoPorUnidadeCompra: 250 })
  assert.deepEqual(r, { estado: 'convertida', quantidade: 100, unidade: 'KG', precoPorUnidadeEstoque: 10, fatorUsado: 25, fatorVersao: 1 })
})

test('P3.03-03: sem fator a quantidade fica na unidade de compra, com pendência e sem preço comparável', () => {
  const r = converter([], { item: 'FARINHA-DEMO', fornecedor: null, apresentacao: 'saco 25 kg', unidadeCompra: 'SC', quantidade: 4, precoPorUnidadeCompra: 250 })
  assert.equal(r.estado, 'sem_fator')
  assert.equal(r.quantidade, 4)
  assert.equal(r.unidade, 'SC')
  assert.equal(r.precoPorUnidadeEstoque, null)
  assert.ok(r.pendencias.length > 0)
})

test('fator inválido, unidade de estoque desconhecida e sem confirmação são recusados', () => {
  for (const ruim of [{ fator: 0 }, { fator: -2 }, { fator: NaN }, { unidadeEstoque: null }, { confirmadoPor: '' }, { apresentacao: '' }]) {
    const v = validarFator({ ...base, ...ruim })
    assert.equal(v.ok, false)
  }
  assert.equal(acrescentarVersao([], { ...base, unidadeEstoque: null }).ok, false)
})

test('mudar o fator cria versão nova; o documento antigo guarda a versão e o fator que usou', () => {
  const v1 = acrescentarVersao([], base)
  const antigo = converter(v1.lista, { item: 'FARINHA-DEMO', fornecedor: null, apresentacao: 'saco 25 kg', unidadeCompra: 'SC', quantidade: 4, precoPorUnidadeCompra: 250 })
  const v2 = acrescentarVersao(v1.lista, { ...base, fator: 20, confirmadoEm: '2026-11-02T10:00:00Z' })
  assert.equal(v2.fator.versao, 2)
  assert.equal(v1.lista[0].fator, 25) // a versão 1 não foi alterada
  const novo = converter(v2.lista, { item: 'FARINHA-DEMO', fornecedor: null, apresentacao: 'saco 25 kg', unidadeCompra: 'SC', quantidade: 4, precoPorUnidadeCompra: 250 })
  assert.equal(novo.quantidade, 80)
  assert.equal(novo.fatorVersao, 2)
  assert.equal(antigo.quantidade, 100) // o resultado antigo continua com 100 e versão 1
  assert.equal(antigo.fatorVersao, 1)
})

test('fator do fornecedor vale mais que o geral; unidade de compra diferente do fator não converte', () => {
  const g = acrescentarVersao([], base)
  const f = acrescentarVersao(g.lista, { ...base, fornecedor: 'F1', fator: 24 })
  assert.equal(fatorVigente(f.lista, 'FARINHA-DEMO', 'F1', 'saco 25 kg').fator, 24)
  assert.equal(fatorVigente(f.lista, 'FARINHA-DEMO', 'F2', 'saco 25 kg').fator, 25)
  const errada = converter(g.lista, { item: 'FARINHA-DEMO', fornecedor: null, apresentacao: 'saco 25 kg', unidadeCompra: 'CX', quantidade: 1, precoPorUnidadeCompra: 10 })
  assert.equal(errada.estado, 'sem_fator')
})

// ---- CA-3-09: complemento do fornecedor (fixture; contatos fictícios) ----
const contato = { nome: 'Contato Demo', funcao: 'Vendas', telefone: '(11) 5550-0100', email: 'demo@exemplo.test' }

test('contatos em campos próprios; prazo em dias; cada alteração é uma versão com autor e hora', () => {
  const v1 = salvarComplemento({ perfil: comprador, usuario: 'comprador', fornecedor: 'F1', contatos: [contato], prazoEntregaDias: 7, anterior: null, agora: AGORA })
  assert.equal(v1.ok, true)
  assert.equal(v1.complemento.versao, 1)
  assert.equal(v1.complemento.contatos[0].telefone, '(11) 5550-0100')
  assert.equal(v1.complemento.alteradoPor, 'comprador')
  const v2 = salvarComplemento({ perfil: comprador, usuario: 'comprador', fornecedor: 'F1', contatos: [contato], prazoEntregaDias: 10, anterior: v1.complemento, agora: new Date('2026-10-29T09:00:00Z') })
  assert.equal(v2.complemento.versao, 2)
  assert.equal(v1.complemento.prazoEntregaDias, 7) // versão anterior intacta
})

test('sem a ação editar_fornecedor é 403; dados inválidos são recusados com o motivo', () => {
  const pedido = { usuario: 'x', fornecedor: 'F1', contatos: [contato], prazoEntregaDias: 7, anterior: null, agora: AGORA }
  assert.equal(salvarComplemento({ ...pedido, perfil: aprovador }).http, 403)
  const ruim = salvarComplemento({ ...pedido, perfil: comprador, contatos: [{ ...contato, email: 'sem-arroba' }], prazoEntregaDias: -1 })
  assert.equal(ruim.ok, false)
  assert.equal(ruim.motivos.length, 2)
})

test('tudo num campo só (e-mail ou telefone dentro do nome) é recusado; nome vazio também', () => {
  assert.ok(validarContatos([{ nome: 'Fulano fulano@exemplo.test', funcao: '', telefone: '', email: '' }]).length > 0)
  assert.ok(validarContatos([{ nome: 'Fulano 11955500100', funcao: '', telefone: '', email: '' }]).length > 0)
  assert.ok(validarContatos([{ nome: '', funcao: 'x', telefone: '', email: '' }]).length > 0)
  assert.deepEqual(validarContatos([contato]), [])
})
