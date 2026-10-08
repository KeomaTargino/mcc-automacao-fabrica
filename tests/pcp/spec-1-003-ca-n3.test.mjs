import { test } from 'node:test'
import assert from 'node:assert/strict'

// SPEC-1-003 — CA-N3: relacionar pedidos de canais sem duplicação (TDD da SPEC).
// Espelho da precedência implementada no hook pcp_pedidos_visao (v0.0.44):
// (1) cancelado; (2) conflito (referência múltipla); (3) vínculo único comprovado;
// (4) paid sem vínculo; (5) pending/authorized; (6) não mapeado.
// Fixtures da SPEC: NS-10..NS-14, OM-11, OM-L1. Mesma pessoa/valor NUNCA mescla.

// --- Índice de vínculo: construído do lote oficial (codigo_pedido_integracao → codigo_pedido)
function indiceVinculo(pedidosOmie) {
  const vinculados = {}
  const duplicados = []
  const vistos = new Set()
  for (const p of pedidosOmie) {
    const cab = p.cabecalho || {}
    const cod = String(cab.codigo_pedido || '')
    const ref = String(cab.codigo_pedido_integracao || '')
    if (cod) {
      if (vistos.has(cod)) duplicados.push(cod)
      vistos.add(cod)
    }
    if (ref) {
      if (!vinculados[ref]) vinculados[ref] = { omie_id: cod, referencias: 0 }
      vinculados[ref].referencias++
    }
  }
  const conflitos = new Set()
  for (const [ref, v] of Object.entries(vinculados)) if (v.referencias > 1) conflitos.add(ref)
  return { vinculados, conflitos, duplicados }
}

// --- Classificação na precedência da SPEC
function classificar(pedido, indice) {
  const status = String(pedido.status || '')
  const pagamento = String(pedido.pagamento || '')
  const id = String(pedido.pedido_id || '')
  if (status === 'cancelled') return 'cancelado'
  const v = indice.vinculados[id]
  if (v) return indice.conflitos.has(id) ? 'conflito' : 'vinculado_omie'
  if (pagamento === 'paid') return 'pago_sem_vinculo'
  if (pagamento === 'pending' || pagamento === 'authorized') return 'pendente_pagamento'
  return 'status_nao_mapeado'
}

function contagem(pedidosCanal, pedidosOmie) {
  const indice = indiceVinculo(pedidosOmie)
  const c = { pendente_pagamento: 0, pago_sem_vinculo: 0, vinculado_omie: 0, cancelado: 0, conflito: 0, status_nao_mapeado: 0 }
  for (const p of pedidosCanal) c[classificar(p, indice)]++
  return { ...c, duplicados: indice.duplicados }
}

// --- Fixtures da SPEC
const NS10 = { pedido_id: 'ns-10', status: 'open', pagamento: 'pending' } // pendente sem Omie
const NS11 = { pedido_id: 'ns-11', status: 'open', pagamento: 'paid' } // pago ligado à OM-11
const NS12 = { pedido_id: 'ns-12', status: 'open', pagamento: 'paid' } // pago sem vínculo
const NS13 = { pedido_id: 'ns-13', status: 'cancelled', pagamento: 'paid' } // cancelado
const NS14 = { pedido_id: 'ns-14', status: 'open', pagamento: 'voided' } // não mapeado
const OM11 = { cabecalho: { codigo_pedido: '111', codigo_pedido_integracao: 'ns-11' } }
const OML1 = { cabecalho: { codigo_pedido: '222', codigo_pedido_integracao: '' } } // loja própria, sem ref

test('CA-N1: pendente é intenção separada; cancelado não aumenta demanda', () => {
  const c = contagem([NS10, NS13], [OM11, OML1])
  assert.equal(c.pendente_pagamento, 1, 'NS-10 separado')
  assert.equal(c.cancelado, 1, 'NS-13 não soma demanda')
  assert.equal(c.pago_sem_vinculo, 0)
})

test('CA-N2: pago sem vínculo aguarda; loja própria válida não é bloqueada', () => {
  const c = contagem([NS11, NS12], [OM11, OML1])
  assert.equal(c.vinculado_omie, 1, 'NS-11 vinculado pela referência da OM-11')
  assert.equal(c.pago_sem_vinculo, 1, 'NS-12 aguarda vínculo')
  // OM-L1 (loja própria) existe no oficial mesmo sem ref de integração
  assert.equal(indiceVinculo([OM11, OML1]).vinculados['ns-11'].omie_id, '111')
})

test('CA-N3: vínculo conta uma vez; mesmo cliente/valor sem referência NÃO mescla; conflito preserva originais', () => {
  // referência múltipla: dois pedidos oficiais apontando a mesma ref
  const OM11b = { cabecalho: { codigo_pedido: '112', codigo_pedido_integracao: 'ns-11' } }
  const c = contagem([NS11], [OM11, OM11b])
  assert.equal(c.conflito, 1, 'referência múltipla → conflito, sem merge')
  assert.equal(c.vinculado_omie, 0)
  // duplicação de codigo_pedido no lote oficial é sinalizada
  const OMdup = { cabecalho: { codigo_pedido: '111', codigo_pedido_integracao: '' } }
  const idx = indiceVinculo([OM11, OMdup])
  assert.deepEqual(idx.duplicados, ['111'], 'duplicado oficial sinalizado')
  // mesma pessoa/valor/data sem referência: nada de vínculo automático
  const NS15 = { pedido_id: 'ns-15', status: 'open', pagamento: 'paid' }
  const c2 = contagem([NS12, NS15], [OM11, OML1])
  assert.equal(c2.vinculado_omie, 0, 'sem referência não há vínculo (nem por cliente/valor)')
  assert.equal(c2.pago_sem_vinculo, 2, 'ambos seguem complemento separado')
})

test('CA-N2/CA-N3: estados externos não confirmam nem descartam demanda', () => {
  const c = contagem([NS14], [OM11, OML1])
  assert.equal(c.status_nao_mapeado, 1, 'voided preserva estado bruto, sem suposição')
  assert.equal(c.pago_sem_vinculo, 0)
})
