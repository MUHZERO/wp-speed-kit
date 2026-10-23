import { parseArgs } from 'node:util';

const FAIL_ON_METRICS = new Set(['lcp', 'fcp', 'tbt', 'cls', 'si', 'perf', 'a11y', 'bp', 'seo']);

export class UsageError extends Error {
  exitCode = 1;

  constructor(message) {
    super(message);
    this.name = 'UsageError';
  }
}

function usageError(error) {
  return error instanceof UsageError ? error : new UsageError(error.message);
}

function parseOptions(args, options) {
  try {
    return parseArgs({ args, options, strict: true, allowPositionals: true });
  } catch (error) {
    throw usageError(error);
  }
}

function positiveInteger(value, name, { minimum = 1 } = {}) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum) {
    throw new UsageError(`--${name} must be an integer of at least ${minimum}`);
  }
  return number;
}

function validUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new UsageError(`Invalid URL: ${value}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UsageError(`Only http: and https: URLs are supported: ${value}`);
  }
  return value;
}

function assertPositionals(positionals, count, command, label) {
  if (positionals.length !== count) {
    throw new UsageError(`${command} requires exactly ${count} ${label}`);
  }
}

function audit(args) {
  const { values, positionals } = parseOptions(args, {
    runs: { type: 'string', default: '5' },
    device: { type: 'string', default: 'mobile' },
    warm: { type: 'string', default: '2' },
    out: { type: 'string', default: './wpsk-report' },
    cta: { type: 'string' },
    json: { type: 'boolean', default: false },
    'fail-on': { type: 'string' },
    timeout: { type: 'string', default: '120' },
    'chrome-path': { type: 'string' },
    'chrome-flags': { type: 'string', multiple: true, default: [] },
  });
  if (positionals.length === 0) throw new UsageError('audit requires at least one URL');
  if (!['mobile', 'desktop', 'both'].includes(values.device)) {
    throw new UsageError('--device must be mobile, desktop, or both');
  }

  return {
    command: 'audit',
    urls: positionals.map(validUrl),
    files: [],
    options: {
      runs: positiveInteger(values.runs, 'runs'),
      device: values.device,
      warm: positiveInteger(values.warm, 'warm', { minimum: 0 }),
      out: values.out,
      cta: values.cta ?? null,
      json: values.json,
      failOn: values['fail-on'] === undefined ? null : parseFailOn(values['fail-on']),
      timeout: positiveInteger(values.timeout, 'timeout'),
      chromePath: values['chrome-path'] ?? null,
      chromeFlags: values['chrome-flags'],
    },
  };
}

function cls(args) {
  const { values, positionals } = parseOptions(args, {
    device: { type: 'string', default: 'mobile' },
    shots: { type: 'boolean', default: false },
    json: { type: 'boolean', default: false },
    'chrome-path': { type: 'string' },
  });
  assertPositionals(positionals, 1, 'cls', 'URL');
  if (!['mobile', 'desktop'].includes(values.device)) {
    throw new UsageError('--device must be mobile or desktop');
  }

  return {
    command: 'cls',
    urls: [validUrl(positionals[0])],
    files: [],
    options: {
      device: values.device,
      shots: values.shots,
      json: values.json,
      chromePath: values['chrome-path'] ?? null,
    },
  };
}

function compare(args) {
  const { values, positionals } = parseOptions(args, {
    out: { type: 'string', default: './compare' },
    png: { type: 'boolean', default: false },
  });
  assertPositionals(positionals, 2, 'compare', 'report files');

  return {
    command: 'compare',
    urls: [],
    files: positionals,
    options: { out: values.out, png: values.png },
  };
}

export function parseFailOn(source) {
  if (typeof source !== 'string' || source.length === 0) {
    throw new UsageError('--fail-on must contain one or more metric rules');
  }

  return source.split(',').map((part) => {
    const match = /^(lcp|fcp|tbt|cls|si|perf|a11y|bp|seo)([<>])([0-9]+(?:\.[0-9]+)?)$/.exec(part);
    if (!match || !FAIL_ON_METRICS.has(match?.[1])) {
      throw new UsageError(`Invalid --fail-on rule: ${part}`);
    }
    return { metric: match[1], op: match[2], value: Number(match[3]) };
  });
}

export function parseCli(argv) {
  if (argv.length === 0 || (argv.length === 1 && ['--help', '-h'].includes(argv[0]))) {
    return { command: 'help', urls: [], files: [], options: {} };
  }

  const [command, ...args] = argv;
  if (command === 'audit') return audit(args);
  if (command === 'cls') return cls(args);
  if (command === 'compare') return compare(args);
  if (command === 'help') return { command: 'help', urls: [], files: [], options: {} };
  throw new UsageError(`Unknown command: ${command}`);
}
