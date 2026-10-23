import assert from 'node:assert/strict';
import test from 'node:test';

import lhrSample from './fixtures/lhr-sample.json' with { type: 'json' };
import { aggregateRuns } from '../src/aggregate.js';
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

function sampleData(lhr = lhrSample, runsRequested = 1) {
  const run = {
    id: 'mobile-1', device: 'mobile', ok: true, lhr,
    scores: {
      perf: Math.round(lhr.categories.performance.score * 100), a11y: Math.round(lhr.categories.accessibility.score * 100),
      bp: Math.round(lhr.categories['best-practices'].score * 100), seo: Math.round(lhr.categories.seo.score * 100),
    },
    metrics: {
      fcp: lhr.audits['first-contentful-paint'].numericValue, lcp: lhr.audits['largest-contentful-paint'].numericValue,
      tbt: lhr.audits['total-blocking-time'].numericValue, si: lhr.audits['speed-index'].numericValue,
    },
    cls: lhr.audits['cumulative-layout-shift'].numericValue,
  };
  return buildReportData({
    url: lhr.finalDisplayedUrl, finalUrl: lhr.finalDisplayedUrl, devices: ['mobile'], runsRequested,
    runs: [run], aggregates: { mobile: aggregateRuns([run]) }, recordings: {},
    provenance: { startedAt: '2026-10-23T12:52:00.000Z' }, cta: null,
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

test('formats report metrics, ranges, and scores in their displayed units', () => {
  const html = renderHtml(sampleData());
  assert.match(html, /FCP 1\.3 s/);
  assert.match(html, /LCP 2\.0 s/);
  assert.match(html, /Speed Index 4\.5 s/);
  assert.match(html, /range 1\.3–1\.3 s/);
  assert.match(html, /Performance 96/);
  assert.doesNotMatch(html, /2039\.5010000000002/);
});

test('formats TBT consistently in milliseconds', () => {
  const html = renderHtml(sampleData());
  assert.match(html, /TBT 41 ms/);
  assert.match(html, /range 41–41 ms/);
  assert.doesNotMatch(html, /TBT 0\.0 s/);
});

test('uses Lighthouse good, needs improvement, and poor metric bands', () => {
  const html = renderHtml(sampleData());
  assert.match(html, /FCP 1\.3 s<\/b><span>range 1\.3–1\.3 s, median of 1; good/);
  assert.match(html, /Speed Index 4\.5 s<\/b><span>range 4\.5–4\.5 s, median of 1; needs improvement/);
  const poor = sampleData();
  poor.aggregates.mobile.metrics.tbt = summary(601);
  assert.match(renderHtml(poor), /TBT 601 ms<\/b><span>range 601–601 ms, median of 1; poor/);
});

test('renders the Lighthouse LCP element and breakdown without raw JSON', () => {
  const html = renderHtml(sampleData());
  assert.match(html, /Laravel وFlutter/);
  assert.match(html, /<code>section\.relative &gt; div\.relative/);
  assert.match(html, /Time to first byte<\/th><td>399 ms/);
  assert.match(html, /Resource load delay<\/th><td>—/);
  assert.match(html, /Element render delay<\/th><td>2305 ms/);
  assert.doesNotMatch(html, /&quot;subpart&quot;|\{&quot;type&quot;/);
  assert.doesNotMatch(html, /No LCP element was identified/);
});

test('groups requests started before observed LCP by resource type', () => {
  const html = renderHtml(sampleData());
  assert.match(html, /Requests started before LCP: Document: 1 \(8\.0 KB\)/);
  assert.match(html, /Script: 7 \(147\.5 KB\)/);
  assert.doesNotMatch(html, /Requests started before LCP: none/);
});

test('renders the requested report header and singular run label', () => {
  const html = renderHtml(sampleData(lhrSample, 1));
  assert.match(html, /<h1>wp-speed-kit report<\/h1>/);
  assert.match(html, /<p>local Lighthouse lab result<\/p>/);
  assert.match(html, /23 Oct 2026, 12:52 UTC · mobile · 1 run/);
  assert.match(renderHtml(sampleData(lhrSample, 2)), /2 runs/);
});

test('escapes page-derived LCP and resource text', () => {
  const lhr = structuredClone(lhrSample);
  const details = lhr.audits['lcp-breakdown-insight'].details.items;
  const node = details.find((item) => item.type === 'node');
  node.nodeLabel = '<script>alert(1)</script>';
  node.selector = '<img src=x>';
  lhr.audits['render-blocking-resources'] = { details: { items: [{ url: 'https://example.test/?q=<script>' }] } };
  const html = renderHtml(sampleData(lhr));
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /<code>&lt;img src=x&gt;<\/code>/);
  assert.match(html, /q=&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
});
