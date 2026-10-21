// tests/pcp/spec-2-001-importacao-90d.test.mjs — e6aa4afa (CA-D4), oráculos da SPEC
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ativarLote,
  janela90,
  marcarPaginaFalha,
  novoEstado,
  normalizarLinha,
  registrarPagina,
  restanteReceber,
} from '../../src/lib/pcp/importacao-90d.ts'

// ---- Importação (lote/geração) ----

const LIN = (o) => ({
  documento_id: 'DOC-1', linha_id: 'L1', produto_id: '9337428906', local_id: '9300980125',
  unidade_oficial: 'UN', quantidade: 10, tipo_status: 'faturado',
  data_operacional: '2026-10-01', referencia: null, ...o,
})

test('I1: página 2 falha → lote anterior permanece com aviso; replay não duplica; geração antiga recusada', () => {
  const g2 = novoEstado('vendas_90d')
  g2.geracaoAtiva = 1
  g2.geracoes = { 1: { paginasOk: [1], chaves: ['omie:vendas_90d:D0:L0'], falhas: [] } }
  const r1 = registrarPagina(g2, 2, 1, [LIN({}), LIN({ linha_id: 'L1' })], 'omie') // L1 repetida
  assert.equal(r1.novas, 1)
  assert.equal(r1.repetidas, 1)
  marcarPaginaFalha(g2, 2, 2)
  const act = ativarLote(g2, 2, 2)
  assert.equal(act.ativado, false)
  assert.equal(act.loteAnteriorPermanece, true)
  assert.ok(act.aviso.includes('lote anterior permanece ativo'))
  assert.equal(g2.geracaoAtiva, 1)
  registrarPagina(g2, 2, 2, [LIN({ documento_id: 'DOC-2', linha_id: 'L9' })], 'omie')
  const act2 = ativarLote(g2, 2, 2)
  assert.equal(act2.ativado, true)
  const antiga = ativarLote(g2, 1, 1)
  assert.equal(antiga.ativado, false)
  assert.ok(antiga.motivo.includes('recusada'))
})

test('I2: janela D-89..D inclusiva; data externa excluída na importação; unidade null nunca vira UN', () => {
  const j = janela90('2026-10-21')
  assert.equal(j.de, '2026-07-24')
  assert.equal(j.ate, '2026-10-21')
  const e = novoEstado('producao_90d')
  const r = registrarPagina(
    e, 1, 1,
    [LIN({}), LIN({ linha_id: 'L2', data_operacional: '2026-05-01' }), LIN({ linha_id: 'L3', data_operacional: '2026-07-24' }), LIN({ linha_id: 'L4', data_operacional: '2026-10-21' })],
    'omie', j,
  )
  assert.equal(r.novas, 3) // L1, L3 (borda de), L4 (borda até)
  assert.equal(r.fora, 1) // L2 excluída
  const n = normalizarLinha({ documento_id: 'D', linha_id: 'L', produto_id: 123, unidade_oficial: null, quantidade: 2.5, tipo_status: 'x', data_operacional: null })
  assert.equal(n.ok, true)
  assert.equal(n.linha.unidade_oficial, null)
  assert.equal(n.linha.produto_id, '123')
  const ruim = normalizarLinha({ documento_id: 'D', linha_id: 'L', produto_id: '', unidade_oficial: 'UN', quantidade: -1, tipo_status: 'x', data_operacional: null })
  assert.equal(ruim.ok, false)
})

// ---- Restante a receber (compras) ----

const MAPA = {
  versao: 'sintetico-v1',
  status_elegiveis: ['aprovado', 'confirmado', 'parcial'],
  status_excluidos: ['cancelado'],
  horizonte_de: '2026-07-24',
  horizonte_ate: '2026-10-21',
}
const C = (o) => ({
  pedido_id: 'PC-1', linha_id: 'A', produto_id: 'M084073', unidade_oficial: 'KG',
  quantidade_pedida: 20, quantidade_recebida: 5, data_prevista_local: '2026-10-10',
  status_origem: 'aprovado', ...o,
})

test('C1: aprovada 20 KG, recebida 5 KG, dentro do horizonte → 15 KG restantes', () => {
  const r = restanteReceber([C({})], MAPA)
  assert.equal(r.total_restante, 15)
  assert.equal(r.linhas[0].estado, 'elegivel')
})

test('C2: cancelada 7 KG e fora do horizonte 3 KG → não elegíveis (0)', () => {
  const r = restanteReceber([C({ linha_id: 'A', quantidade_pedida: 7, quantidade_recebida: 0, status_origem: 'cancelado' }), C({ linha_id: 'B', data_prevista_local: '2026-05-01' })], MAPA)
  assert.equal(r.total_restante, 0)
  assert.ok(r.linhas.every((l) => l.estado === 'nao_elegivel'))
})

test('C3: replay da mesma pedido+linha mantém 15', () => {
  const r = restanteReceber([C({}), C({})], MAPA)
  assert.equal(r.total_restante, 15)
})

test('C4: restante desconhecido → null e bloqueia (nunca 0)', () => {
  const r = restanteReceber([C({ status_origem: 'nao_sei' })], MAPA)
  assert.equal(r.total_restante, null)
  assert.equal(r.linhas[0].estado, 'bloqueada')
  assert.equal(r.linhas[0].restante, null)
})

test('C5: unidade ausente bloqueia; recebida > pedida bloqueia (nunca negativa/acima do pedido)', () => {
  const semUn = restanteReceber([C({ unidade_oficial: null })], MAPA)
  assert.equal(semUn.total_restante, null)
  assert.equal(semUn.linhas[0].motivo, 'unidade ausente')
  const ruim = restanteReceber([C({ quantidade_recebida: 25 })], MAPA)
  assert.equal(ruim.total_restante, null)
  assert.equal(ruim.linhas[0].motivo, 'saldo inconsistente')
})