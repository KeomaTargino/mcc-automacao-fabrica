// tests/pcp/spec-3-001-omie-90d-mapa.test.mjs — SPEC-3-001 CA-3-03 (P3.01-04, borda)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  dataOmieParaIso,
  linhasDoPedidoCompra,
  linhasDoPedidoVenda,
  statusPedidoVenda,
} from '../../src/lib/pcp/omie-90d-mapa.ts'
import { saldoFirme } from '../../src/lib/pcp/pedidos-firmes.ts'
import { restanteReceber } from '../../src/lib/pcp/importacao-90d.ts'

const mapaVendas = {
  versao: 'mapa-21-10',
  status_elegiveis: ['faturado', 'autorizado', 'parcial'],
  campo_data: 'data_operacional',
  horizonte_de: '2026-07-30',
  horizonte_ate: '2026-10-27',
}

test('data do Omie vira ISO; formato estranho vira null, nunca data presumida', () => {
  assert.equal(dataOmieParaIso('20/11/2026'), '2026-11-20')
  assert.equal(dataOmieParaIso('2026-11-20'), null)
  assert.equal(dataOmieParaIso(''), null)
  assert.equal(dataOmieParaIso('31/13/2026'), null)
})

test('status do pedido: cancelado vence faturado; sem sinalizador fica vazio e bloqueia', () => {
  assert.equal(statusPedidoVenda({ faturado: 'S', cancelado: 'S' }), 'cancelado')
  assert.equal(statusPedidoVenda({ faturado: 'S', devolvido_parcial: 'S' }), 'devolvido_parcial')
  assert.equal(statusPedidoVenda({ faturado: 'S' }), 'faturado')
  assert.equal(statusPedidoVenda({}), '')
  const p = {
    cabecalho: { codigo_pedido: 99 },
    infoCadastro: {},
    det: [{ ide: { codigo_item: 1 }, produto: { codigo_produto: 7, quantidade: 5, unidade: 'CX' } }],
  }
  const r = saldoFirme(linhasDoPedidoVenda(p).linhas, mapaVendas)
  assert.equal(r.total_firme, null)
  assert.equal(r.linhas[0].estado, 'bloqueada')
})

test('pedido faturado no horizonte vira firme = pedida; IDs em texto; unidade vazia = null', () => {
  const p = {
    cabecalho: { codigo_pedido: 9932022414 },
    infoCadastro: { faturado: 'S', dFat: '05/10/2026' },
    det: [
      { ide: { codigo_item_integracao: 'L1' }, produto: { codigo_produto: 1234567890, quantidade: 20, unidade: 'CX' } },
      { ide: { codigo_item: 2 }, produto: { codigo_produto: 55, quantidade: '4', unidade: '' } },
    ],
  }
  const { linhas, descartadas } = linhasDoPedidoVenda(p)
  assert.equal(descartadas.length, 0)
  assert.equal(linhas[0].produto_id, '1234567890')
  assert.equal(linhas[1].linha_id, '2')
  assert.equal(linhas[1].unidade, null)
  const r = saldoFirme(linhas, mapaVendas)
  assert.equal(r.linhas[0].firme, 20)
  assert.equal(r.linhas[1].firme, 4)
  assert.equal(r.total_firme, 24)
})

test('linha sem produto ou com quantidade ausente é descartada e listada, não vira zero', () => {
  const p = {
    cabecalho: { codigo_pedido: 1 },
    infoCadastro: { faturado: 'S', dFat: '05/10/2026' },
    det: [
      { ide: { codigo_item: 1 }, produto: { quantidade: 3 } },
      { ide: { codigo_item: 2 }, produto: { codigo_produto: 8 } },
    ],
  }
  const { linhas, descartadas } = linhasDoPedidoVenda(p)
  assert.equal(linhas.length, 0)
  assert.deepEqual(descartadas, ['1#1', '1#2'])
})

test('pedido de compra 1514 (amostra real): 10 pedidas, 4 recebidas → restante 6, previsão 20/11/2026', () => {
  const p = {
    cabecalho_consulta: { nCodPed: 9932022414, cEtapa: '20', dDtPrevisao: '20/11/2026' },
    produtos_consulta: [{ nCodItem: 3, nCodProd: 77, cUnidade: 'KG', nQtde: 10, nQtdeRec: 4 }],
  }
  const { linhas } = linhasDoPedidoCompra(p)
  assert.equal(linhas[0].data_prevista_local, '2026-11-20')
  const mapa = {
    versao: 'mapa-compras',
    status_elegiveis: ['20'],
    status_excluidos: [],
    horizonte_de: '2026-07-30',
    horizonte_ate: '2026-12-31',
  }
  const r = restanteReceber(linhas, mapa)
  assert.equal(r.linhas[0].restante, 6)
  assert.equal(r.total_restante, 6)
})

test('compra com recebida ausente é descartada (restante desconhecido, nunca 0)', () => {
  const p = {
    cabecalho_consulta: { nCodPed: 5, cEtapa: '20', dDtPrevisao: '01/11/2026' },
    produtos_consulta: [{ nCodItem: 1, nCodProd: 9, cUnidade: 'UN', nQtde: 10 }],
  }
  const { linhas, descartadas } = linhasDoPedidoCompra(p)
  assert.equal(linhas.length, 0)
  assert.deepEqual(descartadas, ['5#1'])
})
