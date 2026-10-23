const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const metrics = [['fcp', 'FCP'], ['lcp', 'LCP'], ['tbt', 'TBT'], ['cls', 'CLS'], ['si', 'Speed Index']];
const scores = [['perf', 'Performance'], ['a11y', 'Accessibility'], ['bp', 'Best Practices'], ['seo', 'SEO']];

function scoreValue(value) { return Math.round(value); }
function metricValue(name, value) {
  if (name === 'cls') return value.toFixed(3);
  if (name === 'tbt') return `${Math.round(value)} ms`;
  return `${(value / 1000).toFixed(1)} s`;
}
function range(summary, name = null) {
  if (!name) return `range ${scoreValue(summary.min)}–${scoreValue(summary.max)}`;
  if (name === 'cls') return `range ${summary.min.toFixed(3)}–${summary.max.toFixed(3)}`;
  if (name === 'tbt') return `range ${Math.round(summary.min)}–${Math.round(summary.max)} ms`;
  return `range ${(summary.min / 1000).toFixed(1)}–${(summary.max / 1000).toFixed(1)} s`;
}
function band(name, value) {
  const thresholds = {
    fcp: [1800, 3000], lcp: [2500, 4000], tbt: [200, 600], cls: [0.1, 0.25], si: [3400, 5800],
  };
  const [good, poor] = thresholds[name];
  return value <= good ? 'good' : value <= poor ? 'needs improvement' : 'poor';
}
function representativeRuns(data) {
  return Object.entries(data.representatives || {}).map(([device, id]) => [device, data.runs.find((run) => run.id === id)]).filter(([, run]) => run?.lhr);
}
function lcpBreakdown(lhr) {
  const items = lhr.audits?.['lcp-breakdown-insight']?.details?.items || [];
  const node = items.find((item) => item.type === 'node');
  const table = items.find((item) => item.type === 'table');
  const durations = Object.fromEntries((table?.items || []).map((item) => [item.subpart, item.duration]));
  const rows = [
    ['Time to first byte', 'timeToFirstByte'],
    ['Resource load delay', 'resourceLoadDelay'],
    ['Resource load duration', 'resourceLoadDuration'],
    ['Element render delay', 'elementRenderDelay'],
  ].map(([label, subpart]) => `<tr><th>${label}</th><td>${durations[subpart] === undefined ? '—' : `${Math.round(durations[subpart])} ms`}</td></tr>`).join('');
  return `${node ? `<p>${escape(node.nodeLabel)} <code>${escape(node.selector)}</code></p>` : '<p>No LCP element was identified.</p>'}<table><tbody>${rows}</tbody></table>`;
}
function requestsBeforeLcp(lhr) {
  const lcp = lhr.audits?.metrics?.details?.items?.[0]?.observedLargestContentfulPaint;
  if (lcp === undefined) return 'none';
  const groups = (lhr.audits?.['network-requests']?.details?.items || [])
    .filter((request) => request.networkRequestTime < lcp)
    .reduce((result, request) => {
      const type = request.resourceType || 'other';
      const group = result.get(type) || { count: 0, transferSize: 0 };
      group.count += 1;
      group.transferSize += request.transferSize || 0;
      result.set(type, group);
      return result;
    }, new Map());
  return [...groups].map(([type, group]) => `${escape(type)}: ${group.count} (${(group.transferSize / 1024).toFixed(1)} KB)`).join(', ') || 'none';
}
function lcpDetails(data) {
  return representativeRuns(data).map(([device, run]) => {
    const lhr = run.lhr;
    return `<h3>${escape(device)}</h3><article><b>LCP element</b>${lcpBreakdown(lhr)}<span>Requests started before LCP: ${requestsBeforeLcp(lhr)}</span></article>`;
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
      const item = aggregate.scores[key]; return `<article><b>${label} ${scoreValue(item.median)}</b><span>${range(item)}, median of ${aggregate.n}</span></article>`;
    }).join('')}</div>
    <div class="cards">${metrics.map(([key, label]) => {
      const item = aggregate.metrics[key]; return `<article><b>${label} ${metricValue(key, item.median)}</b><span>${range(item, key)}, median of ${aggregate.n}; ${band(key, item.median)}</span></article>`;
    }).join('')}</div>`;
  const recordings = Object.entries(data.recordings || {}).map(([device, recording]) => recording.shifts?.length
    ? `<h3>${escape(device)}</h3>${[...recording.shifts].sort((a, b) => b.value - a.value).map((shift) => `<article><b>${shift.value.toFixed(4)} at ${Math.round(shift.t)} ms</b><span>${shift.hypotheses.length ? `correlated with: ${escape(shift.hypotheses.map((item) => item.evidence).join('; '))}` : 'no clear evidence'}</span></article>`).join('')}`
    : `<h3>${escape(device)}</h3><p>No layout shifts recorded</p>`).join('');
  const hints = Object.values(data.wordpressHints || {}).flat().map((hint) => `<li>${escape(hint.text)}</li>`).join('');
  const reportDate = new Date(data.provenance?.endedAt || data.provenance?.startedAt);
  const date = Number.isNaN(reportDate.valueOf()) ? '' : `${String(reportDate.getUTCDate()).padStart(2, '0')} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][reportDate.getUTCMonth()]} ${reportDate.getUTCFullYear()}, ${String(reportDate.getUTCHours()).padStart(2, '0')}:${String(reportDate.getUTCMinutes()).padStart(2, '0')} UTC`;
  const runLabel = `${data.runsRequested} ${data.runsRequested === 1 ? 'run' : 'runs'}`;
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>wp-speed-kit report</title><style>
    :root{color-scheme:light dark;--bg:#fafafa;--fg:#18202a;--card:#fff;--muted:#5e6875}@media(prefers-color-scheme:dark){:root{--bg:#111820;--fg:#eef3f7;--card:#1a2530;--muted:#b5c0cc}}*{box-sizing:border-box}body{background:var(--bg);color:var(--fg);font:16px system-ui,sans-serif;line-height:1.5;margin:auto;max-width:1000px;padding:20px}section{margin:28px 0}h1{margin-bottom:0}.muted,span{color:var(--muted);display:block}.cards{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(190px,1fr))}article{background:var(--card);border-radius:8px;padding:12px;margin:8px 0}a{color:inherit}pre{white-space:pre-wrap;overflow-wrap:anywhere}table{border-collapse:collapse;margin:8px 0}th,td{border:1px solid var(--muted);padding:4px 8px;text-align:left}</style>
  <header><h1>wp-speed-kit report</h1><p>local Lighthouse lab result</p><p><a href="${escape(data.finalUrl)}">${escape(data.finalUrl)}</a></p><p class="muted">${date} · ${escape((data.devices || []).join(', '))} · ${runLabel}</p><p class="muted">Warm-up requests can warm the server cache; every Lighthouse run uses a fresh browser profile.</p></header>
  <section><h2>Scores</h2>${Object.entries(data.aggregates || {}).map(([device, aggregate]) => cards(device, aggregate).split('<div class="cards">').slice(0, 2).join('<div class="cards">')).join('')}</section>
  <section><h2>Metrics</h2>${Object.entries(data.aggregates || {}).map(([device, aggregate]) => `<h3>${escape(device)}</h3><div class="cards">${metrics.map(([key, label]) => { const item = aggregate.metrics[key]; return `<article><b>${label} ${metricValue(key, item.median)}</b><span>${range(item, key)}, median of ${aggregate.n}; ${band(key, item.median)}</span></article>`; }).join('')}</div>`).join('')}</section>
  <section><h2>What delays the largest image</h2>${lcpDetails(data)}</section>
  <section><h2>What moves the page</h2>${recordings || '<p>No layout shifts recorded</p>'}</section>
  <section><h2>Render-blocking files</h2>${renderBlocking(data)}</section>
  <section><h2>WordPress hints</h2>${hints ? `<ul>${hints}</ul>` : '<p>No WordPress-specific evidence found.</p>'}</section>
  <section><h2>Method and provenance</h2><p>Sequential local Lighthouse lab runs use per-metric medians and ranges. The report names the median of successful runs.</p><pre>${escape(JSON.stringify(data.provenance, null, 2))}</pre></section>
  <footer>Made with <a href="https://github.com/muhdroid/wp-speed-kit">wp-speed-kit</a>${data.cta ? `<p>${escape(data.cta)}</p>` : ''}</footer></html>`;
}
