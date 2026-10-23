# wp-speed-kit V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Here the owner chose: Codex implements each task with `codex exec`, Claude reviews the diff, runs the checks and commits.

**Goal:** A Node CLI `wpsk` with `audit`, `cls` and `compare` that produces repeatable local Lighthouse lab reports, layout-shift evidence and a before/after page.

**Architecture:** Small ESM modules under `src/`, one responsibility each: argument parsing, aggregation (pure), Chrome launching plus a tiny CDP client, the layout-shift recorder, the Lighthouse runner and audit orchestration, the report writer, and compare. Pure modules are unit-tested; Chrome-based modules are tested against local fixture pages served by `node:http`.

**Tech Stack:** Node 22+ (ESM, built-in `WebSocket`, `util.parseArgs`, `node:test`), `lighthouse@13.5.0` and `chrome-launcher@1.2.2` (exact versions).

**Spec:** `docs/superpowers/specs/2026-10-23-wp-speed-kit-v1-design.md` — read it before every task.

## Global Constraints

- Node `>=22`; `"type": "module"`; no TypeScript, no build step.
- Runtime dependencies exactly: `lighthouse` `13.5.0` and `chrome-launcher` `1.2.2` (the latter is already a Lighthouse dependency; it is declared directly because we import it). No other runtime or dev dependency; tests use `node:test` and `node:assert/strict`.
- Binary name `wpsk`, package name `wp-speed-kit`, license MIT, author "muhdroid (https://muhdroid.com)".
- Only `http:` and `https:` URLs are accepted.
- Exit codes: `0` success, `1` nothing measured / usage error, `2` partial result, `3` a `--fail-on` budget broken.
- stdout carries only JSON when `--json` is set; all progress and errors go to stderr.
- An existing output folder is never overwritten; use `<name>-2`, `<name>-3`…
- Labels: always "local Lighthouse lab result", never "PageSpeed score". Layout-shift causes are "hypotheses" shown as "correlated with".
- No client sites, names or data anywhere in the repo. Test pages are synthetic fixtures under `test/fixtures/`.
- No network calls except to the URL under test.
- Mobile config: viewport 412x823, DPR 1.75, CPU slowdown 4, network 150 ms RTT / 1.6 Mbps down / 750 Kbps up. Desktop: 1350x940, DPR 1, no throttling.
- Report schema: `schemaVersion: 1`.

## Review Focus

1. A URL that redirects (http→https, trailing slash): reports must show the final URL and still measure.
2. A run that times out or Chrome that crashes mid-run: one retry, then a partial report with exit 2, never a stack trace.
3. Even `--runs` (2, 4) and runs where some failed: medians must follow the spec rule and say "median of N".
4. A page with zero layout shifts: the recorder must report none and the report must say so, not show an empty broken section.
5. An output folder that already exists from a previous run: a new numbered folder, the old one untouched.

---

### Task 1: Package skeleton and CLI parsing

**Files:**
- Create: `package.json`, `bin/wpsk.js`, `src/args.js`, `LICENSE`, `.gitignore`
- Test: `test/args.test.js`

**Interfaces:**
- Produces: `parseCli(argv: string[]) => { command: 'audit'|'cls'|'compare'|'help', urls: string[], files: string[], options: object }`, throwing `UsageError` (exported class with `exitCode = 1`) on bad input.
- Options (defaults): audit `runs:5, device:'mobile', warm:2, out:'./wpsk-report', cta:null, json:false, failOn:null, timeout:120, chromePath:null, chromeFlags:[]`; cls `device:'mobile', shots:false, json:false, chromePath:null`; compare `out:'./compare', png:false`.
- `parseFailOn(s: string) => Array<{metric:'lcp'|'fcp'|'tbt'|'cls'|'si'|'perf'|'a11y'|'bp'|'seo', op:'<'|'>', value:number}>`.

- [ ] **Step 1: Write the failing tests** in `test/args.test.js`:
  - `parseCli(['audit','https://a.test'])` → command `audit`, urls `['https://a.test']`, options.runs `5`, device `mobile`.
  - `parseCli(['audit','ftp://a.test'])` throws `UsageError`.
  - `parseCli(['audit','https://a.test','--runs','0'])` throws `UsageError` (runs must be ≥ 1).
  - `parseCli(['audit','https://a.test','--device','tablet'])` throws.
  - `parseCli(['compare','a.json','b.json','--png'])` → files `['a.json','b.json']`, png `true`.
  - `parseCli([])` and `parseCli(['--help'])` → command `help`.
  - `parseFailOn('lcp>2500,cls>0.1,perf<90')` deep-equals the three objects in that order; `parseFailOn('lcp=1')` throws.
