import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launch } from 'chrome-launcher';

export async function launchChrome({ chromePath, flags = [] } = {}) {
  const userDataDir = await mkdtemp(join(tmpdir(), 'wpsk-chrome-'));
  let chrome;
  try {
    chrome = await launch({
      chromePath: chromePath || undefined,
      chromeFlags: ['--headless=new', ...flags],
      handleSIGINT: false,
      userDataDir,
    });
  } catch (error) {
    await rm(userDataDir, { recursive: true, force: true });
    throw error;
  }

  return {
    port: chrome.port,
    userDataDir,
    async kill() {
      chrome.kill();
      await rm(userDataDir, { recursive: true, force: true });
    },
  };
}

const MOBILE_USER_AGENT = 'Mozilla/5.0 (Linux; Android 12; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
const DESKTOP_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export function deviceProfile(device) {
  if (device === 'mobile') {
    return {
      width: 412, height: 823, dpr: 1.75, mobile: true, cpu: 4,
      network: { latency: 150, download: 200_000, upload: 93_750 },
      userAgent: MOBILE_USER_AGENT,
    };
  }
  if (device === 'desktop') {
    return { width: 1350, height: 940, dpr: 1, mobile: false, cpu: 1, network: null, userAgent: DESKTOP_USER_AGENT };
  }
  throw new Error(`Unsupported device: ${device}`);
}

export async function applyProfile(cdp, profile) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: profile.width,
    height: profile.height,
    deviceScaleFactor: profile.dpr,
    mobile: profile.mobile,
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu });
  if (profile.network) {
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: profile.network.latency,
      downloadThroughput: profile.network.download,
      uploadThroughput: profile.network.upload,
      connectionType: 'cellular4g',
    });
  }
  await cdp.send('Emulation.setUserAgentOverride', { userAgent: profile.userAgent });
}
