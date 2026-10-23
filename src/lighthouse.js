import { Worker } from 'node:worker_threads';

import { launchChrome } from './chrome.js';

const WORKER = new URL('./lighthouse-worker.js', import.meta.url);

// One Lighthouse pass in a worker; past the timeout the worker is terminated, which also drops any call
// Lighthouse left pending.
function runInWorker(data, seconds) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER, { workerData: data });
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error(`Lighthouse timed out after ${seconds} seconds`));
    }, seconds * 1000);
    worker.once('message', (message) => {
      clearTimeout(timer);
      worker.terminate();
      if (message.error) reject(new Error(message.error)); else resolve(message.lhr);
    });
    worker.once('error', (error) => { clearTimeout(timer); reject(error); });
  });
}

function number(audit) {
  return audit?.numericValue ?? 0;
}

function score(audit) {
  return Math.round((audit?.score ?? 0) * 100);
}

export async function runLighthouse(url, device, { chromePath, flags = [], timeout = 120 } = {}) {
  let chrome;
  try {
    chrome = await launchChrome({ chromePath, flags });
    // Lighthouse's own load limit (80 % of the timeout) usually ends a hung page first, as a Lighthouse error.
    const lhr = await runInWorker({ url, port: chrome.port, device, maxWaitForLoad: Math.round(timeout * 800) }, timeout);
    if (lhr.runtimeError) {
      return { id: '', device, ok: false, error: lhr.runtimeError.message || lhr.runtimeError.code, retried: false, lhr };
    }
    return {
      id: '', device, ok: true, retried: false,
      scores: {
        perf: score(lhr.categories.performance), a11y: score(lhr.categories.accessibility),
        bp: score(lhr.categories['best-practices']), seo: score(lhr.categories.seo),
      },
      metrics: {
        fcp: number(lhr.audits['first-contentful-paint']), lcp: number(lhr.audits['largest-contentful-paint']),
        tbt: number(lhr.audits['total-blocking-time']), si: number(lhr.audits['speed-index']),
      },
      cls: number(lhr.audits['cumulative-layout-shift']),
      lhr,
    };
  } catch (error) {
    return { id: '', device, ok: false, error: error.message || String(error), retried: false };
  } finally {
    await chrome?.kill();
  }
}

export class MeasureError extends Error {}

// Also the reachability check: with count 0 the first device still makes one request,
// so a page answering HTTP >= 400 stops before Lighthouse runs.
export async function warmUp(url, count, devices, { timeout = 120 } = {}) {
  let last = { finalUrl: url, status: null };
  for (const [index, device] of devices.entries()) {
    const requests = index === 0 ? Math.max(count, 1) : count;
    for (let run = 0; run < requests; run += 1) {
      let response;
      try {
        response = await fetch(url, { headers: { 'user-agent': device.userAgent }, redirect: 'follow', signal: AbortSignal.timeout(timeout * 1000) });
      } catch (error) {
        // A slow answer is not a reason to give up: Lighthouse measures it and retries on its own timeout.
        if (error.name === 'TimeoutError') {
          process.stderr.write(`Warm-up request timed out after ${timeout} s; measuring anyway\n`);
          return last;
        }
        throw new MeasureError(`Warm-up failed: ${error.message}`);
      }
      last = { finalUrl: response.url, status: response.status };
      if (response.status >= 400) throw new MeasureError(`Warm-up returned HTTP ${response.status} for ${response.url}`);
      await response.arrayBuffer();
    }
  }
  return last;
}
