import { test } from 'node:test'
import assert from 'node:assert/strict'

// SPEC-1-003 — CA-N1/N2: pedidos pendentes da Nuvemshop (TDD da SPEC).
// Integração env-gated contra o backend de homologação; credenciais via variáveis de
// ambiente, NUNCA em código/relatório. Sem variáveis, a suíte é PULADA (não falha o QA).

const URL_BASE = process.env.PCP_TEST_URL || ''
const SENHA = process.env.PCP_TEST_PASSWORD || ''
const EMAIL_SYNC = process.env.PCP_TEST_SYNC_EMAIL || 'usuario-teste-pcp@pcp.local'
const EMAIL_LEITOR = process.env.PCP_TEST_LEITOR_EMAIL || 'usuario-teste-compras@pcp.local'
const temCredenciais = Boolean(URL_BASE && SENHA && EMAIL_SYNC && EMAIL_LEITOR)

async function login(email) {
  const res = await fetch(`${URL_BASE}/api/collections/users/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: email, password: SENHA }),
  })
  const json = await res.json()
  assert.equal(res.status, 200, `login de ${email} deve funcionar`)
  return json.token
}

test.skipIf(!temCredenciais)('CA-N1/N2: sync nuvemshop lê páginas reais (200/página) e ativa lote', async () => {
  const token = await login(EMAIL_SYNC)
  const h = { Authorization: token, 'Content-Type': 'application/json' }
  const ini = await (await fetch(`${URL_BASE}/backend/v1/pcp/sync/iniciar`, {
    method: 'POST', headers: h, body: JSON.stringify({ fonte: 'nuvemshop', recurso: 'pedidos' }),
  })).json()
  assert.ok(ini.execucao_id)
  const p1 = await (await fetch(`${URL_BASE}/backend/v1/pcp/sync/pagina`, {
    method: 'POST', headers: h, body: JSON.stringify({ execucao_id: ini.execucao_id }),
  })).json()
  assert.equal(p1.ok, true)
  assert.equal(p1.itens, 200, 'página real tem 200 pedidos (per_page máximo)')
})

test.skipIf(!temCredenciais)('CA-N1/N2: visão classifica na precedência da SPEC (sem suposição)', async () => {
  const token = await login(EMAIL_SYNC)
  const h = { Authorization: token }
  const visao = await (await fetch(`${URL_BASE}/backend/v1/pcp/pedidos/visao`, { headers: h })).json()
  assert.equal(visao.disponivel, true)
  assert.ok(visao.total_pedidos > 0, 'lote real ativo')
  const c = visao.contagem
  for (const k of ['pendente_pagamento', 'pago_sem_vinculo', 'cancelado', 'status_nao_mapeado', 'vinculado_omie', 'conflito']) {
    assert.ok(k in c, 'estado previsto pela SPEC presente: ' + k)
  }
  assert.ok(c.pendente_pagamento > 0, 'intenção pendente separada (CA-N1)')
  assert.ok(c.cancelado >= 0 && c.pago_sem_vinculo >= 0)
  assert.ok(visao.aviso, 'aviso de total não consolidável presente')
})

test.skipIf(!temCredenciais)('autorização: leitor sem a área pedidos é negado na visão', async () => {
  const token = await login(EMAIL_LEITOR)
  const res = await fetch(`${URL_BASE}/backend/v1/pcp/pedidos/visao`, {
    headers: { Authorization: token },
  })
  assert.ok(res.status >= 400, 'área não autorizada não vê pedidos')
})
