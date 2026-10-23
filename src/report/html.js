const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const metrics = [['fcp', 'FCP', 1000], ['lcp', 'LCP', 1000], ['tbt', 'TBT', 1000], ['cls', 'CLS', 1], ['si', 'Speed Index', 1000]];
const scores = [['perf', 'Performance'], ['a11y', 'Accessibility'], ['bp', 'Best Practices'], ['seo', 'SEO']];

function range(summary) { return `range ${summary.min}–${summary.max}`; }
function band(name, value) {
  if (name === 'cls') return value <= 0.1 ? 'pass' : value <= 0.25 ? 'needs improvement' : 'poor';
  if (name === 'lcp') return value <= 2500 ? 'pass' : value <= 4000 ? 'needs improvement' : 'poor';
  return value <= 1800 ? 'pass' : value <= 3000 ? 'needs improvement' : 'poor';
}
function value(metric, divisor) { return divisor === 1 ? metric.toFixed(3) : `${(metric / divisor).toFixed(1)} s`; }
function representativeRuns(data) {
  return Object.entries(data.representatives || {}).map(([device, id]) => [device, data.runs.find((run) => run.id === id)]).filter(([, run]) => run?.lhr);
}
function lcpDetails(data) {
  return representativeRuns(data).map(([device, run]) => {
    const lhr = run.lhr;
    const element = lhr.audits?.['largest-contentful-paint-element']?.details?.items?.[0]?.node?.snippet || 'No LCP element was identified.';
    const lcp = lhr.audits?.['largest-contentful-paint']?.numericValue || 0;
    const before = lhr.audits?.['network-requests']?.details?.items?.filter((request) => request.startTime <= lcp).reduce((groups, request) => {
      const type = request.resourceType || 'other';
      groups[type] = (groups[type] || 0) + (request.transferSize || 0);
      return groups;
    }, {});
    const breakdown = lhr.audits?.['lcp-breakdown-insight']?.details?.items || [];
    return `<h3>${escape(device)}</h3><article><b>LCP element</b><pre>${escape(element)}</pre><span>${breakdown.length ? escape(breakdown.map((item) => JSON.stringify(item)).join('\n')) : 'No LCP breakdown was available.'}</span><span>Requests started before LCP: ${escape(Object.entries(before || {}).map(([type, bytes]) => `${type} ${(bytes / 1024).toFixed(1)} KB`).join(', ') || 'none')}</span></article>`;
  }).join('') || '<p>No representative Lighthouse run was available.</p>';
}
function renderBlocking(data) {
  return representativeRuns(data).map(([device, run]) => {
    const items = run.lhr.audits?.['render-blocking-resources']?.details?.items || [];
    return `<h3>${escape(device)}</h3>${items.length ? `<ul>${items.map((item) => `<li>${escape(item.url || item.node?.snippet || 'resource')}</li>`).join('')}</ul>` : '<p>No render-blocking files identified.</p>'}`;
  }).join('') || '<p>No representative Lighthouse run was available.</p>';
}

export function renderHtml(data) {
  const cards = (device, aggregate) => `
    <h3>${escape(device)}</h3><div class="cards">${scores.map(([key, label]) => {
      const item = aggregate.scores[key]; return `<article><b>${label} ${item.median}</b><span>${range(item)}, median of ${aggregate.n}</span></article>`;
    }).join('')}</div>
    <div class="cards">${metrics.map(([key, label, divisor]) => {
      const item = aggregate.metrics[key]; return `<article><b>${label} ${value(item.median, divisor)}</b><span>${range(item)}, median of ${aggregate.n}; ${band(key, item.median)}</span></article>`;
    }).join('')}</div>`;
  const recordings = Object.entries(data.recordings || {}).map(([device, recording]) => recording.shifts?.length
    ? `<h3>${escape(device)}</h3>${[...recording.shifts].sort((a, b) => b.value - a.value).map((shift) => `<article><b>${shift.value.toFixed(4)} at ${Math.round(shift.t)} ms</b><span>${shift.hypotheses.length ? `correlated with: ${escape(shift.hypotheses.map((item) => item.evidence).join('; '))}` : 'no clear evidence'}</span></article>`).join('')}`
    : `<h3>${escape(device)}</h3><p>No layout shifts recorded</p>`).join('');
  const hints = Object.values(data.wordpressHints || {}).flat().map((hint) => `<li>${escape(hint.text)}</li>`).join('');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>wp-speed-kit report</title><style>
    :root{color-scheme:light dark;--bg:#fafafa;--fg:#18202a;--card:#fff;--muted:#5e6875}@media(prefers-color-scheme:dark){:root{--bg:#111820;--fg:#eef3f7;--card:#1a2530;--muted:#b5c0cc}}*{box-sizing:border-box}body{background:var(--bg);color:var(--fg);font:16px system-ui,sans-serif;line-height:1.5;margin:auto;max-width:1000px;padding:20px}section{margin:28px 0}h1{margin-bottom:0}.muted,span{color:var(--muted);display:block}.cards{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(190px,1fr))}article{background:var(--card);border-radius:8px;padding:12px;margin:8px 0}a{color:inherit}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style>
  <header><h1>local Lighthouse lab result</h1><p><a href="${escape(data.finalUrl)}">${escape(data.finalUrl)}</a></p><p class="muted">${escape(data.provenance?.endedAt || data.provenance?.startedAt || '')} · ${escape((data.devices || []).join(', '))} · ${data.runsRequested} runs</p><p class="muted">Warm-up requests can warm the server cache; every Lighthouse run uses a fresh browser profile.</p></header>
  <section><h2>Scores</h2>${Object.entries(data.aggregates || {}).map(([device, aggregate]) => cards(device, aggregate).split('<div class="cards">').slice(0, 2).join('<div class="cards">')).join('')}</section>
  <section><h2>Metrics</h2>${Object.entries(data.aggregates || {}).map(([device, aggregate]) => `<h3>${escape(device)}</h3><div class="cards">${metrics.map(([key, label, divisor]) => { const item = aggregate.metrics[key]; return `<article><b>${label} ${value(item.median, divisor)}</b><span>${range(item)}, median of ${aggregate.n}; ${band(key, item.median)}</span></article>`; }).join('')}</div>`).join('')}</section>
  <section><h2>What delays the largest image</h2>${lcpDetails(data)}</section>
  <section><h2>What moves the page</h2>${recordings || '<p>No layout shifts recorded</p>'}</section>
  <section><h2>Render-blocking files</h2>${renderBlocking(data)}</section>
  <section><h2>WordPress hints</h2>${hints ? `<ul>${hints}</ul>` : '<p>No WordPress-specific evidence found.</p>'}</section>
  <section><h2>Method and provenance</h2><p>Sequential local Lighthouse lab runs use per-metric medians and ranges. The report names the median of successful runs.</p><pre>${escape(JSON.stringify(data.provenance, null, 2))}</pre></section>
  <footer>Made with <a href="https://github.com/muhdroid/wp-speed-kit">wp-speed-kit</a>${data.cta ? `<p>${escape(data.cta)}</p>` : ''}</footer></html>`;
}
