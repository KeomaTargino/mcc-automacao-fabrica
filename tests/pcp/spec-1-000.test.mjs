import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

test('RED: coleções pcp_* ausentes no schema gerado', () => {
  const schema = JSON.parse(readFileSync(join(root, 'src/lib/pocketbase/schema.json'), 'utf8'));
  const names = schema.collections.map((c) => c.name);
  for (const c of ['pcp_execucoes', 'pcp_lotes', 'pcp_dados', 'pcp_fontes']) {
    assert.ok(!names.includes(c), `${c} não deveria existir antes do fundamento`);
  }
});

test('RED: provider de demonstração ausente', () => {
  assert.ok(!existsSync(join(root, 'src/lib/pcp/provider.ts')), 'provider não deveria existir antes do fundamento');
});

test('RED: telas Catálogo/Painel ausentes', () => {
  assert.ok(!existsSync(join(root, 'src/pages/Catalogo.tsx')));
  assert.ok(!existsSync(join(root, 'src/pages/Painel.tsx')));
});