- [ ] **Step 2: Run** `node --test test/args.test.js` — expect failures (module missing).
- [ ] **Step 3: Implement** `src/args.js` with `util.parseArgs` (strict, allowPositionals). `bin/wpsk.js` (shebang `#!/usr/bin/env node`) calls `parseCli`, prints help for `help`, prints `UsageError.message` to stderr and exits with its code; commands are dispatched to `src/commands/<name>.js` default exports `run(parsed) => Promise<number>` (exit code), stubs returning 1 until their tasks exist. `package.json`: name, version `0.1.0`, `bin: {wpsk: 'bin/wpsk.js'}`, `engines.node: '>=22'`, `type: module`, `scripts.test: 'node --test test/'`, dependencies pinned as in Global Constraints, `files: ['bin','src','README.md','LICENSE']`. `.gitignore`: `node_modules/`, `wpsk-report*/`, `compare*/`.
- [ ] **Step 4: Run** `node --test test/args.test.js` — all pass; `node bin/wpsk.js --help` exits 0.

### Task 2: Aggregation, representative run, budgets, exit code

**Files:**
- Create: `src/aggregate.js`
- Test: `test/aggregate.test.js`

**Interfaces:**
- Consumes: `parseFailOn` output shape (Task 1).
- A run object (produced by Task 5): `{ id: string, device: 'mobile'|'desktop', ok: boolean, error?: string, retried: boolean, scores: {perf,a11y,bp,seo} (0–100 integers), metrics: {fcp,lcp,tbt,si} (ms), cls (number), lhr?: object }`.
- Produces:
  - `aggregateRuns(runs) => { n: number, scores: {perf:{median,min,max},...}, metrics: {fcp:{median,min,max},...,cls:{median,min,max}}, representativeId: string|null }` using only `ok` runs.
  - `median(values: number[], kind: 'score'|'metric') => number` — odd: middle; even: lower middle for `score`, mean of the two middles for `metric`.
  - `pickRepresentative(okRuns, medians) => string` — smallest sum over fcp,lcp,tbt,si,cls of `|value - median| / max(median, eps)`; ties → earliest run.
  - `checkBudgets(aggregate, rules) => Array<{rule, actual}>` (broken rules only; `si` maps to metrics.si, `perf/a11y/bp/seo` to scores).
  - `exitCodeFor({ requested, succeeded, broken }) => 0|1|2|3` — `succeeded === 0` → 1; `succeeded < requested` → 2; `broken.length` → 3; else 0. Partial wins over budgets.

- [ ] **Step 1: Write failing tests**:
  - `median([3,1,2],'score') === 2`; `median([4,1,3,2],'score') === 2`; `median([4,1,3,2],'metric') === 2.5`.
  - five runs with perf `[80,95,90,70,92]` → scores.perf `{median:90,min:70,max:95}`.
  - a failed run (`ok:false`) is ignored and `n` counts only ok runs.
  - `pickRepresentative` returns the run equal to the medians when one exists; with two equally close runs returns the earlier id.
  - `checkBudgets` with `lcp>2500` and median lcp 3000 → one broken rule with actual 3000; with `perf<90` and median 93 → none.
  - `exitCodeFor` cases: `{requested:5,succeeded:0,broken:[]}`→1, `{5,3,[]}`→2, `{5,3,[x]}`→2, `{5,5,[x]}`→3, `{5,5,[]}`→0.
- [ ] **Step 2: Run** `node --test test/aggregate.test.js` — fails.
- [ ] **Step 3: Implement** `src/aggregate.js` (pure functions, no I/O).
- [ ] **Step 4: Run** — passes.

### Task 3: Chrome launcher, CDP client, fixture server

**Files:**
- Create: `src/chrome.js`, `src/cdp.js`, `test/helpers/server.js`, `test/fixtures/clean.html`
- Test: `test/cdp.test.js`

**Interfaces:**
- Produces:
  - `launchChrome({ chromePath?, flags? }) => Promise<{ port: number, kill: () => Promise<void> }>` — `chrome-launcher` with `--headless=new`, a fresh temp `userDataDir` deleted on kill, extra flags appended.
  - `connectPage(port) => Promise<Cdp>` where `Cdp = { send(method, params?) => Promise<result>, on(event, handler) => void, close() => void }`; uses the first `type:'page'` target from `http://127.0.0.1:<port>/json`, Node's global `WebSocket`, rejects pending sends on close, `send` rejects with the CDP error message.
  - `deviceProfile(device) => { width, height, dpr, mobile, cpu, network: {latency, download, upload} | null, userAgent }` with the Global Constraints values (download/upload in bytes per second).
  - `applyProfile(cdp, profile) => Promise<void>` — `Emulation.setDeviceMetricsOverride`, `Emulation.setCPUThrottlingRate`, `Network.emulateNetworkConditions` when network is set, `Emulation.setUserAgentOverride`.
  - `startFixtureServer(dir) => Promise<{ url: string, close(): Promise<void> }>` (test helper) — serves files from `dir` on 127.0.0.1 random port; supports a `?delay=ms` query that delays the response (late fonts/styles/images), `/redirect?to=/clean.html` answering 302, and `/hang` that never answers.
