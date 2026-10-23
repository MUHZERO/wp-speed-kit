import assert from 'node:assert/strict';
import test from 'node:test';

import {
  aggregateRuns,
  checkBudgets,
  exitCodeFor,
  median,
  pickRepresentative,
} from '../src/aggregate.js';

function run(id, overrides = {}) {
  return {
    id,
    device: 'mobile',
    ok: true,
    retried: false,
    scores: { perf: 90, a11y: 90, bp: 90, seo: 90 },
    metrics: { fcp: 1000, lcp: 2000, tbt: 100, si: 1500 },
    cls: 0.1,
    ...overrides,
  };
}

test('calculates score and metric medians with the specified even rules', () => {
  assert.equal(median([3, 1, 2], 'score'), 2);
  assert.equal(median([4, 1, 3, 2], 'score'), 2);
  assert.equal(median([4, 1, 3, 2], 'metric'), 2.5);
});

test('aggregates successful run scores', () => {
  const aggregate = aggregateRuns([
    run('1', { scores: { perf: 80, a11y: 90, bp: 90, seo: 90 } }),
    run('2', { scores: { perf: 95, a11y: 90, bp: 90, seo: 90 } }),
    run('3', { scores: { perf: 90, a11y: 90, bp: 90, seo: 90 } }),
    run('4', { scores: { perf: 70, a11y: 90, bp: 90, seo: 90 } }),
    run('5', { scores: { perf: 92, a11y: 90, bp: 90, seo: 90 } }),
  ]);

  assert.deepEqual(aggregate.scores.perf, { median: 90, min: 70, max: 95 });
});

test('ignores failed runs', () => {
  const aggregate = aggregateRuns([run('ok'), run('failed', { ok: false })]);

  assert.equal(aggregate.n, 1);
});

test('selects the run equal to the medians as representative', () => {
  const runs = [
    run('first', { metrics: { fcp: 900, lcp: 1900, tbt: 90, si: 1400 }, cls: 0.09 }),
    run('median'),
    run('last', { metrics: { fcp: 1100, lcp: 2100, tbt: 110, si: 1600 }, cls: 0.11 }),
  ];
  const aggregate = aggregateRuns(runs);

  assert.equal(pickRepresentative(runs, aggregate.metrics), 'median');
});

test('breaks representative ties by run order', () => {
  const runs = [
    run('earlier', { metrics: { fcp: 900, lcp: 1900, tbt: 90, si: 1400 }, cls: 0.09 }),
    run('later', { metrics: { fcp: 1100, lcp: 2100, tbt: 110, si: 1600 }, cls: 0.11 }),
  ];
  const medians = { fcp: { median: 1000 }, lcp: { median: 2000 }, tbt: { median: 100 }, si: { median: 1500 }, cls: { median: 0.1 } };

  assert.equal(pickRepresentative(runs, medians), 'earlier');
});

test('reports only broken budgets', () => {
  const aggregate = aggregateRuns([run('1', { metrics: { fcp: 1000, lcp: 3000, tbt: 100, si: 1500 } })]);

  assert.deepEqual(checkBudgets(aggregate, [{ metric: 'lcp', op: '>', value: 2500 }]), [
    { rule: { metric: 'lcp', op: '>', value: 2500 }, actual: 3000 },
  ]);
  assert.deepEqual(checkBudgets(aggregate, [{ metric: 'perf', op: '<', value: 90 }]), []);
});

test('uses the documented exit code precedence', () => {
  const broken = [{ rule: {}, actual: 0 }];

  assert.equal(exitCodeFor({ requested: 5, succeeded: 0, broken: [] }), 1);
  assert.equal(exitCodeFor({ requested: 5, succeeded: 3, broken: [] }), 2);
  assert.equal(exitCodeFor({ requested: 5, succeeded: 3, broken }), 2);
  assert.equal(exitCodeFor({ requested: 5, succeeded: 5, broken }), 3);
  assert.equal(exitCodeFor({ requested: 5, succeeded: 5, broken: [] }), 0);
});

test('pickRepresentative is not dominated by a CLS median of 0', () => {
  const base = { ok: true, device: 'mobile', retried: false, scores: { perf: 90, a11y: 90, bp: 90, seo: 90 } };
  const runs = [
    { ...base, id: 'a', metrics: { fcp: 1000, lcp: 2000, tbt: 0, si: 3000 }, cls: 0 },
    { ...base, id: 'b', metrics: { fcp: 1000, lcp: 2000, tbt: 0, si: 3000 }, cls: 0.001 },
    { ...base, id: 'c', metrics: { fcp: 1900, lcp: 3900, tbt: 900, si: 5900 }, cls: 0 },
  ];
  const aggregate = aggregateRuns(runs);
  assert.equal(aggregate.representativeId, 'a');
  assert.notEqual(pickRepresentative([runs[1], runs[2]], aggregate.metrics), 'c');
});
