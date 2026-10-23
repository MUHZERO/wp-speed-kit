import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { applyProfile, deviceProfile, launchChrome } from '../chrome.js';
import { connectPage } from '../cdp.js';
import { buildHypotheses } from './hypotheses.js';
import { injectedRecorder } from './inject.js';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function overlayExpression(sources) {
  return `(() => {
    const overlay = document.createElement('div');
    overlay.dataset.wpskOverlay = 'true';
    overlay.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647';
    for (const source of ${JSON.stringify(sources)}) {
      const box = source.after;
      if (!box || (!box.w && !box.h)) continue;
      const outline = document.createElement('div');
      outline.style.cssText = 'position:fixed;left:' + box.x + 'px;top:' + box.y + 'px;width:' + box.w + 'px;height:' + box.h + 'px;box-sizing:border-box;border:2px solid #f00;background:rgb(255 0 0 / 0.08)';
      overlay.append(outline);
    }
    document.documentElement.append(overlay);
  })()`;
}

const removeOverlay = "document.querySelectorAll('[data-wpsk-overlay]').forEach((node) => node.remove())";

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
    const screenshots = [];
    let firstPaintCaptured = false;
    let shiftNumber = 0;
    let captures = Promise.resolve();
    const capture = (name, sources = []) => {
      captures = captures.then(async () => {
        if (sources.length) await evaluate(cdp, overlayExpression(sources));
        try {
          const image = await cdp.send('Page.captureScreenshot', { format: 'png' });
          const path = join(outDir, `${name}.png`);
          await writeFile(path, image.data, 'base64');
          screenshots.push(path);
        } finally {
          if (sources.length) await evaluate(cdp, removeOverlay);
        }
      });
    };
    if (shots && outDir) {
      await mkdir(outDir, { recursive: true });
      await cdp.send('Runtime.enable');
      await cdp.send('Runtime.addBinding', { name: 'wpskLayoutShift' });
      cdp.on('Runtime.bindingCalled', ({ name, payload }) => {
        if (name !== 'wpskLayoutShift') return;
        const event = JSON.parse(payload);
        if (event.type === 'first-paint' && !firstPaintCaptured) {
          firstPaintCaptured = true;
          capture('first-paint');
        }
        if (event.type === 'shift') capture(`shift-${++shiftNumber}`, event.sources);
      });
    }
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
    if (shots && outDir) {
      if (!firstPaintCaptured) capture('first-paint');
      await captures;
      capture('final');
      await captures;
    }
    return { finalUrl: await evaluate(cdp, 'location.href'), device, ...split, cls: split.shifts.reduce((total, shift) => total + shift.value, 0), events: { fonts: raw.fonts, insertions: raw.insertions, resources: raw.resources }, screenshots };
  } finally {
    cdp?.close();
    await chrome.kill();
  }
}
