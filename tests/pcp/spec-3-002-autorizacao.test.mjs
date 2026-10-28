// tests/pcp/spec-3-002-autorizacao.test.mjs — SPEC-3-002 CA-3-07 (P3.02-02, P3.02-05 parte do conteúdo alterado)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  autorizarOrdem,
  conferirDepoisDoEnvio,
  desautorizarOrdem,
  resumoParaDono,
} from '../../src/lib/pcp/autorizacao-op.ts'
import { criarSimuladorOmie, enviarOp, hashDoPayload, montarPayloadConcluir } from '../../src/lib/pcp/envio-op.ts'
import { prepararTransacao } from '../../src/lib/pcp/fila-omie.ts'

const AGORA = new Date('2026-10-28T15:00:00Z')
const DONO = { acoes: ['autorizar_escrita_omie'], usuario: 'dono' }
const DESLIGADA = { ligada: false, escopo: null }

function preparada(id = 'T1', q = 100) {
  const m = montarPayloadConcluir({ nCodOP: '9858633368', cCodIntOP: 'AG-OP-1', dataConclusao: '2026-10-28', quantidade: q })
  const p = prepararTransacao({ transacao_id: id, op_id: 'OP-1', revisao_consolidacao: 1, operacao: 'concluir_op', codigo_integracao: 'AG-OP-1', quantidade: q })
  return { payload: m.payload, hash: m.hash, t: p.transacao }
}

test('P3.02-02: só quem tem a ação do dono autoriza; chave segue desligada', () => {
  const { payload, hash, t } = preparada()
  const r = autorizarOrdem({ transacao: t, payload, hashVisto: hash, chaveAtual: DESLIGADA, conta: { acoes: ['executar_sync_omie'], usuario: 'pcp' }, agora: AGORA })
  assert.equal(r.http, 403)
})

test('o dono vê o resumo e autoriza: transação autorizada, chave ligada só para ela', () => {
  const { payload, hash, t } = preparada()
  const resumo = resumoParaDono(t, payload, { produto: 'MISTURA P/COOKIE (M011001)', local: 'câmara 1', unidade: 'CX' })
  assert.equal(resumo.quantidade, 100)
  assert.equal(resumo.data, '28/10/2026')
  assert.equal(resumo.hash, hash)
  assert.match(resumo.efeito_no_estoque, /entrada de 100 CX/)
  const r = autorizarOrdem({ transacao: t, payload, hashVisto: resumo.hash, chaveAtual: DESLIGADA, conta: DONO, agora: AGORA })
  assert.equal(r.http, 200)
  assert.equal(r.transacao.estado, 'autorizada')
  assert.deepEqual(r.chave, { ligada: true, escopo: 'T1' })
  assert.equal(r.autorizadaPor, 'dono')
})

test('resumo com dado faltando mostra "não informado", nunca inventa', () => {
  const { payload, t } = preparada()
  const r = resumoParaDono(t, payload, { produto: null, local: null, unidade: null })
  assert.equal(r.produto, 'produto não informado')
  assert.equal(r.local, 'local não informado')
  assert.equal(r.unidade, 'unidade desconhecida')
})

test('uma ordem por vez: com outra ordem autorizada, a segunda é negada', () => {
  const a = preparada('T1')
  const b = preparada('T2')
  const r = autorizarOrdem({ transacao: b.t, payload: b.payload, hashVisto: b.hash, chaveAtual: { ligada: true, escopo: 'T1' }, conta: DONO, agora: AGORA })
  assert.equal(r.http, 409)
  assert.equal(r.erro, 'outra_ordem_autorizada')
  assert.ok(a)
})

test('conteúdo alterado depois que o dono conferiu: 422 e nada autorizado', () => {
  const { payload, hash, t } = preparada()
  const alterado = { ...payload, nQtdeProduzida: 99 }
  const r = autorizarOrdem({ transacao: t, payload: alterado, hashVisto: hash, chaveAtual: DESLIGADA, conta: DONO, agora: AGORA })
  assert.equal(r.http, 422)
})

