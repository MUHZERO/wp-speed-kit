const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const scoreNames = [['perf', 'Performance'], ['a11y', 'Accessibility'], ['bp', 'Best Practices'], ['seo', 'SEO']];
const metricNames = [['fcp', 'FCP'], ['lcp', 'LCP'], ['tbt', 'TBT'], ['cls', 'CLS'], ['si', 'Speed Index']];
function signed(value, unit = '') { return `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(unit ? 1 : 0)}${unit}`; }

export function renderCompare(before, after) {
  const device = Object.keys(before.aggregates)[0];
  const first = before.aggregates[device];
  const second = after.aggregates[Object.keys(after.aggregates)[0]];
  const changed = ['toolVersion', 'lighthouseVersion', 'chromeVersion'].some((key) => before.provenance?.[key] !== after.provenance?.[key]) || before.runsRequested !== after.runsRequested;
  const rows = (names, group, divisor = 1, suffix = '') => names.map(([key, label]) => {
    const oldValue = first[group][key].median; const newValue = second[group][key].median;
    return `<tr><th>${label}</th><td>${oldValue / divisor}${suffix}</td><td>${newValue / divisor}${suffix}</td><td>${signed((newValue - oldValue) / divisor, suffix)}</td></tr>`;
  }).join('');
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>wp-speed-kit comparison</title><style>body{font:16px system-ui,sans-serif;max-width:1000px;margin:auto;padding:20px}table{border-collapse:collapse;width:100%;margin:20px 0}td,th{border:1px solid #bbb;padding:8px;text-align:left}.warning{background:#fff4c2;padding:12px}</style><h1>local Lighthouse lab result comparison</h1>${changed ? '<p class="warning">Warning: these reports use different tool, Lighthouse, Chrome versions, or run counts; differences may not be directly comparable.</p>' : ''}<h2>Scores</h2><table><tr><th>Metric</th><th>Before</th><th>After</th><th>Difference</th></tr>${rows(scoreNames, 'scores')}</table><h2>Metrics</h2><table><tr><th>Metric</th><th>Before</th><th>After</th><th>Difference</th></tr>${rows(metricNames.filter(([key]) => key !== 'cls'), 'metrics', 1000, ' s')}${rows([['cls', 'CLS']], 'metrics', 1, '')}</table><h2>Layout shifts</h2><p>Before: ${escape(Object.values(before.recordings || {}).reduce((sum, value) => sum + (value.cls || 0), 0))}; after: ${escape(Object.values(after.recordings || {}).reduce((sum, value) => sum + (value.cls || 0), 0))}</p>`;
}
