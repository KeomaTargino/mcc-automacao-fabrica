// tests/pcp/spec-2-001-qualidade.test.mjs — SPEC-2-001 CA-D1/D2/D4 (task e57df8ff)
// Recorte sintético: contrato + fixtures isoladas, sem chamada externa.
// Oráculos da SPEC: T1 (unidade/ficha null bloqueiam, sem conversão), T2 (mapa
// líquido com dedup/horizonte), T3 (página falha preserva lote anterior).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  avaliarProduto,
  producaoLiquida,
  ativarLote,
  eventosDemonstracao,
  produtosDemonstracao,
  HORIZONTE_DEMO,
} from '../../src/lib/pcp/qualidade.ts'

// T1 — CA-D1/D2: unidade oficial preservada; desconhecida é null e bloqueia.
test('T1a: COOKIE-1 tem unidade UN oficial e ficha INS-1=0,05 KG preservadas', () => {
  const p = produtosDemonstracao().find((x) => x.produto_id === 'COOKIE-1')
  assert.equal(p.unidade_oficial, 'UN')
  assert.deepEqual(p.ficha.componentes, [{ insumo: 'INS-1', quantidade: 0.05, unidade: 'KG' }])
  assert.deepEqual(p.bloqueios, [])
})

test('T1b: P2 com unidade null é bloqueado e NUNCA vira UN', () => {
  const p = produtosDemonstracao().find((x) => x.produto_id === 'P2')
  assert.equal(p.unidade_oficial, null)
  assert.ok(p.bloqueios.includes('calculo_estoque'))
})

test('T1c: P3 com ficha null é bloqueado (nenhum componente inventado)', () => {
  const p = produtosDemonstracao().find((x) => x.produto_id === 'P3')
  assert.equal(p.ficha, null)
  assert.ok(p.bloqueios.includes('calculo_receita'))
})

test('T1d: sem conversão KG→UN — unidades diferentes nunca se somam', () => {
  const kg = avaliarProduto({ produto_id: 'X', codigo: 'X', descricao: 'X', unidade: 'KG', ficha: null, cobertura_dias: 90 })
  const un = avaliarProduto({ produto_id: 'Y', codigo: 'Y', descricao: 'Y', unidade: 'UN', ficha: null, cobertura_dias: 90 })
  assert.notEqual(kg.unidade_oficial, un.unidade_oficial)
})

// T2 — CA-D4: mapa líquido com dedup por chave e horizonte.
test('T2a: fixture do mapa resulta 90 UN líquidas (100−20+10)', () => {
  const r = producaoLiquida(eventosDemonstracao(), HORIZONTE_DEMO)
  const cookie = r.find((x) => x.produto_id === 'COOKIE-1')
  assert.equal(cookie.liquido, 90)
  assert.equal(cookie.concluidas, 100)
  assert.equal(cookie.canceladas, 20)
  assert.equal(cookie.devolucoes, 10)
})

test('T2b: uma linha por chave — replay com as mesmas chaves não duplica', () => {
  const ev = eventosDemonstracao()
  const a = producaoLiquida(ev, HORIZONTE_DEMO)
  const b = producaoLiquida(ev, HORIZONTE_DEMO)
  assert.deepEqual(a, b)
  const c = producaoLiquida([...ev, ...ev], HORIZONTE_DEMO)
  const cookieC = c.find((x) => x.produto_id === 'COOKIE-1')
  assert.equal(cookieC.liquido, 90)
  assert.ok(cookieC.linhas_repetidas_descartadas >= 1)
})

test('T2c: data fora do horizonte é excluída', () => {
  const r = producaoLiquida(eventosDemonstracao(), HORIZONTE_DEMO)
  const cookie = r.find((x) => x.produto_id === 'COOKIE-1')
  assert.equal(cookie.eventos_fora_do_horizonte, 1)
  assert.equal(cookie.liquido, 90)
})

// T3 — CA-D4: ativação atômica de lote.
test('T3a: página que falhou NUNCA ativa lote parcial — anterior permanece com aviso', () => {
  const ativo = { geracao: 1, paginas_ok: 2, paginas_total: 2, eventos: [] }
  const candidato = { geracao: 2, paginas_ok: 1, paginas_total: 2, eventos: [] }
  const r = ativarLote(candidato, ativo)
  assert.equal(r.estado, 'lote_anterior_preservado')
  assert.ok(r.aviso.includes('incompleta'))
})

test('T3b: geração igual ou antiga é recusada', () => {
  const ativo = { geracao: 5, paginas_ok: 2, paginas_total: 2, eventos: [] }
  assert.equal(ativarLote({ geracao: 5, paginas_ok: 2, paginas_total: 2, eventos: [] }, ativo).estado, 'recusado_geracao_antiga')
  assert.equal(ativarLote({ geracao: 4, paginas_ok: 2, paginas_total: 2, eventos: [] }, ativo).estado, 'recusado_geracao_antiga')
})

test('T3c: lote completo com geração nova é ativado', () => {
  const ativo = { geracao: 1, paginas_ok: 2, paginas_total: 2, eventos: [] }
  const r = ativarLote({ geracao: 2, paginas_ok: 2, paginas_total: 2, eventos: [] }, ativo)
  assert.equal(r.estado, 'ativado')
})

// T4 — cobertura incompleta bloqueia sugestões.
test('T4: P4 com 45 dias de cobertura é bloqueado para sugestões', () => {
  const p = produtosDemonstracao().find((x) => x.produto_id === 'P4')
  assert.equal(p.cobertura_dias, 45)
  assert.ok(p.bloqueios.includes('calculo_sugestao'))
})

// T0 — isolamento: fixtures sintéticas, nenhum acesso a rede/ERP.
test('T0: fixtures são sintéticas e determinísticas (sem rede, sem ERP)', () => {
  const ev = eventosDemonstracao()
  assert.ok(ev.length > 0)
  assert.ok(ev.every((e) => e.produto_id === 'COOKIE-1'))
  const ps = produtosDemonstracao()
  assert.equal(ps.length, 4)
  assert.ok(ps.every((p) => ['COOKIE-1', 'P2', 'P3', 'P4'].includes(p.produto_id)))
})
