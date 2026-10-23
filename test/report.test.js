import assert from 'node:assert/strict';
import test from 'node:test';

import { buildReportData } from '../src/report/json.js';
import { renderHtml } from '../src/report/html.js';
import { wordpressHints } from '../src/report/wordpress.js';

const summary = (median, min = median, max = median) => ({ median, min, max });
const aggregate = {
  n: 5,
  scores: { perf: summary(93, 87, 97), a11y: summary(90), bp: summary(80), seo: summary(95) },
  metrics: { fcp: summary(1000), lcp: summary(2100), tbt: summary(100), cls: summary(0), si: summary(1500) },
  representativeId: 'mobile-1',
};

function data(cta = null) {
  return buildReportData({
    url: 'https://example.test/', finalUrl: 'https://example.test/', devices: ['mobile'], runsRequested: 5,
    runs: [{ id: 'mobile-1', device: 'mobile', ok: true, scores: {}, metrics: {}, cls: 0, lhr: {} }],
    aggregates: { mobile: aggregate }, recordings: { mobile: { shifts: [], cls: 0 } }, provenance: { toolVersion: '0.1.0' }, cta,
  });
}

test('renders the specified labels, ranges, CTA, and empty shift state', () => {
  const html = renderHtml(data('Need this fixed?'));
  assert.match(html, /local Lighthouse lab result/);
  assert.match(html, /median of 5/);
  assert.match(html, /range 87–97/);
  assert.match(html, /Need this fixed\?/);
  assert.match(html, /No layout shifts recorded/);
  assert.doesNotMatch(renderHtml(data()), /Need this fixed\?/);
});

test('only returns WordPress hints when WordPress is detected', () => {
  assert.deepEqual(wordpressHints({ audits: { 'network-requests': { details: { items: [{ url: 'https://example.test/site.css' }] } } } }), []);
  const hints = wordpressHints({ audits: {
    'network-requests': { details: { items: [{ url: 'https://example.test/wp-content/uploads/hero.jpg' }] } },
    'largest-contentful-paint-element': { details: { items: [{ node: { snippet: '<img loading="lazy" src="/wp-content/uploads/hero.jpg">' } }] } },
  } });
  assert.deepEqual(hints.map(({ id }) => id), ['lcp-image-lazy']);
});
