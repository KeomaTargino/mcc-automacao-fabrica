// tests/pcp/spec-2-005-recuperacao.test.mjs — SPEC-2-005 CA-O2/O3/O4 (task 4e9a1d0e)
// Provas de revogação, reinício, congelamento e admin sobre a fila MOCK (zero POST real).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { prepararTransacao, autorizarPayload, enviarComAquisicao } from '../../src/lib/pcp/fila-omie.ts'
import { enviarComGuardaAcao, retomarAposReinicio, tentarRetificarDurante, negarCrudDireto } from '../../src/lib/pcp/recuperacao-omie.ts'
import { OP_FILA_DEMO, PAYLOAD_DEMO } from '../../src/lib/pcp/fila-omie.ts'

const agora = new Date('2026-10-16T13:00:00Z')

function transacaoAutorizada(id) {
  const p = prepararTransacao({ transacao_id: id, op_id: OP_FILA_DEMO.op_id, revisao_consolidacao: 1, operacao: 'concluir_op', codigo_integracao: OP_FILA_DEMO.codigo_integracao, quantidade: 100 })
  return autorizarPayload(p.transacao, { payload_hash: JSON.stringify(PAYLOAD_DEMO), aprovador: 'pcp' }, PAYLOAD_DEMO)
}

// O2 — aprovar 100, revogar executar_sync_omie antes da aquisição/envio → 403 e zero POST.
test('O2: revogação antes do envio → negado 403, zero POST mutante', () => {
  const a = transacaoAutorizada('TR-R1')
  const chamadas = []
  const r = enviarComGuardaAcao(a, { acoes: [], usuario: 'keoma.targino' }, PAYLOAD_DEMO, { enviar: (x) => { chamadas.push(x); return { respostaChegou: true, efeitoAplicado: true } } }, agora, 60000, true)
  assert.equal(r.estado, 'negado')
  assert.ok(r.motivo.includes('403'))
  assert.equal(chamadas.length, 0)
  assert.equal(a.posts_mutantes, 0)
})

test('O2: com a ação vigente o envio segue normal (controle positivo)', () => {
  const a = transacaoAutorizada('TR-R1b')
  const r = enviarComGuardaAcao(a, { acoes: ['executar_sync_omie'], usuario: 'keoma.targino' }, PAYLOAD_DEMO, { enviar: () => ({ respostaChegou: true, efeitoAplicado: true }) }, agora, 60000, true)
  assert.equal(r.estado, 'confirmada')
})

// O4 — reinício: tentativa 'enviando' sem resposta → consulta → confirmada, POST total 1.
test('O4: queda antes de gravar resposta; reinício consulta e confirma com POST total 1', () => {
  const a = transacaoAutorizada('TR-R2')
  let posts = 0
  const r = enviarComAquisicao(a, PAYLOAD_DEMO, { enviar: () => { posts++; return { respostaChegou: false, efeitoAplicado: true } } }, agora, 60000, true)
  assert.equal(r.estado, 'resultado_incerto')
  assert.equal(posts, 1)
  // reinício: nenhum POST novo; consulta encontra concluída 100
  const rec = retomarAposReinicio(r.transacao, { encontrou: true, quantidade: 100 })
  assert.equal(rec.estado, 'confirmada')
  assert.equal(rec.novoPostAutorizado, false)
  assert.equal(rec.postsTotais, 1)
  assert.equal(rec.transacao.posts_mutantes, 1)
})

test('O4: reinício com consulta inconclusiva mantém incerto e NUNCA libera POST', () => {
  const a = transacaoAutorizada('TR-R2b')
  const r = enviarComAquisicao(a, PAYLOAD_DEMO, { enviar: () => ({ respostaChegou: false, efeitoAplicado: true }) }, agora, 60000, true)
  const rec = retomarAposReinicio(r.transacao, { encontrou: false, quantidade: null })
  assert.equal(rec.estado, 'resultado_incerto')
  assert.equal(rec.novoPostAutorizado, false)
  assert.equal(rec.postsTotais, 1)
})

// O3 — barreira entre aquisição e POST: retificação 99 concorrente → 409; hash 100 permanece.
test('O3: retificação durante enviando → 409 e hash 100 permanece', () => {
  const a = transacaoAutorizada('TR-R3')
  const enviando = { ...a, estado: 'enviando', lease_ate: new Date(agora.getTime() + 60000).toISOString(), posts_mutantes: a.posts_mutantes + 1 }
  const r = tentarRetificarDurante(enviando, { ...PAYLOAD_DEMO, quantidade: 99 }, JSON.stringify(PAYLOAD_DEMO))
  assert.equal(r.estado, 'negado_409')
  assert.ok(r.motivo.includes('409'))
  assert.equal(enviando.quantidade, 100)
})

test('O3: retificação durante resultado_incerto → 409 (timeout mantém congelamento)', () => {
  const a = transacaoAutorizada('TR-R3b')
  const incerto = { ...a, estado: 'resultado_incerto' }
  const r = tentarRetificarDurante(incerto, { ...PAYLOAD_DEMO, quantidade: 99 }, JSON.stringify(PAYLOAD_DEMO))
  assert.equal(r.estado, 'negado_409')
})

// O3 — retificação ANTES da aquisição → hash inválido e zero POST 100.
test('O3: retificação antes da aquisição com payload divergente → aprovação invalidada, zero POST', () => {
  const a = transacaoAutorizada('TR-R4')
  const chamadas = []
  const r = tentarRetificarDurante(a, { ...PAYLOAD_DEMO, quantidade: 99 }, JSON.stringify(PAYLOAD_DEMO))
  assert.equal(r.estado, 'invalidada')
  assert.ok(r.motivo.includes('zero POST'))
  // prova de zero POST: tentativa de envio com payload alterado é bloqueada pelo hash
  const envio = enviarComAquisicao(a, { ...PAYLOAD_DEMO, quantidade: 99 }, { enviar: (x) => { chamadas.push(x); return { respostaChegou: true, efeitoAplicado: true } } }, agora, 60000, true)
  assert.equal(envio.estado, 'negado')
  assert.equal(chamadas.length, 0)
})

// Transversal — perfil administrativo funcional não edita/exclui tentativas/hashes.
test('Admin funcional: PATCH/DELETE direto em transação/hashes → 403', () => {
  const r1 = negarCrudDireto('PATCH', 'pcp_transacoes_omie')
  assert.equal(r1.estado, 'negado_403')
  assert.ok(r1.motivo.includes('403'))
  const r2 = negarCrudDireto('DELETE', 'hash aprovado')
  assert.equal(r2.estado, 'negado_403')
  assert.ok(r2.motivo.includes('auditoria'))
})