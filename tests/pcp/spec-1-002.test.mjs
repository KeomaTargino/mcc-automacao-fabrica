import { test } from 'node:test'
import assert from 'node:assert/strict'

// SPEC-1-002 — CA-O1/O2: sincronização rastreável (TDD da SPEC).
// Integração contra o backend de homologação; credenciais via variáveis de ambiente,
// NUNCA em código/relatório. Sem as variáveis, a suíte é PULADA (não falha o QA nativo).
//
// Design da SPEC: sync/pagina recebe APENAS execucao_id — fonte/recurso/cursor são
// carregados do registro no servidor; o navegador nunca envia itens nem página.

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

test.skipIf(!temCredenciais)('CA-O2: 3 etapas (pág 1, pág 2, fim) ativam UM lote com 4 linhas e fonte/horário', async () => {
  const token = await login(EMAIL_SYNC)
  const h = { Authorization: token, 'Content-Type': 'application/json' }
  const ini = await (await fetch(`${URL_BASE}/backend/v1/pcp/sync/iniciar`, {
    method: 'POST', headers: h, body: JSON.stringify({ recurso: 'estoque' }),
  })).json()
  assert.ok(ini.execucao_id, 'execução criada')
  assert.equal(ini.em_andamento, false)
  const p1 = await (await fetch(`${URL_BASE}/backend/v1/pcp/sync/pagina`, {
    method: 'POST', headers: h, body: JSON.stringify({ execucao_id: ini.execucao_id }),
  })).json()
  assert.equal(p1.ok, true)
  assert.equal(p1.itens, 2, 'página 1 traz 2 itens (mock de homologação identificado)')
  const p2 = await (await fetch(`${URL_BASE}/backend/v1/pcp/sync/pagina`, {
    method: 'POST', headers: h, body: JSON.stringify({ execucao_id: ini.execucao_id }),
  })).json()
  assert.equal(p2.ok, true)
  assert.equal(p2.itens, 2, 'página 2 traz 2 itens (P1/local 2 e saldo negativo)')
  const p3 = await (await fetch(`${URL_BASE}/backend/v1/pcp/sync/pagina`, {
    method: 'POST', headers: h, body: JSON.stringify({ execucao_id: ini.execucao_id }),
  })).json()
  assert.equal(p3.lote_ativado, true, 'fim da fonte ativa o lote')
  const estado = await (await fetch(`${URL_BASE}/backend/v1/pcp/sync/estado`, { headers: h })).json()
  assert.equal(estado.pode_atualizar_fontes, true)
  const fonte = (estado.fontes || []).find((f) => f.recurso === 'estoque')
  assert.ok(fonte, 'fonte estoque visível para a área')
  assert.equal(fonte.total_itens, 4, 'lote único com 4 linhas (P1/A e P1/B são duas)')
  assert.equal(fonte.estado_tecnico, 'ok')
  assert.ok(fonte.ultimo_sucesso, 'ultimo_sucesso registrado (origem/horário)')
  assert.ok(fonte.lote_ativo)
})

test.skipIf(!temCredenciais)('CA-O4: repetir a execução completa não duplica — total segue 4', async () => {
  const token = await login(EMAIL_SYNC)
  const h = { Authorization: token, 'Content-Type': 'application/json' }
  const ini = await (await fetch(`${URL_BASE}/backend/v1/pcp/sync/iniciar`, {
    method: 'POST', headers: h, body: JSON.stringify({ recurso: 'estoque' }),
  })).json()
  for (let i = 0; i < 3; i++) {
    await fetch(`${URL_BASE}/backend/v1/pcp/sync/pagina`, {
      method: 'POST', headers: h, body: JSON.stringify({ execucao_id: ini.execucao_id }),
    })
  }
  const estado = await (await fetch(`${URL_BASE}/backend/v1/pcp/sync/estado`, { headers: h })).json()
  const fonte = (estado.fontes || []).find((f) => f.recurso === 'estoque')
  assert.equal(fonte.total_itens, 4, 'replay não duplica linhas (upsert por chave de origem)')
})

test.skipIf(!temCredenciais)('CA-O4: execução concluída retorna ja_concluida sem nova leitura', async () => {
  const token = await login(EMAIL_SYNC)
  const h = { Authorization: token, 'Content-Type': 'application/json' }
  const ini = await (await fetch(`${URL_BASE}/backend/v1/pcp/sync/iniciar`, {
    method: 'POST', headers: h, body: JSON.stringify({ recurso: 'estoque' }),
  })).json()
  for (let i = 0; i < 3; i++) {
    await fetch(`${URL_BASE}/backend/v1/pcp/sync/pagina`, {
      method: 'POST', headers: h, body: JSON.stringify({ execucao_id: ini.execucao_id }),
    })
  }
  const deNovo = await (await fetch(`${URL_BASE}/backend/v1/pcp/sync/pagina`, {
    method: 'POST', headers: h, body: JSON.stringify({ execucao_id: ini.execucao_id }),
  })).json()
  assert.equal(deNovo.ja_concluida, true, 'execução terminal não relê')
})

test.skipIf(!temCredenciais)('lease: segunda iniciar durante execução ativa devolve a mesma execução', async () => {
  const token = await login(EMAIL_SYNC)
  const h = { Authorization: token, 'Content-Type': 'application/json' }
  const a = await (await fetch(`${URL_BASE}/backend/v1/pcp/sync/iniciar`, {
    method: 'POST', headers: h, body: JSON.stringify({ recurso: 'estoque' }),
  })).json()
  const b = await (await fetch(`${URL_BASE}/backend/v1/pcp/sync/iniciar`, {
    method: 'POST', headers: h, body: JSON.stringify({ recurso: 'estoque' }),
  })).json()
  assert.equal(b.execucao_id, a.execucao_id, 'lease vigente devolve execução existente')
  assert.equal(b.em_andamento, true)
  // limpa: conclui a execução aberta
  for (let i = 0; i < 3; i++) {
    await fetch(`${URL_BASE}/backend/v1/pcp/sync/pagina`, {
      method: 'POST', headers: h, body: JSON.stringify({ execucao_id: a.execucao_id }),
    })
  }
})

test.skipIf(!temCredenciais)('autorização: leitor sem pode_atualizar_fontes é negado no sync', async () => {
  const token = await login(EMAIL_LEITOR)
  const res = await fetch(`${URL_BASE}/backend/v1/pcp/sync/iniciar`, {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ recurso: 'estoque' }),
  })
  assert.ok(res.status >= 400, 'leitor não pode iniciar sincronização')
  const estado = await (await fetch(`${URL_BASE}/backend/v1/pcp/sync/estado`, {
    headers: { Authorization: token },
  })).json()
  assert.deepEqual(estado.fontes, [], 'diagnóstico só da área permitida (Compras não vê estoque)')
})

test.skipIf(!temCredenciais)('allowlist: recurso desconhecido e execução inexistente são recusados', async () => {
  const token = await login(EMAIL_SYNC)
  const r1 = await fetch(`${URL_BASE}/backend/v1/pcp/sync/iniciar`, {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ recurso: 'financeiro' }),
  })
  assert.ok(r1.status >= 400, 'recurso fora da allowlist não inicia')
  const r2 = await fetch(`${URL_BASE}/backend/v1/pcp/sync/pagina`, {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ execucao_id: 'zzz000zzz000zzz' }),
  })
  assert.ok(r2.status >= 400, 'execução inexistente não altera nada')
})
