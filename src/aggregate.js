const SCORE_NAMES = ['perf', 'a11y', 'bp', 'seo'];
const METRIC_NAMES = ['fcp', 'lcp', 'tbt', 'si', 'cls'];
// Floor for the divisor so a median of 0 (common for CLS and TBT) does not blow up the distance.
const MIN_SCALE = { fcp: 1, lcp: 1, tbt: 1, si: 1, cls: 0.01 };

export function median(values, kind) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  if (kind === 'score') return sorted[middle - 1];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function summary(values, kind) {
  if (values.length === 0) return { median: null, min: null, max: null };
  return { median: median(values, kind), min: Math.min(...values), max: Math.max(...values) };
}

function metricValue(run, name) {
  return name === 'cls' ? run.cls : run.metrics[name];
}

export function pickRepresentative(okRuns, medians) {
  if (okRuns.length === 0) return null;

  let bestRun = okRuns[0];
  let bestDistance = Infinity;
  for (const run of okRuns) {
    const distance = METRIC_NAMES.reduce((total, name) => {
      const value = metricValue(run, name);
      const midpoint = medians[name].median;
      return total + Math.abs(value - midpoint) / Math.max(midpoint, MIN_SCALE[name]);
    }, 0);
    if (distance < bestDistance - 1e-12) {
      bestRun = run;
      bestDistance = distance;
    }
  }
  return bestRun.id;
}

export function aggregateRuns(runs) {
  const okRuns = runs.filter((run) => run.ok);
  const scores = Object.fromEntries(
    SCORE_NAMES.map((name) => [name, summary(okRuns.map((run) => run.scores[name]), 'score')]),
  );
  const metrics = Object.fromEntries(
    METRIC_NAMES.map((name) => [name, summary(okRuns.map((run) => metricValue(run, name)), 'metric')]),
  );

  return {
    n: okRuns.length,
    scores,
    metrics,
    representativeId: pickRepresentative(okRuns, metrics),
  };
}

export function checkBudgets(aggregate, rules) {
  return rules.flatMap((rule) => {
    const group = ['perf', 'a11y', 'bp', 'seo'].includes(rule.metric) ? aggregate.scores : aggregate.metrics;
    const actual = group[rule.metric]?.median;
    if (actual === null || actual === undefined) return [];
    const broken = rule.op === '>' ? actual > rule.value : actual < rule.value;
    return broken ? [{ rule, actual }] : [];
  });
}

export function exitCodeFor({ requested, succeeded, broken }) {
  if (succeeded === 0) return 1;
  if (succeeded < requested) return 2;
  if (broken.length > 0) return 3;
  return 0;
}
