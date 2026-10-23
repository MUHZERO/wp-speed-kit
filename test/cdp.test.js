import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { getChromePath } from 'chrome-launcher';

import { connectPage } from '../src/cdp.js';
import { launchChrome } from '../src/chrome.js';
import { startFixtureServer } from './helpers/server.js';

const fixtures = fileURLToPath(new URL('./fixtures/', import.meta.url));

test('connects to Chrome and removes its fresh profile on kill', async (t) => {
  const chromePath = process.env.CHROME_PATH || (() => {
    try { return getChromePath(); } catch { return null; }
  })();
  if (!chromePath || !existsSync(chromePath)) {
    t.skip('Chrome binary was not found; set CHROME_PATH or install Chrome to run CDP tests');
    return;
  }
  let chrome;
  try {
    chrome = await launchChrome({ chromePath });
  } catch (error) { throw error; }

  const server = await startFixtureServer(fixtures);
  const cdp = await connectPage(chrome.port);
  const profileDir = chrome.userDataDir;
  try {
    await cdp.send('Page.enable');
    const loaded = new Promise((resolve) => cdp.on('Page.loadEventFired', resolve));
    await cdp.send('Page.navigate', { url: `${server.url}/clean.html` });
    await loaded;
    const result = await cdp.send('Runtime.evaluate', { expression: 'document.title', returnByValue: true });
    assert.equal(result.result.value, 'clean');
    await assert.rejects(cdp.send('Nope.method'), /Nope\.method|wasn't found|not found/i);
  } finally {
    cdp.close();
    await server.close();
    await chrome.kill();
  }
  assert.equal(existsSync(profileDir), false);
});
