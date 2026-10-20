// tests/pcp/spec-2-001-conciliacao.test.mjs — SPEC-2-001 CA-D1/D2/D3 (task 5d8793fb)
// Recorte REAL: conciliação do piloto M011001 com amostra oficial gravada da fonte
// (sondas 20/10/2026 — ConsultarProduto/ConsultarEstrutura/ListarLocaisEstoque, HTTP 200).
// Oráculos: unidade oficial preservada (CX, nunca UN por padrão); ficha preservada
// verbatim (identidade/quantidade/unidade); null nunca vira UN; linha legada 'UN'
// (defaultUN da F1) sinalizada incompatível SEM conversão; mapa de campos (CA-D3).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { conciliarProduto, conciliarLinhaEstoque, MAPA_FONTES } from '../../src/lib/pcp/conciliacao.ts'

// Amostra oficial (prova da sonda dirigida — evidencia-5d8793fb.md). Itens com
// quantidade/unidade EXATAMENTE como a fonte devolveu — nada é inventado aqui.
const AMOSTRA = {
  produto: {
    produto_id: '9337428906',
    codigo: 'M011001',
    descricao: 'MISTURA P/COOKIE TRADICIONAL CX C/100 CONGELADO',
    unidade: 'CX',
  },
  ficha_itens_provos: [
    { insumo: 'A063020', descricao: 'PRE MASSA COOKIE TRADICIONAL', quantidade: 0.25, unidade: 'PA', perda_pct: 0, tipo: '03' },
    { insumo: 'A073067', descricao: 'MARGARINA BMC AMELIA KG', quantidade: 1, unidade: 'KG', perda_pct: 0, tipo: '99' },
    { insumo: 'A073041', descricao: 'ESSENCIA DE BAUNILHA', quantidade: 0.05, unidade: 'L', perda_pct: 0, tipo: '99' },
    { insumo: 'M043027', descricao: 'CAIXA PADRAO MULTIUSO FABRICA 26X20X20 CM', quantidade: 1, unidade: 'UN', perda_pct: 0, tipo: '99' },
  ],
  locais: [
    { local_id: '9300980125', descricao: 'Local de Estoque Padrão', padrao: true, inativo: false },
  ],
}

// C1 — CA-D1: produto piloto real com unidade oficial CX preservada.
test('C1: M011001 concilia com unidade oficial CX preservada (nunca UN por padrão)', () => {
  const r = conciliarProduto({
    ...AMOSTRA.produto,
    ficha: { itens: AMOSTRA.ficha_itens_provos },
    locais: AMOSTRA.locais,
  })
  assert.equal(r.unidade_oficial, 'CX')
  assert.equal(r.codigo, 'M011001')
  assert.equal(r.descricao, 'MISTURA P/COOKIE TRADICIONAL CX C/100 CONGELADO')
  assert.deepEqual(r.bloqueios, [])
})

// C2 — CA-D2: ficha real preservada verbatim (identidade/quantidade/unidade).
test('C2: componentes da ficha preservados verbatim (sem conversão nem reordenação)', () => {
  const r = conciliarProduto({
    ...AMOSTRA.produto,
    ficha: { itens: AMOSTRA.ficha_itens_provos },
    locais: AMOSTRA.locais,
  })
  assert.equal(r.ficha.itens.length, 4)
  assert.deepEqual(r.ficha.itens[0], AMOSTRA.ficha_itens_provos[0])
  assert.deepEqual(r.ficha.itens[2], AMOSTRA.ficha_itens_provos[2])
})

// C3 — CA-D2: unidade null/'' nunca vira UN e bloqueia.
test('C3: unidade ausente é null + bloqueio (nunca UN)', () => {
  const a = conciliarProduto({
    ...AMOSTRA.produto,
    unidade: null,
    ficha: { itens: AMOSTRA.ficha_itens_provos },
    locais: AMOSTRA.locais,
  })
  assert.equal(a.unidade_oficial, null)
  assert.ok(a.bloqueios.includes('unidade_ausente'))
  const b = conciliarProduto({
    ...AMOSTRA.produto,
    unidade: '',
    ficha: { itens: AMOSTRA.ficha_itens_provos },
    locais: AMOSTRA.locais,
  })
  assert.equal(b.unidade_oficial, null)
  assert.ok(b.bloqueios.includes('unidade_ausente'))
})

