import { escape, METRICS, metricValue, SCORES, scoreValue, signedDiff } from './format.js';

export function renderCompare(before, after) {
  const device = Object.keys(before.aggregates)[0];
  const first = before.aggregates[device];
  const second = after.aggregates[Object.keys(after.aggregates)[0]];
  const changed = ['toolVersion', 'lighthouseVersion', 'chromeVersion'].some((key) => before.provenance?.[key] !== after.provenance?.[key]) || before.runsRequested !== after.runsRequested;
  const rows = (names, group) => names.map(([key, label]) => {
    const oldValue = first[group][key].median; const newValue = second[group][key].median;
    const show = (value) => (group === 'scores' ? scoreValue(value) : metricValue(key, value));
    return `<tr><th>${label}</th><td>${show(oldValue)}</td><td>${show(newValue)}</td><td>${signedDiff(group === 'scores' ? null : key, newValue - oldValue)}</td></tr>`;
  }).join('');
  const where = (report) => `${escape(report.finalUrl || report.url || '')} · ${escape((report.provenance?.startedAt || '').slice(0, 16).replace('T', ' '))} UTC`;
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>wp-speed-kit comparison</title><style>body{font:16px system-ui,sans-serif;max-width:1000px;margin:auto;padding:20px}table{border-collapse:collapse;width:100%;margin:20px 0}td,th{border:1px solid #bbb;padding:8px;text-align:left}.warning{background:#fff4c2;padding:12px}</style><h1>wp-speed-kit comparison</h1><p>local Lighthouse lab result</p><p>Before: ${where(before)}<br>After: ${where(after)}</p>${changed ? '<p class="warning">Warning: these reports use different tool, Lighthouse, Chrome versions, or run counts; differences may not be directly comparable.</p>' : ''}<h2>Scores</h2><table><tr><th>Metric</th><th>Before</th><th>After</th><th>Difference</th></tr>${rows(SCORES, 'scores')}</table><h2>Metrics</h2><table><tr><th>Metric</th><th>Before</th><th>After</th><th>Difference</th></tr>${rows(METRICS, 'metrics')}</table><h2>Layout shifts</h2><p>Before: ${escape(Object.values(before.recordings || {}).reduce((sum, value) => sum + (value.cls || 0), 0))}; after: ${escape(Object.values(after.recordings || {}).reduce((sum, value) => sum + (value.cls || 0), 0))}</p>`;
}
