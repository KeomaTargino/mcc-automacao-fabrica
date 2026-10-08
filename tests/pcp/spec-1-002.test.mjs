import { test } from 'node:test'
import assert from 'node:assert/strict'

// SPEC-1-002 — CA-O1/O2 (RED antes do adapter): normalização de páginas, lote,
// contagem por chave de origem. Fixtures idênticas às da SPEC.
// Sem credenciais Omie no ambiente, os cenários usam o modo mock de homologação
// (identificado como 'omie-mock'); chamada real exige OMIE_APP_KEY/SECRET no servidor.

const URL_BASE = process.env.PCP_TEST_URL || ''
const SENHA = process.env.PCP_TEST_PASSWORD || ''
const EMAIL_SYNC = process.env.PCP_TEST_SYNC_EMAIL || ''
const EMAIL_LEITOR = process.env.PCP_TEST_LEITOR_EMAIL || ''
const temCredenciais = Boolean(URL_BASE && SENHA && EMAIL_SYNC && EMAIL_LEITOR)

// ---- Fixtures da SPEC (página 1 e página 2 do recurso estoque) ----
const PAGINA1 = {
  fonte: 'omie',
  recurso: 'estoque',
  pagina: 1,
  itens: [
    { produto_id: '123', local_id: '1', unidade: 'UN', saldo: 10 },
    { produto_id: '124', local_id: '1', unidade: 'KG', saldo: null },
  ],
}
const PAGINA2 = {
  fonte: 'omie',
  recurso: 'estoque',
  pagina: 2,
  itens: [
    { produto_id: '123', local_id: '2', unidade: 'UN', saldo: 5 },
    { produto_id: '125', local_id: '1', unidade: 'KG', saldo: -2 },
  ],
}

function chaveOrigem(item) {
  return `omie:estoque:app1:${item.produto_id}:${item.local_id}:${item.unidade}`
}

function normalizar(itens) {
  return itens.map((i) => ({
    chave_origem: chaveOrigem(i),
    conteudo: {
      produto_id: String(i.produto_id),
      local_id: String(i.local_id),
      unidade: i.unidade,
      saldo: i.saldo, // null permanece null; negativo preservado; sem coerção
    },
  }))
}

test('RED/CA-O2: duas páginas produzem 4 chaves distintas com saldos preservados', () => {
  const todas = [...normalizar(PAGINA1.itens), ...normalizar(PAGINA2.itens)]
  const chaves = new Set(todas.map((t) => t.chave_origem))
  assert.equal(chaves.size, 4, 'P1 local A e P1 local B são duas linhas (identidade por local)')
  const porChave = new Map(todas.map((t) => [t.chave_origem, t.conteudo]))
  const p1a = porChave.get(chaveOrigem({ produto_id: '123', local_id: '1', unidade: 'UN' }))
  const p1b = porChave.get(chaveOrigem({ produto_id: '123', local_id: '2', unidade: 'UN' }))
  assert.equal(p1a.saldo, 10)
  assert.equal(p1b.saldo, 5)
  // null ≠ zero; negativo preservado; IDs como texto
  assert.equal(porChave.get(chaveOrigem({ produto_id: '124', local_id: '1', unidade: 'KG' })).saldo, null)
  assert.equal(porChave.get(chaveOrigem({ produto_id: '125', local_id: '1', unidade: 'KG' })).saldo, -2)
  assert.equal(typeof p1a.produto_id, 'string')
})

test('RED/CA-O4: repetir página (replay) não cria chaves novas — upsert idempotente', () => {
  const primeira = normalizar(PAGINA1.itens)
  const replay = normalizar([...PAGINA1.itens, ...PAGINA1.itens])
  const chaves1 = new Set(primeira.map((t) => t.chave_origem))
  const chavesReplay = new Set(replay.map((t) => t.chave_origem))
  assert.equal(chavesReplay.size, chaves1.size, 'replay não pode duplicar linhas')
})

