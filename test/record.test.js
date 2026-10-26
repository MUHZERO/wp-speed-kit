import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getChromePath } from 'chrome-launcher';

import { launchChrome } from '../src/chrome.js';
import { recordShifts } from '../src/cls/record.js';
import { startFixtureServer } from './helpers/server.js';

const fixtures = fileURLToPath(new URL('./fixtures/', import.meta.url));

async function requireChrome(t) {
  const chromePath = process.env.CHROME_PATH || (() => {
    try { return getChromePath(); } catch { return null; }
  })();
  if (!chromePath || !existsSync(chromePath)) {
    t.skip('Chrome binary was not found; set CHROME_PATH or install Chrome to run recorder tests');
    return false;
  }
  const chrome = await launchChrome({ chromePath });
  await chrome.kill();
  return true;
}

test('records synthetic layout shifts and their evidence', async (t) => {
  if (!await requireChrome(t)) return;
  const server = await startFixtureServer(fixtures);
  try {
    for (const [file, kind] of Object.entries({
      'unsized-image.html': 'image',
      'late-font.html': 'font',
      'inserted-banner.html': 'inserted',
      'late-style.html': 'stylesheet',
      'carousel.html': 'carousel',
      // Paint is held back 600 ms by a stylesheet: the change must still come after the first paint.
      'late-paint.html': 'inserted',
    })) {
      const recording = await recordShifts(`${server.url}/${file}`, { device: 'desktop' });
      assert.ok(
        recording.shifts.some((shift) => shift.hypotheses.some((hypothesis) => hypothesis.kind === kind)),
        `${file} should have ${kind} evidence; recorded: ${JSON.stringify({ shifts: recording.shifts, inputShifts: recording.inputShifts, events: recording.events })}`,
      );
    }
    const clean = await recordShifts(`${server.url}/clean.html`, { device: 'desktop' });
    assert.equal(clean.shifts.length, 0);
    assert.equal(clean.cls, 0);
  } finally {
    await server.close();
  }
});

test('captures first paint, shifts, and final state without recording its overlays', async (t) => {
  if (!await requireChrome(t)) return;
  const server = await startFixtureServer(fixtures);
  const outDir = await mkdtemp(join(tmpdir(), 'wpsk-shots-'));
  try {
    const recording = await recordShifts(`${server.url}/large-shift.html`, { device: 'desktop', shots: true, outDir });
    const files = await readdir(outDir);
    assert.ok(files.length >= 3);
    assert.ok(files.includes('first-paint.png'));
    assert.ok(files.includes('shift-1.png'));
    assert.ok(files.includes('final.png'));
    assert.notDeepEqual(await readFile(join(outDir, 'first-paint.png')), await readFile(join(outDir, 'shift-1.png')));
    assert.ok(!recording.events.insertions.some((entry) => entry.selector.includes('wpsk-overlay')));
  } finally {
    await Promise.all([server.close(), rm(outDir, { recursive: true, force: true })]);
  }
});
