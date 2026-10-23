import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { launchChrome } from '../chrome.js';
import { connectPage } from '../cdp.js';
import { uniqueDir } from '../output.js';
import { renderCompare } from '../report/compare-html.js';

async function readReport(file) {
  let report;
  try { report = JSON.parse(await readFile(file, 'utf8')); } catch (error) { throw new Error(`Could not read ${file}: ${error.message}`); }
  if (report.schemaVersion !== 1) throw new Error(`${file} has unsupported schemaVersion ${report.schemaVersion}`);
  return report;
}

async function renderPng(htmlPath) {
  const chrome = await launchChrome();
  let cdp;
  try {
    cdp = await connectPage(chrome.port);
    await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 900, deviceScaleFactor: 1, mobile: false });
    const loaded = new Promise((resolve) => cdp.on('Page.loadEventFired', resolve));
    await cdp.send('Page.navigate', { url: pathToFileURL(htmlPath).href });
    await loaded;
    const image = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    await writeFile(htmlPath.replace(/\.html$/, '.png'), image.data, 'base64');
  } finally {
    cdp?.close();
    await chrome.kill();
  }
}

export default async function run(parsed) {
  try {
    const [before, after] = await Promise.all(parsed.files.map(readReport));
    const out = await uniqueDir(parsed.options.out);
    const htmlPath = `${out}/compare.html`;
    await writeFile(htmlPath, renderCompare(before, after));
    if (parsed.options.png) await renderPng(htmlPath);
    process.stderr.write(`Comparison written to ${out}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    return 1;
  }
}
