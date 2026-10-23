// Number formatting and Lighthouse bands shared by the report and the comparison page.
export const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
export const METRICS = [['fcp', 'FCP'], ['lcp', 'LCP'], ['tbt', 'TBT'], ['cls', 'CLS'], ['si', 'Speed Index']];
export const SCORES = [['perf', 'Performance'], ['a11y', 'Accessibility'], ['bp', 'Best Practices'], ['seo', 'SEO']];

export function scoreValue(value) { return Math.round(value); }

export function metricValue(name, value) {
  if (name === 'cls') return value.toFixed(3);
  if (name === 'tbt') return `${Math.round(value)} ms`;
  return `${(value / 1000).toFixed(1)} s`;
}

// A signed difference in the metric's own unit: "+38", "−1.9 s", "+12 ms", "−0.050".
export function signedDiff(name, diff) {
  const sign = diff >= 0 ? '+' : '−';
  const size = Math.abs(diff);
  if (!name) return `${sign}${Math.round(size)}`;
  if (name === 'cls') return `${sign}${size.toFixed(3)}`;
  if (name === 'tbt') return `${sign}${Math.round(size)} ms`;
  return `${sign}${(size / 1000).toFixed(1)} s`;
}

export function band(name, value) {
  const thresholds = {
    fcp: [1800, 3000], lcp: [2500, 4000], tbt: [200, 600], cls: [0.1, 0.25], si: [3400, 5800],
  };
  const [good, poor] = thresholds[name];
  return value <= good ? 'good' : value <= poor ? 'needs improvement' : 'poor';
}
