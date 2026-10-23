import assert from 'node:assert/strict';
import test from 'node:test';

import { parseCli, parseFailOn, UsageError } from '../src/args.js';

test('parses an audit URL with defaults', () => {
  const parsed = parseCli(['audit', 'https://a.test']);

  assert.equal(parsed.command, 'audit');
  assert.deepEqual(parsed.urls, ['https://a.test']);
  assert.equal(parsed.options.runs, 5);
  assert.equal(parsed.options.device, 'mobile');
});

test('rejects unsupported audit URLs', () => {
  assert.throws(() => parseCli(['audit', 'ftp://a.test']), UsageError);
});

test('requires at least one audit run', () => {
  assert.throws(() => parseCli(['audit', 'https://a.test', '--runs', '0']), UsageError);
});

test('rejects unsupported devices', () => {
  assert.throws(() => parseCli(['audit', 'https://a.test', '--device', 'tablet']), UsageError);
});

test('parses compare files and png flag', () => {
  const parsed = parseCli(['compare', 'a.json', 'b.json', '--png']);

  assert.equal(parsed.command, 'compare');
  assert.deepEqual(parsed.files, ['a.json', 'b.json']);
  assert.equal(parsed.options.png, true);
});

test('uses help for an empty invocation or --help', () => {
  assert.equal(parseCli([]).command, 'help');
  assert.equal(parseCli(['--help']).command, 'help');
});

test('parses fail-on rules', () => {
  assert.deepEqual(parseFailOn('lcp>2500,cls>0.1,perf<90'), [
    { metric: 'lcp', op: '>', value: 2500 },
    { metric: 'cls', op: '>', value: 0.1 },
    { metric: 'perf', op: '<', value: 90 },
  ]);
});

test('rejects invalid fail-on rules', () => {
  assert.throws(() => parseFailOn('lcp=1'), UsageError);
});

test('passes --chrome-flags through for every command that starts Chrome', () => {
  assert.deepEqual(parseCli(['audit', 'https://a.test', '--chrome-flags=--no-sandbox']).options.chromeFlags, ['--no-sandbox']);
  assert.deepEqual(parseCli(['cls', 'https://a.test', '--chrome-flags=--no-sandbox']).options.flags, ['--no-sandbox']);
  assert.deepEqual(parseCli(['compare', 'a.json', 'b.json', '--png', '--chrome-flags=--no-sandbox']).options.chromeFlags, ['--no-sandbox']);
});

test('parses the cls screenshot output directory', () => {
  assert.equal(parseCli(['cls', 'https://a.test']).options.out, './wpsk-cls');
  assert.equal(parseCli(['cls', 'https://a.test', '--out', 'screens']).options.out, 'screens');
});
