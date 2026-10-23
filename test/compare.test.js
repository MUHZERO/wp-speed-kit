import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import runCompare from '../src/commands/compare.js';
import { renderCompare } from '../src/report/compare-html.js';

const summary = (median) => ({ median, min: median, max: median });
function report(perf, lcp, lighthouseVersion = '13.5.0') {
  return {
    schemaVersion: 1, runsRequested: 5, provenance: { toolVersion: '0.1.0', lighthouseVersion, chromeVersion: '1' },
    aggregates: { mobile: { n: 5, scores: { perf: summary(perf), a11y: summary(90), bp: summary(90), seo: summary(90) }, metrics: { fcp: summary(1000), lcp: summary(lcp), tbt: summary(100), cls: summary(0), si: summary(1000) } } },
    recordings: { mobile: { cls: 0 } },
  };
}

test('shows signed score and metric differences', () => {
  const html = renderCompare(report(55, 4000), report(93, 2100));
  assert.match(html, /\+38/);
  assert.match(html, /−1\.9 s/);
});

test('warns when report versions differ', () => {
  assert.match(renderCompare(report(55, 4000, '13.4.0'), report(93, 2100)), /Warning: these reports use different tool, Lighthouse, Chrome versions, or run counts; differences may not be directly comparable\./);
});

test('rejects unsupported report schemas', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'wpsk-compare-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const before = join(root, 'before.json');
  const after = join(root, 'after.json');
  await writeFile(before, JSON.stringify({ schemaVersion: 2 }));
  await writeFile(after, JSON.stringify(report(93, 2100)));
  const lines = [];
  const write = process.stderr.write;
  process.stderr.write = (line) => { lines.push(line); return true; };
  try {
    assert.equal(await runCompare({ files: [before, after], options: { out: join(root, 'compare'), png: false } }), 1);
  } finally { process.stderr.write = write; }
  assert.match(lines.join(''), /unsupported schemaVersion/);
});

test('formats metric values and differences in their own units', () => {
  const html = renderCompare(report(55, 4517.171825369913), report(93, 2039.5010000000002));
  assert.match(html, /4\.5 s/);
  assert.match(html, /2\.0 s/);
  assert.match(html, /100 ms/);
  assert.doesNotMatch(html, /\d\.\d{4,}/);
});
