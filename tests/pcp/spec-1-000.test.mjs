import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

// GREEN — SPEC-1-000 CA-F2/F3: telas de demonstração com fixtures, banner,
// estados distintos e nenhuma chamada externa.

test('provider: fixtures exatas da SPEC no estado ok', async () => {
  const mod = await import(join(root, 'src/lib/pcp/provider.ts'));
  const provider = mod.criarProviderDemonstracao('ok');
  const r = await provider.ler();
  assert.equal(r.estado, 'ok');
  assert.equal(r.fonte, 'demonstracao');
  assert.ok(!Number.isNaN(Date.parse(r.observado_em)), 'observado_em deve ser ISO válido');
  const d = r.dados;
  // Estoque: P1=10 UN/local A; P2=2 KG/local B
  assert.deepEqual(
    d.estoque.map((e) => [e.produto_id, e.unidade, e.local, e.saldo]),
    [['P1', 'UN', 'A', 10], ['P2', 'KG', 'B', 2]],
  );
  // Produção: OP-1 aberta
  assert.equal(d.producao.length, 1);
  assert.equal(d.producao[0].documento_id, 'OP-1');
  assert.equal(d.producao[0].status_original, 'aberta');
  // Compras: C-1 aberta
  assert.equal(d.compras.length, 1);
  assert.equal(d.compras[0].documento_id, 'C-1');
  // Pedidos: OM-11/OM-L1 oficiais Omie; NS-10 intenção Nuvemshop separada
  assert.deepEqual(
    d.pedidos.map((p) => [p.documento_id, p.canal, p.oficial]),
    [['OM-11', 'omie', true], ['OM-L1', 'omie', true], ['NS-10', 'nuvemshop', false]],
  );
});

test('provider: estados vazio/indisponivel/falha não fabricam dado', async () => {
  const mod = await import(join(root, 'src/lib/pcp/provider.ts'));
  for (const modo of ['vazio', 'indisponivel', 'falha']) {
    const r = await mod.criarProviderDemonstracao(modo).ler();
    assert.equal(r.estado, modo, `estado ${modo}`);
    assert.equal(r.dados, null, `${modo} não deve devolver dados`);
    assert.ok(r.erro, `${modo} deve ter mensagem própria`);
  }
  // cada estado tem mensagem distinta
  const msgs = await Promise.all(
    ['vazio', 'indisponivel', 'falha'].map((m) => mod.criarProviderDemonstracao(m).ler()),
  );
  const textos = msgs.map((r) => r.erro ?? '');
  assert.equal(new Set(textos).size, 3, 'mensagens dos três estados devem ser distintas');
});

test('isolamento: provider e telas sem chamada de rede ou referência a ERP/canal', () => {
  const arquivos = [
    'src/lib/pcp/provider.ts',
    'src/pages/Painel.tsx',
    'src/pages/Catalogo.tsx',
  ];
  const proibidos = /\b(fetch|XMLHttpRequest|axios|WebSocket|omie\.com|nuvemshop|api\.omie)\b/i;
  for (const f of arquivos) {
    const conteudo = readFileSync(join(root, f), 'utf8');
    assert.ok(!proibidos.test(conteudo), `${f} contém referência de rede/ERP-canal`);
  }
});

test('navegação: rotas /catalogo e /painel registradas em App.tsx', () => {
  const app = readFileSync(join(root, 'src/App.tsx'), 'utf8');
  assert.match(app, /path="\/catalogo"/);
  assert.match(app, /path="\/painel"/);
});

test('banner permanente de demonstração nas duas telas', () => {
  for (const f of ['src/pages/Painel.tsx', 'src/pages/Catalogo.tsx']) {
    const conteudo = readFileSync(join(root, f), 'utf8');
    assert.match(
      conteudo,
      /Dados de demonstração — fontes ainda não conectadas/,
      `${f} deve exibir o banner permanente`,
    );
  }
});