- [ ] **Step 1: Write failing test** `test/cdp.test.js`: launch Chrome, connect, navigate to the fixture `clean.html`, `Runtime.evaluate` of `document.title` returns `"clean"`; `send('Nope.method')` rejects with an error; after `kill()` the temp profile folder no longer exists. Skip the file with a clear message when `CHROME_PATH` and auto-detection both fail.
- [ ] **Step 2: Run** `node --test test/cdp.test.js` — fails.
- [ ] **Step 3: Implement** the four modules.
- [ ] **Step 4: Run** — passes.

### Task 4: Layout-shift recorder and `wpsk cls`

**Files:**
- Create: `src/cls/inject.js` (exports the injected script as a string), `src/cls/record.js`, `src/cls/hypotheses.js`, `src/commands/cls.js`
- Create fixtures: `test/fixtures/unsized-image.html`, `late-font.html`, `inserted-banner.html`, `late-style.html`, `carousel.html` (+ any small assets they need)
- Test: `test/hypotheses.test.js` (pure), `test/record.test.js` (Chrome)

**Interfaces:**
- Consumes: Task 3.
- Produces:
  - `recordShifts(url, { device, chromePath, shots, outDir? }) => Promise<Recording>` where `Recording = { finalUrl, device, shifts: Shift[], inputShifts: Shift[], cls: number, events: { fonts, insertions, resources }, screenshots: string[] }` and `Shift = { t, value, sources: [{ selector, before:{x,y,w,h}, after:{x,y,w,h} }], hypotheses: Hypothesis[] }`, `Hypothesis = { kind: 'font'|'image'|'inserted'|'stylesheet'|'carousel'|'bar', evidence: string }`.
  - `buildHypotheses(shift, events, dom) => Hypothesis[]` — pure; rules and the 100 ms window from the spec table; returns `[]` when nothing matches.
  - `commands/cls.js` `run(parsed) => Promise<number>` — prints a readable list (biggest first, "correlated with: …" or "no clear evidence") or JSON with `--json`.
- Recording ends at load + 5 s without a new shift, or 30 s. `cls` total excludes `hadRecentInput`. Nodes that cannot be resolved get selector `"(not attributable)"`.
- [ ] **Step 1: Write failing pure tests** for `buildHypotheses`: a font loaded 50 ms before → `font`; loaded 300 ms before → not `font`; an insertion above 20 ms before → `inserted`; container class `swiper` with class change at the shift → `carousel`; no events → `[]`; several matches → all returned.
- [ ] **Step 2: Write failing Chrome tests**: each fixture yields at least one shift whose hypotheses include its expected kind (unsized-image→`image`, late-font→`font`, inserted-banner→`inserted`, late-style→`stylesheet`, carousel→`carousel`); `clean.html` yields `shifts.length === 0` and `cls === 0`.
- [ ] **Step 3: Run** both test files — fail.
- [ ] **Step 4: Implement** the modules; the injected script uses `PerformanceObserver({type:'layout-shift', buffered:true})`, a `MutationObserver` on `document`, `document.fonts` `loadingdone`, and `performance.getEntriesByType('resource')` read at the end.
- [ ] **Step 5: Run** — pass. Also `node bin/wpsk.js cls <fixture-url>/clean.html` exits 0.

### Task 5: Lighthouse runner and `wpsk audit` orchestration

**Files:**
- Create: `src/lighthouse.js`, `src/output.js`, `src/commands/audit.js`
- Test: `test/output.test.js`, `test/audit.test.js` (Chrome + Lighthouse, `--runs 1` on the fixture `clean.html`)

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces:
  - `runLighthouse(url, device, { chromePath, flags, timeout }) => Promise<Run>` (Run shape from Task 2, `lhr` kept) — fresh Chrome per run via `launchChrome`, `lighthouse(url, {port, output:'json', logLevel:'error'}, config)` with the default mobile config for `mobile` and `lighthouse/core/config/desktop-config.js` for `desktop`; `ok:false` with `error` on failure; caller retries once on timeout or a Chrome crash and sets `retried`.
  - `warmUp(url, count, devices) => Promise<{ finalUrl, status }>` — `fetch` with each device's user agent, follows redirects; throws `MeasureError` on DNS/TLS failure or status ≥ 400.
  - `uniqueDir(base) => Promise<string>` — creates and returns `base`, or `base-2`, `base-3`… if it exists.
  - `slugFor(url) => string` — `<host>-<path-slug>`, path slug `home` for `/`.
  - `commands/audit.js` `run(parsed) => Promise<number>` — for each URL: warm-up, runs alternating devices, one `recordShifts` per device, `aggregateRuns`, `checkBudgets`, then `writeReport` (Task 6); multiple URLs → one subfolder each; final exit code is the worst across URLs by `exitCodeFor`.
