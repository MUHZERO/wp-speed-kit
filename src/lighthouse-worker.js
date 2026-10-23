// Runs one Lighthouse pass in a worker thread. Lighthouse can leave a Page.navigate call pending when a page never
// loads; when Chrome is closed afterwards that call rejects with nobody listening. Inside a worker that rejection
// cannot reach the main process, and the main thread ends the worker with terminate().
import { parentPort, workerData } from 'node:worker_threads';
import lighthouse from 'lighthouse';
import desktopConfig from 'lighthouse/core/config/desktop-config.js';

process.on('unhandledRejection', () => {});

const { url, port, device, maxWaitForLoad } = workerData;
try {
  const result = await lighthouse(url, { port, output: 'json', logLevel: 'error', maxWaitForLoad },
    device === 'desktop' ? desktopConfig : undefined);
  parentPort.postMessage({ lhr: result.lhr });
} catch (error) {
  parentPort.postMessage({ error: error.message || String(error) });
}
