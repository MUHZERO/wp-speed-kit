import { aggregateRuns, checkBudgets, exitCodeFor } from '../aggregate.js';
import { deviceProfile } from '../chrome.js';
import { runLighthouse, warmUp } from '../lighthouse.js';
import { slugFor, uniqueDir } from '../output.js';
import { recordShifts } from '../cls/record.js';
import { getChromePath } from 'chrome-launcher';
import { buildReportData, provenance, writeReport } from '../report/json.js';

const retryable = (error = '') => /timed? out|timeout|chrome|cdp|target|connection/i.test(error);
const detectedChromePath = () => { try { return getChromePath(); } catch { return null; } };
const devicesFor = (device) => device === 'both' ? ['mobile', 'desktop'] : [device];

async function oneRun(url, device, options, id) {
  let result = await runLighthouse(url, device, { ...options, flags: options.chromeFlags });
  if (!result.ok && retryable(result.error)) {
    result = await runLighthouse(url, device, { ...options, flags: options.chromeFlags });
    result.retried = true;
  }
  return { ...result, id };
}

async function auditUrl(url, parsed, dir) {
  const { options } = parsed;
  const devices = devicesFor(options.device);
  const startedAt = new Date().toISOString();
  let finalUrl = url;
  try {
    const warmed = await warmUp(url, options.warm, devices.map(deviceProfile), { timeout: options.timeout });
    finalUrl = warmed.finalUrl;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    return { url, finalUrl, runs: [], error: error.message, code: 1 };
  }

  const runs = [];
  for (let index = 0; index < options.runs; index += 1) {
    const device = devices[index % devices.length];
    process.stderr.write(`Measuring ${url} (${device}, run ${index + 1}/${options.runs})\n`);
    const run = await oneRun(finalUrl, device, options, `${device}-${index + 1}`);
    runs.push(run);
    if (run.lhr?.finalDisplayedUrl) finalUrl = run.lhr.finalDisplayedUrl;
    if (!run.ok) process.stderr.write(`Run ${index + 1} failed: ${run.error}\n`);
  }

  const aggregates = Object.fromEntries(devices.map((device) => [device, aggregateRuns(runs.filter((run) => run.device === device))]));
  const recordings = {};
  for (const device of devices) {
    if (!runs.some((run) => run.device === device && run.ok)) continue;
    try {
      recordings[device] = await recordShifts(finalUrl, { device, chromePath: options.chromePath, flags: options.chromeFlags });
    } catch (error) {
      process.stderr.write(`Layout-shift recording failed for ${device}: ${error.message}\n`);
    }
  }
  const broken = Object.values(aggregates).flatMap((aggregate) => checkBudgets(aggregate, options.failOn || []));
  const code = exitCodeFor({ requested: options.runs, succeeded: runs.filter((run) => run.ok).length, broken });
  const chromeUserAgent = runs.find((run) => run.lhr)?.lhr?.userAgent || '';
  const chromeVersion = /Chrome\/([^ ]+)/.exec(chromeUserAgent)?.[1] || null;
  const data = buildReportData({
    url, finalUrl, devices, runsRequested: options.runs, runs, aggregates, recordings,
    provenance: provenance({ chromePath: options.chromePath || detectedChromePath(), chromeVersion, startedAt, endedAt: new Date().toISOString(), warm: options.warm, config: options.device }),
    cta: options.cta,
  });
  if (runs.some((run) => run.ok)) await writeReport(dir, data);
  return { ...data, broken, code };
}

export default async function run(parsed) {
  const root = await uniqueDir(parsed.options.out);
  const multiple = parsed.urls.length > 1;
  const results = [];
  for (const url of parsed.urls) {
    const dir = multiple ? await uniqueDir(`${root}/${slugFor(url)}`) : root;
    results.push(await auditUrl(url, parsed, dir));
  }
  const code = Math.max(...results.map((result) => result.code));
  if (parsed.options.json) process.stdout.write(`${JSON.stringify(multiple ? results : results[0])}\n`);
  else process.stderr.write(`Audit finished with exit code ${code}. Output: ${root}\n`);
  return code;
}
