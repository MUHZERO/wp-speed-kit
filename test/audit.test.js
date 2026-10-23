import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import runAudit from '../src/commands/audit.js';
import { startFixtureServer } from './helpers/server.js';

const fixtures = fileURLToPath(new URL('./fixtures/', import.meta.url));
const options = (out, overrides = {}) => ({ runs: 1, device: 'mobile', warm: 0, out, cta: null, json: true, failOn: null, timeout: 90, chromePath: null, chromeFlags: [], ...overrides });

async function captureJson(callback) {
  const chunks = [];
  const write = process.stdout.write;
  process.stdout.write = (chunk) => { chunks.push(chunk); return true; };
  try { return { code: await callback(), json: JSON.parse(chunks.join('')) }; } finally { process.stdout.write = write; }
}

test('audits a fixture, follows redirects, and reports warm-up failures without a stack trace', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'wpsk-audit-'));
  const server = await startFixtureServer(fixtures);
  t.after(async () => { await server.close(); await rm(root, { recursive: true, force: true }); });
  const parsed = (url, suffix) => ({ urls: [url], options: options(join(root, suffix)) });

  const clean = await captureJson(() => runAudit(parsed(`${server.url}/clean.html`, 'clean')));
  assert.equal(clean.code, 0);
  assert.equal(clean.json.schemaVersion, 1);
  assert.equal(clean.json.runs.length, 1);
  assert.equal(clean.json.runs[0].ok, true);
  assert.ok(clean.json.runs[0].scores.perf >= 0 && clean.json.runs[0].scores.perf <= 100);

  const redirected = await captureJson(() => runAudit(parsed(`${server.url}/redirect?to=/clean.html`, 'redirect')));
  assert.equal(redirected.code, 0);
  assert.match(redirected.json.finalUrl, /\/clean\.html$/);

  const missing = await captureJson(() => runAudit(parsed(`${server.url}/missing.html`, 'missing')));
  assert.equal(missing.code, 1);
  assert.match(missing.json.error, /HTTP 404/);
});

test('records a timed-out run and retries it once', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'wpsk-audit-'));
  const server = await startFixtureServer(fixtures);
  t.after(async () => { await server.close(); await rm(root, { recursive: true, force: true }); });
  const result = await captureJson(() => runAudit({ urls: [`${server.url}/hang`], options: options(join(root, 'hang'), { timeout: 5 }) }));
  assert.equal(result.code, 1);
  assert.equal(result.json.runs[0].ok, false);
  assert.equal(result.json.runs[0].retried, true);
  assert.ok(result.json.runs[0].error);
});