// C4 — CA-D2: ficha ausente é null + bloqueio (nada inventado).
test('C4: ficha ausente é null + bloqueio ficha_ausente', () => {
  const r = conciliarProduto({ ...AMOSTRA.produto, ficha: null, locais: AMOSTRA.locais })
  assert.equal(r.ficha, null)
  assert.ok(r.bloqueios.includes('ficha_ausente'))
})

// C5 — CA-C3/D2: linha legada 'UN' (defaultUN da F1) vs oficial 'CX' → incompatível, saldo preservado.
test('C5: linha de estoque legada UN vs oficial CX é incompatível e o saldo NÃO é convertido', () => {
  const r = conciliarLinhaEstoque(
    { produto_id: '9337428906', local_id: '9300980125', unidade: 'UN', saldo: 7 },
    'CX',
  )
  assert.equal(r.unidade_registrada, 'UN')
  assert.equal(r.unidade_oficial, 'CX')
  assert.equal(r.unidade_incompativel, true)
  assert.equal(r.saldo, 7)
})

// C6 — linha sem unidade herda a oficial do cadastro (join), sem flag.
test('C6: linha sem unidade recebe a oficial do cadastro (join), sem incompatibilidade', () => {
  const r = conciliarLinhaEstoque(
    { produto_id: '9337428906', local_id: '9300980125', unidade: '', saldo: 3 },
    'CX',
  )
  assert.equal(r.unidade_oficial, 'CX')
  assert.equal(r.unidade_incompativel, false)
})

// C7 — cadastro sem unidade: a linha NUNCA recebe UN por padrão.
test('C7: oficial null mantém a linha sem unidade oficial (nunca UN por padrão)', () => {
  const r = conciliarLinhaEstoque({ produto_id: 'X', local_id: 'L', unidade: 'UN', saldo: 1 }, null)
  assert.equal(r.unidade_oficial, null)
  assert.equal(r.saldo, 1)
})

// C8 — CA-D3: mapa de campos dos contratos de leitura provados na conta.
test('C8: mapa de fontes documenta produto, listagem, ficha (malha) e locais', () => {
  assert.equal(MAPA_FONTES.produto.call, 'ConsultarProduto')
  assert.equal(MAPA_FONTES.produto.endpoint, 'https://app.omie.com.br/api/v1/geral/produtos/')
  assert.equal(MAPA_FONTES.produtos_listagem.chave_resposta, 'produto_servico_resumido')
  assert.equal(MAPA_FONTES.produtos_listagem.estado_conta, 'listagem_vazia')
  assert.equal(MAPA_FONTES.ficha.call, 'ConsultarEstrutura')
  assert.equal(MAPA_FONTES.ficha.endpoint, 'https://app.omie.com.br/api/v1/geral/malha/')
  assert.equal(MAPA_FONTES.locais.call, 'ListarLocaisEstoque')
  assert.equal(MAPA_FONTES.locais.endpoint, 'https://app.omie.com.br/api/v1/estoque/local/')
})

// C9 — unidades de estoque divergentes na entrada sobem o bloqueio de incompatibilidade.
test('C9: unidades de estoque divergentes geram bloqueio unidade_incompativel_estoque', () => {
  const r = conciliarProduto({
    ...AMOSTRA.produto,
    ficha: { itens: AMOSTRA.ficha_itens_provos },
    locais: AMOSTRA.locais,
    unidades_estoque: ['UN', 'CX'],
  })
  assert.ok(r.bloqueios.includes('unidade_incompativel_estoque'))
  assert.deepEqual(r.unidades_estoque_incompativeis, ['UN'])
})

// C10 — replay determinístico.
test('C10: conciliação é determinística (replay igual)', () => {
  const e = {
    ...AMOSTRA.produto,
    ficha: { itens: AMOSTRA.ficha_itens_provos },
    locais: AMOSTRA.locais,
    unidades_estoque: ['UN'],
  }
  assert.deepEqual(conciliarProduto(e), conciliarProduto(e))
})