import assert from 'node:assert/strict';
import test from 'node:test';

import { planRuns } from '../src/commands/audit.js';
import { ctaHtml } from '../src/report/format.js';

test('--runs counts per device and alternates devices', () => {
  assert.deepEqual(planRuns(['mobile'], 3).map((run) => `${run.device}-${run.n}`), ['mobile-1', 'mobile-2', 'mobile-3']);
  assert.deepEqual(planRuns(['mobile', 'desktop'], 2).map((run) => `${run.device}-${run.n}`), ['mobile-1', 'desktop-1', 'mobile-2', 'desktop-2']);
});

test('--cta renders text, and a link only for http(s) URLs', () => {
  assert.equal(ctaHtml(null), '');
  assert.equal(ctaHtml('Need help?|https://example.com/contact'), '<p><a href="https://example.com/contact">Need help?</a></p>');
  assert.equal(ctaHtml('Call us|javascript:alert(1)'), '<p>Call us</p>');
  assert.equal(ctaHtml('<b>hi</b>'), '<p>&lt;b&gt;hi&lt;/b&gt;</p>');
});
