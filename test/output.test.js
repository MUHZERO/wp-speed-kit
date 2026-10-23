import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { slugFor, uniqueDir } from '../src/output.js';

test('creates a numbered output directory without changing the original', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'wpsk-output-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const base = join(root, 'report');
  await uniqueDir(base);
  await writeFile(join(base, 'keep.txt'), 'unchanged');

  assert.equal(await uniqueDir(base), `${base}-2`);
  assert.equal(await readFile(join(base, 'keep.txt'), 'utf8'), 'unchanged');
});

test('creates a stable URL slug', () => {
  assert.equal(slugFor('https://a.test/'), 'a.test-home');
  assert.equal(slugFor('https://a.test/shop/x/'), 'a.test-shop-x');
});