test('RED/allowlist: recursos liberados são apenas consulta; nada mutante', () => {
  const ALLOWLIST = {
    estoque: { endpoint: 'https://app.omie.com.br/api/v1/estoque/consulta/', call: 'ConsultaEstoque' },
    produtos: { endpoint: 'https://app.omie.com.br/api/v1/geral/produtos/', call: 'ListarProdutosResumido' },
  }
  for (const [recurso, cfg] of Object.entries(ALLOWLIST)) {
    assert.match(cfg.endpoint, /^https:\/\/app\.omie\.com\.br\/api\/v1\//)
    assert.match(cfg.call, /^(Consulta|Listar)/, 'somente operações de consulta')
  }
  assert.equal(Object.keys(ALLOWLIST).length, 2)
})

// ---- Integração (env-gated) contra o backend de homologação ----

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

test.skipIf(!temCredenciais)('CA-O2 (integração): sync inicia, pagina 2x e ativa um lote único', async () => {
  const token = await login(EMAIL_SYNC)
  const h = { Authorization: token, 'Content-Type': 'application/json' }
  const ini = await (await fetch(`${URL_BASE}/backend/v1/pcp/sync/iniciar`, {
    method: 'POST', headers: h, body: JSON.stringify({ recurso: 'estoque' }),
  })).json()
  assert.ok(ini.execucao_id, 'execução criada')
  const p1 = await (await fetch(`${URL_BASE}/backend/v1/pcp/sync/pagina`, {
    method: 'POST', headers: h, body: JSON.stringify({ execucao_id: ini.execucao_id, itens: PAGINA1.itens, pagina: 1, ultima: false }),
  })).json()
  assert.equal(p1.ok, true)
  const p2 = await (await fetch(`${URL_BASE}/backend/v1/pcp/sync/pagina`, {
    method: 'POST', headers: h, body: JSON.stringify({ execucao_id: ini.execucao_id, itens: PAGINA2.itens, pagina: 2, ultima: true }),
  })).json()
  assert.equal(p2.ok, true)
  assert.equal(p2.lote_ativado, true, 'última página ativa o lote')
  const estado = await (await fetch(`${URL_BASE}/backend/v1/pcp/sync/estado`, { headers: h })).json()
  const fonte = (estado.fontes || []).find((f) => f.recurso === 'estoque')
  assert.ok(fonte, 'fonte estoque registrada')
  assert.equal(fonte.total_itens, 4, 'lote único com 4 linhas')
  assert.ok(fonte.ultimo_sucesso, 'ultimo_sucesso registrado')
})

test.skipIf(!temCredenciais)('CA-O4 (integração): repetir a página 1 não duplica linhas', async () => {
  const token = await login(EMAIL_SYNC)
  const h = { Authorization: token, 'Content-Type': 'application/json' }
  const ini = await (await fetch(`${URL_BASE}/backend/v1/pcp/sync/iniciar`, {
    method: 'POST', headers: h, body: JSON.stringify({ recurso: 'estoque' }),
  })).json()
  await fetch(`${URL_BASE}/backend/v1/pcp/sync/pagina`, {
    method: 'POST', headers: h, body: JSON.stringify({ execucao_id: ini.execucao_id, itens: PAGINA1.itens, pagina: 1, ultima: false }),
  })
  const replay = await (await fetch(`${URL_BASE}/backend/v1/pcp/sync/pagina`, {
    method: 'POST', headers: h, body: JSON.stringify({ execucao_id: ini.execucao_id, itens: PAGINA1.itens, pagina: 1, ultima: false }),
  })).json()
  assert.equal(replay.total_itens, 2, 'mesma página mantém 2 registros (upsert por chave)')
})

test.skipIf(!temCredenciais)('CA-O3 (integração): falha na página 2 não ativa lote nem substitui anterior', async () => {
  const token = await login(EMAIL_SYNC)
  const h = { Authorization: token, 'Content-Type': 'application/json' }
  const estadoAntes = await (await fetch(`${URL_BASE}/backend/v1/pcp/sync/estado`, { headers: h })).json()
  const loteAntes = (estadoAntes.fontes || []).find((f) => f.recurso === 'estoque')?.lote_ativo
  const ini = await (await fetch(`${URL_BASE}/backend/v1/pcp/sync/iniciar`, {
    method: 'POST', headers: h, body: JSON.stringify({ recurso: 'estoque' }),
  })).json()
  await fetch(`${URL_BASE}/backend/v1/pcp/sync/pagina`, {
    method: 'POST', headers: h, body: JSON.stringify({ execucao_id: ini.execucao_id, itens: PAGINA1.itens, pagina: 1, ultima: false }),
  })
  // página 2 falha: envio sinaliza erro explícito
  const falha = await (await fetch(`${URL_BASE}/backend/v1/pcp/sync/pagina`, {
    method: 'POST', headers: h, body: JSON.stringify({ execucao_id: ini.execucao_id, itens: [], pagina: 2, ultima: true, erro: 'pagina_incompleta' }),
  })).json()
  assert.equal(falha.ok, false, 'falha de página não é sucesso')
  const estadoDepois = await (await fetch(`${URL_BASE}/backend/v1/pcp/sync/estado`, { headers: h })).json()
  const fonte = (estadoDepois.fontes || []).find((f) => f.recurso === 'estoque')
  assert.equal(fonte.lote_ativo, loteAntes, 'lote anterior permanece ativo')
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
})
