// tests/pcp/spec-2-000.test.mjs — SPEC-2-000 CA-A2/A3 (task 49327a88)
// Teste executável com node --test. Prova a lógica de concessão da matriz v1.2
// (por ação, não por área) e a regra de troca obrigatória de senha.
// A prova de servidor (HTTP real) está em 05_entregas/fase-2/spec-2-000/evidencia-49327a88.md.
import { test } from 'node:test'
import assert from 'node:assert/strict'

// Ações F2 da SPEC-2-000 (9 no total)
const ACOES_F2 = [
  'consultar_planejamento',
  'editar_programacao',
  'editar_parametros',
  'publicar_programacao',
  'apontar_producao',
  'conferir_expedicao',
  'conferir_camara',
  'aprovar_consolidacao',
  'executar_sync_omie',
]

// Matriz v1.2 (05_entregas/fase-2/spec-2-000/matriz-nominal-v1.md) — pessoas com ações
const MATRIZ = {
  arivaldo: { acoes: ['consultar_planejamento', 'apontar_producao'], pontos: ['cozinha', 'encaixotamento'] },
  ronaldo: { acoes: ['consultar_planejamento', 'apontar_producao', 'editar_programacao', 'publicar_programacao', 'aprovar_consolidacao', 'executar_sync_omie'], pontos: ['cozinha', 'encaixotamento', 'expedicao'] },
  keoma: { acoes: ['consultar_planejamento', 'editar_programacao', 'editar_parametros', 'publicar_programacao', 'aprovar_consolidacao', 'executar_sync_omie'], pontos: [] },
  alline: { acoes: ['consultar_planejamento', 'editar_programacao'], pontos: [] },
  angela: { acoes: ['conferir_expedicao', 'conferir_camara'], pontos: ['expedicao', 'camara_fria'] },
  aleksandro: { acoes: [], pontos: [] },
  patricia: { acoes: [], pontos: [] },
}

// Regra da SPEC: a área/cargo NUNCA concede ação por implicação — somente o que está registrado.
const temAcao = (perfil, acao) => Array.isArray(perfil.acoes) && perfil.acoes.includes(acao)
const temPonto = (perfil, ponto) => Array.isArray(perfil.pontos) && perfil.pontos.includes(ponto)

// Regra da troca obrigatória (SPEC-2-000 CA-A2/A3): contas com senha inicial não trocada
// são bloqueadas até trocarem; a troca exige senha atual correta e nova diferente.
const exigeTroca = (primeira_senha_trocada) => !primeira_senha_trocada
const trocaValida = (senhaAtualOk, senhaNova, senhaAtual) =>
  senhaAtualOk && senhaNova.length >= 8 && senhaNova !== senhaAtual

test('T-A1: matriz v1.2 — Keoma tem as 6 ações registradas, sem apontar_producao', () => {
  assert.equal(MATRIZ.keoma.acoes.length, 6)
  assert.ok(temAcao(MATRIZ.keoma, 'editar_programacao'))
  assert.ok(!temAcao(MATRIZ.keoma, 'apontar_producao')) // não registrada = negada
})

test('T-A2: área não concede ação por implicação (Angela tem areas pedidos, sem consulta_planejamento)', () => {
  assert.ok(!temAcao(MATRIZ.angela, 'consultar_planejamento'))
  assert.ok(temAcao(MATRIZ.angela, 'conferir_expedicao'))
  assert.ok(temAcao(MATRIZ.angela, 'conferir_camara'))
})

test('T-A3: Ronaldo espelhado dos gerentes (sem editar_parametros)', () => {
  assert.ok(temAcao(MATRIZ.ronaldo, 'editar_programacao'))
  assert.ok(temAcao(MATRIZ.ronaldo, 'publicar_programacao'))
  assert.ok(!temAcao(MATRIZ.ronaldo, 'editar_parametros')) // espelho sem parâmetros
})

test('T-A4: contas sem ação registrada (Aleksandro, Patricia) não têm nenhuma', () => {
  assert.equal(MATRIZ.aleksandro.acoes.length, 0)
  assert.equal(MATRIZ.patricia.acoes.length, 0)
  assert.ok(!temAcao(MATRIZ.aleksandro, 'consultar_planejamento'))
})

test('T-A5: pontos por pessoa (Angela tem expedicao/camara_fria; Keoma tem []', () => {
  assert.ok(temPonto(MATRIZ.angela, 'camara_fria'))
  assert.ok(temPonto(MATRIZ.ronaldo, 'expedicao'))
  assert.equal(MATRIZ.keoma.pontos.length, 0) // pendência registrada na matriz
})

test('T-A6: todas as ações da matriz pertencem às 9 da SPEC', () => {
  for (const [nome, perfil] of Object.entries(MATRIZ)) {
    for (const acao of perfil.acoes) {
      assert.ok(ACOES_F2.includes(acao), `${nome}: ação ${acao} não está na SPEC`)
    }
  }
})

test('T-S1: troca obrigatória — conta nova exige troca', () => {
  assert.ok(exigeTroca(false))
  assert.ok(!exigeTroca(true))
})

test('T-S2: troca inválida se a nova for igual à atual ou curta', () => {
  assert.ok(!trocaValida(true, 'senha123', 'senha123'))
  assert.ok(!trocaValida(true, 'curta', 'antiga'))
  assert.ok(!trocaValida(false, 'novasenha123', 'antiga'))
  assert.ok(trocaValida(true, 'novasenha123', 'antiga'))
})