test('só preparada pode ser autorizada (não autoriza duas vezes nem depois de enviada)', () => {
  const { payload, hash, t } = preparada()
  const ok = autorizarOrdem({ transacao: t, payload, hashVisto: hash, chaveAtual: DESLIGADA, conta: DONO, agora: AGORA })
  const de_novo = autorizarOrdem({ transacao: ok.transacao, payload, hashVisto: hash, chaveAtual: ok.chave, conta: DONO, agora: AGORA })
  assert.equal(de_novo.http, 409)
})

test('o dono desfaz a autorização antes do envio: volta a preparada e a chave desliga; depois de enviada não', () => {
  const { payload, hash, t } = preparada()
  const ok = autorizarOrdem({ transacao: t, payload, hashVisto: hash, chaveAtual: DESLIGADA, conta: DONO, agora: AGORA })
  const d = desautorizarOrdem({ transacao: ok.transacao, chaveAtual: ok.chave, conta: DONO })
  assert.equal(d.http, 200)
  assert.equal(d.transacao.estado, 'preparada')
  assert.deepEqual(d.chave, { ligada: false, escopo: null })
  assert.equal(desautorizarOrdem({ transacao: ok.transacao, chaveAtual: ok.chave, conta: { acoes: [] } }).http, 403)
  assert.equal(desautorizarOrdem({ transacao: { ...ok.transacao, estado: 'confirmada' }, chaveAtual: DESLIGADA, conta: DONO }).http, 409)
})

test('fluxo completo no simulador: autoriza, envia uma vez, confere "gravado e conferido"', () => {
  const { payload, hash, t } = preparada()
  const aut = autorizarOrdem({ transacao: t, payload, hashVisto: hash, chaveAtual: DESLIGADA, conta: DONO, agora: AGORA })
  const sim = criarSimuladorOmie('normal')
  const env = enviarOp({ transacao: aut.transacao, chave: aut.chave, conta: { acoes: ['executar_sync_omie'] }, payload, adapter: sim.adapter, agora: AGORA, leaseMs: 60000, temLease: true })
  assert.equal(env.estado, 'confirmada')
  const leitura = sim.consultar('AG-OP-1')
  const c = conferirDepoisDoEnvio(env.transacao, leitura, { antes: 50, depois: 150 })
  assert.equal(c.resultado, 'gravado_e_conferido')
  assert.equal(c.novaGravacaoAutorizada, false)
  assert.equal(sim.gravacoes(), 1)
  assert.equal(hashDoPayload(payload), hash)
})

test('conferência: quantidade diferente, status não concluído e estoque diferente são divergência', () => {
  const { t } = preparada()
  const base = { ...t, estado: 'confirmada' }
  assert.equal(conferirDepoisDoEnvio(base, { encontrou: true, quantidade: 90, concluida: true }, { antes: 0, depois: 100 }).resultado, 'divergente')
  assert.equal(conferirDepoisDoEnvio(base, { encontrou: true, quantidade: 100, concluida: false }, { antes: 0, depois: 100 }).resultado, 'divergente')
  assert.equal(conferirDepoisDoEnvio(base, { encontrou: true, quantidade: 100, concluida: true }, { antes: 0, depois: 80 }).resultado, 'divergente')
  assert.equal(conferirDepoisDoEnvio(base, { encontrou: true, quantidade: 100, concluida: null }, null).resultado, 'divergente')
})

test('conferência sem posição anterior de estoque não diz "conferido"; ordem ausente é inconclusivo', () => {
  const { t } = preparada()
  const base = { ...t, estado: 'confirmada' }
  const sem = conferirDepoisDoEnvio(base, { encontrou: true, quantidade: 100, concluida: true }, { antes: null, depois: 100 })
  assert.equal(sem.resultado, 'conferido_sem_estoque')
  assert.ok(sem.detalhes.some((d) => d.includes('Estoque não comparado')))
  const ausente = conferirDepoisDoEnvio(base, { encontrou: false, quantidade: null, concluida: null }, null)
  assert.equal(ausente.resultado, 'inconclusivo')
  assert.equal(ausente.novaGravacaoAutorizada, false)
})
