import { test } from 'node:test'
import assert from 'node:assert/strict'

// SPEC-1-001 — CA-A2/A3: autorização por área (TDD da SPEC).
// Integração contra o backend de homologação; credenciais via variáveis de ambiente,
// NUNCA em código/relatório. Sem as variáveis, a suíte é PULADA (não falha o QA nativo).

const URL_BASE = process.env.PCP_TEST_URL || ''
const SENHA = process.env.PCP_TEST_PASSWORD || ''
const EMAIL_PCP = process.env.PCP_TEST_PCP_EMAIL || ''
const EMAIL_COMPRAS = process.env.PCP_TEST_COMPRAS_EMAIL || ''
const EMAIL_SEM_PERFIL = process.env.PCP_TEST_SEM_PERFIL_EMAIL || ''
const EMAIL_INATIVO = process.env.PCP_TEST_INATIVO_EMAIL || ''

const temCredenciais = Boolean(URL_BASE && SENHA && EMAIL_PCP && EMAIL_COMPRAS && EMAIL_SEM_PERFIL && EMAIL_INATIVO)

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

test.skipIf(!temCredenciais)('CA-A2: perfil PCP recebe estoque e NÃO recebe pedidos pela rota autorizada', async () => {
  const token = await login(EMAIL_PCP)
  const res = await fetch(`${URL_BASE}/backend/v1/pcp/dados`, {
    headers: { Authorization: token },
  })
  assert.equal(res.status, 200)
  const json = await res.json()
  assert.equal(json.fonte, 'demonstracao')
  assert.ok(Array.isArray(json.dados.estoque), 'PCP deve receber estoque')
  assert.equal(json.dados.pedidos, undefined, 'PCP NÃO deve receber pedidos')
  assert.equal(json.dados.compras, undefined, 'PCP NÃO deve receber compras')
  assert.ok(json.areas_permitidas.includes('estoque'))
  assert.ok(!json.areas_permitidas.includes('pedidos'))
})

test.skipIf(!temCredenciais)('CA-A2: perfil Compras recebe compras/painel e NÃO recebe pedidos', async () => {
  const token = await login(EMAIL_COMPRAS)
  const res = await fetch(`${URL_BASE}/backend/v1/pcp/dados`, {
    headers: { Authorization: token },
  })
  assert.equal(res.status, 200)
  const json = await res.json()
  assert.ok(Array.isArray(json.dados.compras), 'Compras deve receber compras')
  assert.equal(json.dados.pedidos, undefined, 'Compras NÃO deve receber pedidos (cenário Proibido da SPEC)')
  assert.equal(json.dados.estoque, undefined, 'Compras NÃO deve receber estoque')
})

test.skipIf(!temCredenciais)('CA-A2: leitura DIRETA de coleções de dados é NEGADA (API sem rota autorizada)', async () => {
  const token = await login(EMAIL_PCP)
  for (const col of ['pcp_dados', 'pcp_fontes', 'pcp_lotes', 'pcp_execucoes']) {
    const res = await fetch(`${URL_BASE}/api/collections/${col}/records`, {
      headers: { Authorization: token },
    })
    assert.ok(res.status === 403 || res.status === 401 || res.status === 404, `${col} não pode ser lido direto (recebeu ${res.status})`)
  }
})

test.skipIf(!temCredenciais)('CA-A3: usuário sem perfil não recebe dado — mensagem de acesso pendente', async () => {
  const token = await login(EMAIL_SEM_PERFIL)
  const res = await fetch(`${URL_BASE}/backend/v1/pcp/dados`, {
    headers: { Authorization: token },
  })
  assert.equal(res.status, 403)
  const json = await res.json()
  assert.equal(json.message, 'perfil_ausente')
})

test.skipIf(!temCredenciais)('CA-A3: perfil inativo é recusado', async () => {
  const token = await login(EMAIL_INATIVO)
  const res = await fetch(`${URL_BASE}/backend/v1/pcp/dados`, {
    headers: { Authorization: token },
  })
  assert.equal(res.status, 403)
  const json = await res.json()
  assert.equal(json.message, 'perfil_inativo')
})

test.skipIf(!temCredenciais)('CA-A3: token expirado/inválido → 401', async () => {
  const res = await fetch(`${URL_BASE}/backend/v1/pcp/dados`, {
    headers: { Authorization: 'token-invalido' },
  })
  assert.equal(res.status, 401)
})

test.skipIf(!temCredenciais)('CA-A3: alteração do próprio perfil é negada', async () => {
  const token = await login(EMAIL_PCP)
  // descobre o id do próprio perfil via rota autorizada
  const rPerfil = await fetch(`${URL_BASE}/backend/v1/pcp/perfil`, {
    headers: { Authorization: token },
  })
  assert.equal(rPerfil.status, 200)
  const jPerfil = await rPerfil.json()
  assert.ok(jPerfil.perfil, 'usuário PCP deve ter perfil')
  const idPerfil = jPerfil.perfil.usuario
  const res = await fetch(`${URL_BASE}/api/collections/pcp_perfis/records/${idPerfil}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: token },
    body: JSON.stringify({ areas: ['pedidos', 'painel'] }),
  })
  assert.ok(res.status >= 400, 'autoelevação de área deve ser negada')
})

test.skipIf(!temCredenciais)('CA-A3: área enviada pelo navegador é ignorada (autorização no servidor)', async () => {
  const token = await login(EMAIL_PCP)
  const res = await fetch(`${URL_BASE}/backend/v1/pcp/dados?area=pedidos`, {
    headers: { Authorization: token },
  })
  assert.equal(res.status, 200)
  const json = await res.json()
  assert.equal(json.dados.pedidos, undefined, 'query ?area= não pode conceder área')
})
