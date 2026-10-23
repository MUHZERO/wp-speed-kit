import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { applyProfile, deviceProfile, launchChrome } from '../chrome.js';
import { connectPage } from '../cdp.js';
import { buildHypotheses } from './hypotheses.js';
import { injectedRecorder } from './inject.js';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

export async function recordShifts(url, { device = 'mobile', chromePath, flags = [], shots = false, outDir } = {}) {
  const chrome = await launchChrome({ chromePath, flags });
  let cdp;
  try {
    cdp = await connectPage(chrome.port);
    await cdp.send('Page.enable');
    await cdp.send('Network.enable');
    await applyProfile(cdp, deviceProfile(device));
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: injectedRecorder });
    const loaded = new Promise((resolve) => cdp.on('Page.loadEventFired', resolve));
    await cdp.send('Page.navigate', { url });
    await loaded;

    const started = Date.now();
    let lastCount = -1;
    let settledAt = Date.now();
    while (Date.now() - started < 30_000) {
      const count = await evaluate(cdp, 'window.__wpskRecorder.read().shifts.length');
      if (count !== lastCount) {
        lastCount = count;
        settledAt = Date.now();
      }
      if (Date.now() - settledAt >= 5_000) break;
      await wait(100);
    }
    const raw = JSON.parse(await evaluate(cdp, 'JSON.stringify(window.__wpskRecorder.read())'));
    const split = { shifts: [], inputShifts: [] };
    for (const rawShift of raw.shifts) {
      const dom = rawShift.sources[0]?.dom || {};
      const shift = { t: rawShift.t, value: rawShift.value, sources: rawShift.sources.map(({ dom: ignored, ...source }) => source), hypotheses: buildHypotheses(rawShift, raw, dom) };
      split[rawShift.hadRecentInput ? 'inputShifts' : 'shifts'].push(shift);
    }
    const screenshots = [];
    if (shots && outDir) {
      await mkdir(outDir, { recursive: true });
      const names = ['first-paint', ...split.shifts.filter((shift) => shift.value > 0.01).map((_, index) => `shift-${index + 1}`), 'final'];
      for (const name of names) {
        const image = await cdp.send('Page.captureScreenshot', { format: 'png' });
        const path = join(outDir, `${name}.png`);
        await writeFile(path, image.data, 'base64');
        screenshots.push(path);
      }
    }
    return { finalUrl: await evaluate(cdp, 'location.href'), device, ...split, cls: split.shifts.reduce((total, shift) => total + shift.value, 0), events: { fonts: raw.fonts, insertions: raw.insertions, resources: raw.resources }, screenshots };
  } finally {
    cdp?.close();
    await chrome.kill();
  }
}