- [ ] **Step 1: Write failing tests** `test/output.test.js`: `uniqueDir` on an existing folder returns `-2` and leaves the original's files untouched; `slugFor('https://a.test/')` → `a.test-home`, `slugFor('https://a.test/shop/x/')` → `a.test-shop-x`.
- [ ] **Step 2: Write failing test** `test/audit.test.js`: audit `clean.html` with `--runs 1 --device mobile --warm 0 --json` → exit 0, JSON has `schemaVersion 1`, one run `ok:true`, scores between 0 and 100; a URL returning 404 from the fixture server → exit 1 with an error message and no stack trace; `/redirect?to=/clean.html` → exit 0 and `finalUrl` ends with `/clean.html`; `/hang` with `--timeout 5 --runs 1` → exit 1, the run recorded with `ok:false`, `retried:true` and an error, no stack trace.
- [ ] **Step 3: Run** — fail.
- [ ] **Step 4: Implement.**
- [ ] **Step 5: Run** — pass.

### Task 6: Report writer and WordPress hints

**Files:**
- Create: `src/report/json.js`, `src/report/html.js`, `src/report/wordpress.js`
- Test: `test/report.test.js`

**Interfaces:**
- Consumes: aggregate, runs, recordings, provenance.
- Produces:
  - `buildReportData({ url, finalUrl, devices, runsRequested, runs, aggregates, recordings, provenance, cta }) => object` with `schemaVersion: 1`.
  - `renderHtml(data) => string` — one self-contained page with the nine sections of the spec, in that order; light/dark via `prefers-color-scheme`; no external URLs except the links in the footer and the measured URL.
  - `wordpressHints(lhr) => Array<{ id, text }>` — detection from the LHR (generator meta via `network-requests` and `/wp-content/` paths); hints: `litespeed-combined-css-blocking`, `lcp-image-lazy`, `full-page-loader`, `unused-icon-font-preloads`; empty array when WordPress is not detected.
  - `writeReport(dir, data) => Promise<void>` — writes `report.json`, `report.html`, and each representative run's LHR as `lighthouse-<device>.json`.
  - `provenance() => object` — tool version from package.json, Lighthouse version, Chrome version, OS, CPU count, Node version, timestamps.
- [ ] **Step 1: Write failing tests**: with a fixed data object, the HTML contains "local Lighthouse lab result", "median of 5", "range 87–97" for a perf of median 93 min 87 max 97, the CTA text when given and no CTA when not, and "No layout shifts recorded" when a recording has none; `wordpressHints` on a minimal LHR fixture without `/wp-content/` returns `[]`, and on one with a lazy-loaded LCP image under `/wp-content/uploads/` returns `lcp-image-lazy`.
- [ ] **Step 2: Run** — fail. **Step 3: Implement.** **Step 4: Run** — pass.

### Task 7: `wpsk compare`

**Files:**
- Create: `src/commands/compare.js`, `src/report/compare-html.js`
- Test: `test/compare.test.js`

**Interfaces:**
- Consumes: two `report.json` files (schema 1), `launchChrome`/`connectPage` for `--png`.
- Produces: `renderCompare(before, after) => string`; `run(parsed)` writes `compare.html` (and `compare.png` with `--png`, a full-page `Page.captureScreenshot` at 1200px width) into `uniqueDir(out)`.
- [ ] **Step 1: Write failing tests**: differences are shown with sign ("+38" for perf 55→93, "−1.9 s" for LCP 4.0→2.1 s); a version mismatch (different Lighthouse version) shows the warning sentence from the spec; a file with another `schemaVersion` exits 1 with a message.
- [ ] **Step 2: Run** — fail. **Step 3: Implement.** **Step 4: Run** — pass, and `--png` produces a non-empty PNG in the Chrome test.

### Task 8: README, CI, package check

**Files:**
- Create: `README.md`, `.github/workflows/test.yml`, `CHANGELOG.md`

- [ ] **Step 1:** README following the spec outline. Sections that need the demo site (screenshots, "why the median" numbers, before/after) contain a visible "Coming soon: demo results" placeholder; no numbers are invented.
- [ ] **Step 2:** CI on `ubuntu-latest` and `macos-latest`, Node 22, `browser-actions/setup-chrome@v1`, `npm ci`, `npm test`.
- [ ] **Step 3:** `npm pack --dry-run` lists only `bin/`, `src/`, `README.md`, `LICENSE`, `package.json`.

## Not in this plan

The demo WordPress site and the README numbers from it (needs hosting), V1.1 PSI engine, V2 critical CSS.
