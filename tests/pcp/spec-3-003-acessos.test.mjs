// tests/pcp/spec-3-003-acessos.test.mjs — SPEC-3-003 CA-3-08 (P3.03-01)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ACOES_COMPRAS,
  AREA_DA_ACAO,
  PERFIS_DE_TESTE,
  acoesConcedidas,
  concessoesForaDaMatriz,
  contaRealPodeReceber,
  exigirAcao,
} from '../../src/lib/pcp/acoes-compras.ts'

const { comprador, aprovador, almoxarifado, financeiro } = PERFIS_DE_TESTE

test('as oito ações existem, cada uma com a sua área', () => {
  assert.equal(ACOES_COMPRAS.length, 8)
  assert.equal(AREA_DA_ACAO.conferir_recebimento, 'recebimento')
  assert.equal(AREA_DA_ACAO.aprovar_compra, 'compras')
  assert.equal(ACOES_COMPRAS.includes('autorizar_escrita_omie'), false) // ação do dono, fora desta lista
})

test('P3.03-01: perfil sem aprovar_compra tenta aprovar → 403', () => {
  const r = exigirAcao(comprador, 'aprovar_compra')
  assert.deepEqual(r, { permitido: false, http: 403, erro: 'sem_permissao' })
  assert.equal(exigirAcao(aprovador, 'aprovar_compra').permitido, true)
})

test('recusa sem pistas: perfil ausente, inativo, sem a ação, sem a área e ação inexistente dão a mesma resposta', () => {
  const sem = exigirAcao(comprador, 'aprovar_compra')
  assert.deepEqual(exigirAcao(null, 'aprovar_compra'), sem)
  assert.deepEqual(exigirAcao({ ...aprovador, ativo: false }, 'aprovar_compra'), sem)
  assert.deepEqual(exigirAcao({ ...aprovador, areas: ['recebimento'] }, 'aprovar_compra'), sem) // ação sem a área
  assert.deepEqual(exigirAcao(aprovador, 'acao_que_nao_existe'), sem)
})

test('área não concede ação por implicação: área sem a ação continua negada', () => {
  const soArea = { ativo: true, areas: ['compras', 'recebimento'], acoes: [] }
  for (const a of ACOES_COMPRAS) assert.equal(exigirAcao(soArea, a).permitido, false)
})

test('cada perfil de teste só exerce as próprias ações', () => {
  assert.deepEqual(acoesConcedidas(comprador), ['consultar_compras', 'editar_fornecedor', 'editar_conversao', 'editar_requisicao'])
  assert.deepEqual(acoesConcedidas(aprovador), ['consultar_compras', 'aprovar_compra', 'autorizar_excecao_compra'])
  assert.deepEqual(acoesConcedidas(almoxarifado), ['consultar_compras', 'conferir_recebimento'])
  assert.deepEqual(acoesConcedidas(financeiro), ['consultar_compras', 'conferir_financeiro_recebimento'])
  assert.deepEqual(acoesConcedidas(null), [])
})

test('conta real não recebe ação nova fora da matriz aprovada (matriz vigente: não aprovada)', () => {
  for (const a of ACOES_COMPRAS) assert.equal(contaRealPodeReceber(a), false)
  assert.deepEqual(concessoesForaDaMatriz(['consultar_compras', 'aprovar_compra', 'painel']), ['consultar_compras', 'aprovar_compra'])
  const aprovada = { aprovadaPeloDono: true, acoesAprovadas: ['consultar_compras'] }
  assert.equal(contaRealPodeReceber('consultar_compras', aprovada), true)
  assert.equal(contaRealPodeReceber('aprovar_compra', aprovada), false)
  assert.deepEqual(concessoesForaDaMatriz(['consultar_compras', 'aprovar_compra'], aprovada), ['aprovar_compra'])
  // lista aprovada mas matriz ainda não aprovada pelo dono: nada passa
  assert.equal(contaRealPodeReceber('consultar_compras', { aprovadaPeloDono: false, acoesAprovadas: ['consultar_compras'] }), false)
})
