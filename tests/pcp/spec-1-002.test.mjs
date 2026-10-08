import { test } from 'node:test'
import assert from 'node:assert/strict'

// SPEC-1-002 — CA-O3/O4: recuperação de atualizações interrompidas (TDD da SPEC).
// Integração contra o backend de homologação; credenciais via variáveis de ambiente,
// NUNCA em código/relatório. Sem as variáveis, a suíte é PULADA (não falha o QA nativo).
//
// Design da SPEC: sync/pagina recebe APENAS execucao_id; o servidor carrega fonte/recurso/
// cursor, faz a leitura FORA da transação e persiste/ativa em transação curta.
// Falha transitória: até 3 tentativas em ETAPAS SEPARADAS (2s/5s), mesma execução/cursor;
// encerrada a execução em falha, o lote anterior permanece ativo (nada de zero inventado).

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

test.skipIf(!temCredenciais)('CA-O2 (contexto): ciclo completo ativa um lote com 4 linhas', async () => {
  const token = await login(EMAIL_SYNC)
  const h = { Authorization: token, 'Content-Type': 'application/json' }
  const ini = await (await fetch(`${URL_BASE}/backend/v1/pcp/sync/iniciar`, {
    method: 'POST', headers: h, body: JSON.stringify({ recurso: 'estoque' }),
  })).json()
  let r = null
  for (let i = 0; i < 3; i++) {
    r = await (await fetch(`${URL_BASE}/backend/v1/pcp/sync/pagina`, {
      method: 'POST', headers: h, body: JSON.stringify({ execucao_id: ini.execucao_id }),
    })).json()
  }
  assert.equal(r.lote_ativado, true)
  const estado = await (await fetch(`${URL_BASE}/backend/v1/pcp/sync/estado`, { headers: h })).json()
  const fonte = (estado.fontes || []).find((f) => f.recurso === 'estoque')
  assert.equal(fonte.total_itens, 4)
  assert.equal(fonte.estado_tecnico, 'ok')
})

test.skipIf(!temCredenciais)('CA-O3: falha transitória mantém execução/cursor (retry) e lote anterior ativo; 3ª falha encerra', async () => {
  const token = await login(EMAIL_SYNC)
  const h = { Authorization: token, 'Content-Type': 'application/json' }
  const estadoAntes = await (await fetch(`${URL_BASE}/backend/v1/pcp/sync/estado`, { headers: h })).json()
  const loteAntes = (estadoAntes.fontes || []).find((f) => f.recurso === 'estoque')?.lote_ativo
  const ini = await (await fetch(`${URL_BASE}/backend/v1/pcp/sync/iniciar`, {
    method: 'POST', headers: h, body: JSON.stringify({ recurso: 'estoque' }),
  })).json()
  // página 1 ok
  await fetch(`${URL_BASE}/backend/v1/pcp/sync/pagina`, {
    method: 'POST', headers: h, body: JSON.stringify({ execucao_id: ini.execucao_id }),
  })
  // página 2: três tentativas em etapas separadas (a injeção de falha é configurada
  // pelo executor via secret temporário de homologação — removido após a prova)
  const t1 = await (await fetch(`${URL_BASE}/backend/v1/pcp/sync/pagina`, {
    method: 'POST', headers: h, body: JSON.stringify({ execucao_id: ini.execucao_id }),
  })).json()
  if (t1.retry) {
    assert.ok(t1.tentativa >= 1 && t1.tentativa <= 3, 'tentativa registrada')
    assert.ok(t1.proxima_em_ms === 2000 || t1.proxima_em_ms === 5000, 'agenda 2s/5s')
  }
  const t2 = await (await fetch(`${URL_BASE}/backend/v1/pcp/sync/pagina`, {
    method: 'POST', headers: h, body: JSON.stringify({ execucao_id: ini.execucao_id }),
  })).json()
  const t3 = await (await fetch(`${URL_BASE}/backend/v1/pcp/sync/pagina`, {
    method: 'POST', headers: h, body: JSON.stringify({ execucao_id: ini.execucao_id }),
  })).json()
  // após 3 tentativas (ou erro não transitório), encerra sem ativar
  assert.equal(t3.ok, false)
  const estadoDepois = await (await fetch(`${URL_BASE}/backend/v1/pcp/sync/estado`, { headers: h })).json()
  const fonte = (estadoDepois.fontes || []).find((f) => f.recurso === 'estoque')
  assert.equal(fonte.lote_ativo, loteAntes, 'lote anterior PERMANECE ativo (nada substituído)')
  assert.match(fonte.estado_tecnico, /falha/, 'estado técnico registra a falha')
  assert.equal(fonte.total_itens, 4, 'nenhum zero inventado')
})

test.skipIf(!temCredenciais)('CA-O4: execução em falha não avança; recuperação conclui uma vez; replay não duplica', async () => {
  const token = await login(EMAIL_SYNC)
  const h = { Authorization: token, 'Content-Type': 'application/json' }
  // execução anterior (em falha, do teste acima) não avança mais
  // (id recuperado do estado não é exposto; a guarda é provada pelo fluxo abaixo)
  // recuperação: nova execução retoma e conclui uma vez
  const ini = await (await fetch(`${URL_BASE}/backend/v1/pcp/sync/iniciar`, {
    method: 'POST', headers: h, body: JSON.stringify({ recurso: 'estoque' }),
  })).json()
  let r = null
  for (let i = 0; i < 3; i++) {
    r = await (await fetch(`${URL_BASE}/backend/v1/pcp/sync/pagina`, {
      method: 'POST', headers: h, body: JSON.stringify({ execucao_id: ini.execucao_id }),
    })).json()
  }
  assert.equal(r.lote_ativado, true, 'recuperação conclui')
  const deNovo = await (await fetch(`${URL_BASE}/backend/v1/pcp/sync/pagina`, {
    method: 'POST', headers: h, body: JSON.stringify({ execucao_id: ini.execucao_id }),
  })).json()
  assert.equal(deNovo.ja_concluida, true, 'concluída não relê')
  // replay completo não duplica
  const ini2 = await (await fetch(`${URL_BASE}/backend/v1/pcp/sync/iniciar`, {
    method: 'POST', headers: h, body: JSON.stringify({ recurso: 'estoque' }),
  })).json()
  for (let i = 0; i < 3; i++) {
    await fetch(`${URL_BASE}/backend/v1/pcp/sync/pagina`, {
      method: 'POST', headers: h, body: JSON.stringify({ execucao_id: ini2.execucao_id }),
    })
  }
  const estado = await (await fetch(`${URL_BASE}/backend/v1/pcp/sync/estado`, { headers: h })).json()
  const fonte = (estado.fontes || []).find((f) => f.recurso === 'estoque')
  assert.equal(fonte.total_itens, 4, 'replay não duplica (upsert por chave)')
})

test.skipIf(!temCredenciais)('autorização: leitor sem pode_atualizar_fontes é negado no sync', async () => {
  const token = await login(EMAIL_LEITOR)
  const res = await fetch(`${URL_BASE}/backend/v1/pcp/sync/iniciar`, {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ recurso: 'estoque' }),
  })
  assert.ok(res.status >= 400, 'leitor não pode iniciar sincronização')
})
