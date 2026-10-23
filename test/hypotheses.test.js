import assert from 'node:assert/strict';
import test from 'node:test';

import { buildHypotheses } from '../src/cls/hypotheses.js';

const shift = { t: 1000, sources: [{ selector: '#content', before: { x: 0, y: 100, w: 100, h: 20 }, after: { x: 0, y: 200, w: 100, h: 20 } }] };

test('matches a recent matching font load', () => {
  const hypotheses = buildHypotheses(shift, { fonts: [{ t: 950, family: 'Late Font' }], insertions: [], resources: [] }, { text: true, fontFamily: 'Late Font' });
  assert.equal(hypotheses[0].kind, 'font');
});

test('does not match an old font load', () => {
  assert.deepEqual(buildHypotheses(shift, { fonts: [{ t: 300, family: 'Late Font' }], insertions: [], resources: [] }, { text: true, fontFamily: 'Late Font' }), []);
});

test('matches a recent insertion above the moved node', () => {
  const hypotheses = buildHypotheses(shift, { fonts: [], insertions: [{ t: 980, selector: '#banner', above: true }], resources: [] }, {});
  assert.equal(hypotheses[0].kind, 'inserted');
});

test('matches a changed Swiper container', () => {
  const hypotheses = buildHypotheses(shift, { fonts: [], insertions: [], resources: [], classChanges: [{ t: 1000, selector: '.swiper' }] }, { containerClass: 'swiper active' });
  assert.equal(hypotheses[0].kind, 'carousel');
});

test('returns no hypotheses when there are no matching events', () => {
  assert.deepEqual(buildHypotheses(shift, { fonts: [], insertions: [], resources: [] }, {}), []);
});

test('returns every matching hypothesis', () => {
  const hypotheses = buildHypotheses(shift, {
    fonts: [{ t: 950, family: 'Late Font' }],
    insertions: [{ t: 980, selector: '#banner', above: true }],
    resources: [{ t: 990, kind: 'stylesheet', name: '/late.css' }],
    classChanges: [{ t: 1000, selector: '.swiper' }],
  }, { text: true, fontFamily: 'Late Font', containerClass: 'swiper', image: { changedHeight: true, hasDimensions: false, hasAspectRatio: false } });
  assert.deepEqual(hypotheses.map(({ kind }) => kind), ['font', 'image', 'inserted', 'stylesheet', 'carousel']);
});

test('matches an insertion painted several frames later but not one from long before', () => {
  const shift = { t: 2000, value: 0.1, sources: [] };
  const near = buildHypotheses(shift, { insertions: [{ t: 1400, selector: '#banner', above: true }] });
  const far = buildHypotheses(shift, { insertions: [{ t: 500, selector: '#banner', above: true }] });
  assert.ok(near.some((h) => h.kind === 'inserted'));
  assert.ok(!far.some((h) => h.kind === 'inserted'));
});
