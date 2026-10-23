import { writeFile } from 'node:fs/promises';
import { cpus, platform } from 'node:os';
import { fileURLToPath } from 'node:url';

import lighthousePackage from 'lighthouse/package.json' with { type: 'json' };
import packageJson from '../../package.json' with { type: 'json' };

import { renderHtml } from './html.js';
import { wordpressHints } from './wordpress.js';

export function buildReportData({ url, finalUrl, devices, runsRequested, runs, aggregates, recordings, provenance, cta }) {
  const representatives = Object.fromEntries(Object.entries(aggregates).map(([device, aggregate]) => [
    device,
    runs.find((run) => run.id === aggregate.representativeId) || null,
  ]));
  return {
    schemaVersion: 1, url, finalUrl, devices, runsRequested, runs, aggregates, recordings,
    representatives: Object.fromEntries(Object.entries(representatives).map(([device, run]) => [device, run?.id || null])),
    wordpressHints: Object.fromEntries(Object.entries(representatives).map(([device, run]) => [device, wordpressHints(run?.lhr)])),
    provenance, cta: cta || null,
  };
}

export async function writeReport(dir, data) {
  await writeFile(`${dir}/report.json`, `${JSON.stringify(data, null, 2)}\n`);
  await writeFile(`${dir}/report.html`, renderHtml(data));
  for (const [device, id] of Object.entries(data.representatives || {})) {
    const run = data.runs.find((candidate) => candidate.id === id);
    if (run?.lhr) await writeFile(`${dir}/lighthouse-${device}.json`, `${JSON.stringify(run.lhr, null, 2)}\n`);
  }
}

export function provenance({ chromePath = null, chromeVersion = null, startedAt = new Date().toISOString(), endedAt = null, warm = 0, config = null } = {}) {
  return {
    toolVersion: packageJson.version, lighthouseVersion: lighthousePackage.version, chromeVersion, chromePath,
    os: platform(), cpuCount: cpus().length, nodeVersion: process.version, startedAt, endedAt, warm, config,
  };
}
