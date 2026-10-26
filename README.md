<div align="center">

# wp-speed-kit

**Repeatable Lighthouse lab reports for WordPress and WooCommerce pages, with the evidence behind every layout shift and a before/after comparison.**
For developers and freelancers who fix slow sites and need numbers they can rerun and show to a client.

[npm](https://www.npmjs.com/package/wp-speed-kit) · [Usage guide](https://github.com/MUHZERO/wp-speed-kit/blob/main/docs/usage.md) · [Changelog](https://github.com/MUHZERO/wp-speed-kit/blob/main/CHANGELOG.md)

<br>

<img src="https://cdn.simpleicons.org/nodedotjs/5FA04E" alt="Node.js" title="Node.js" height="36">&nbsp;&nbsp;&nbsp;
<img src="https://cdn.simpleicons.org/lighthouse/F44B21" alt="Lighthouse" title="Lighthouse" height="36">&nbsp;&nbsp;&nbsp;
<img src="https://cdn.simpleicons.org/googlechrome/4285F4" alt="Chrome" title="Chrome" height="36">&nbsp;&nbsp;&nbsp;
<img src="https://cdn.simpleicons.org/wordpress/21759B" alt="WordPress" title="WordPress" height="36">&nbsp;&nbsp;&nbsp;
<img src="https://cdn.simpleicons.org/woocommerce/96588A" alt="WooCommerce" title="WooCommerce" height="36">&nbsp;&nbsp;&nbsp;
<img src="https://cdn.simpleicons.org/githubactions/2088FF" alt="GitHub Actions" title="GitHub Actions" height="36">

<br><br>

[![npm](https://img.shields.io/npm/v/wp-speed-kit?color=CB3837&logo=npm)](https://www.npmjs.com/package/wp-speed-kit)
[![Test](https://github.com/MUHZERO/wp-speed-kit/actions/workflows/test.yml/badge.svg)](https://github.com/MUHZERO/wp-speed-kit/actions/workflows/test.yml)
![Node](https://img.shields.io/badge/Node.js-%E2%89%A522-5FA04E?logo=nodedotjs&logoColor=white)
![Lighthouse](https://img.shields.io/badge/Lighthouse-13.5.0-F44B21?logo=lighthouse&logoColor=white)
![Tests](https://img.shields.io/badge/tests-48-2EA44F)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/MUHZERO/wp-speed-kit/blob/main/LICENSE)

</div>

---

## The problem

A single PageSpeed run is noisy: the same page can score quite differently a minute later. That makes it hard to prove that a fix helped, and CLS problems are worse, because the score says the page moved without saying what moved it.

wp-speed-kit runs Lighthouse several times on your machine, reports the median with the full range, records what shifted the layout and the likely reason, and compares a before and an after report side by side.

These are local Lighthouse lab results, not PageSpeed scores. Lighthouse uses the same measurement model, but results depend on the machine and the conditions of each run.

## Example

One mobile run against [muhdroid.com](https://muhdroid.com), the author's own site, on 26 Oct 2026:

```sh
npx wp-speed-kit audit https://muhdroid.com --runs 1
```

<img src="https://raw.githubusercontent.com/MUHZERO/wp-speed-kit/main/docs/images/report-example.png" alt="wp-speed-kit HTML report: scores, metrics, LCP breakdown and layout shifts" width="720">

Use the default of 5 runs for real decisions; one run is shown here to keep the example short.

## Features

| Command | What you get |
|---|---|
| `audit` | Median scores and metrics with min–max ranges over several runs, mobile, desktop or both, as `report.html` and `report.json` |
| `audit` | What delays the LCP element: time to first byte, load delay, load time, render delay, and the requests started before it |
| `audit` | WordPress hints: render-blocking LiteSpeed combined CSS, a lazy-loaded LCP image, full-page loaders, unused icon-font preloads |
| `audit --fail-on` | Performance budgets for CI, such as `lcp>2500,cls>0.1,perf<90`, with distinct exit codes |
| `cls` | Each layout shift with the elements that moved and the evidence: late fonts, unsized images, inserted elements, late stylesheets, carousels, bar height changes |
| `cls --shots` | A screenshot at each shift with the moved elements outlined |
| `compare` | A side-by-side before/after HTML page, and `compare.png` with `--png` |

## Quick start

```sh
npx wp-speed-kit audit <url>
```

`<url>` must use `http:` or `https:`. The **[usage guide](https://github.com/MUHZERO/wp-speed-kit/blob/main/docs/usage.md)** covers the first audit, before/after comparison, finding layout-shift causes, CI budgets, JSON output, client reports and troubleshooting.

### Requirements

- Node.js 22 or later.
- An installed Chrome or Chromium browser. The tool locates it automatically, or you can set it with `--chrome-path /path/to/browser`.
- Containers commonly need `--chrome-flags=--no-sandbox`; every command that starts Chrome accepts `--chrome-path` and `--chrome-flags`.

## Commands

```sh
wpsk audit <url...> [--runs 5] [--device mobile|desktop|both] [--warm 2]
                 [--out ./wpsk-report] [--cta "text|url"] [--json]
                 [--fail-on "lcp>2500,cls>0.1,perf<90"] [--timeout 120]
                 [--chrome-path /path/to/browser] [--chrome-flags=--no-sandbox]

wpsk cls <url> [--device mobile|desktop] [--shots] [--out ./wpsk-cls] [--json]
           [--chrome-path /path/to/browser] [--chrome-flags=--no-sandbox]

wpsk compare <before.json> <after.json> [--out ./compare] [--png]
             [--chrome-path /path/to/browser] [--chrome-flags=--no-sandbox]
```

`audit` defaults to 5 runs, the mobile device profile, 2 warm-up requests, a 120-second timeout per run, and `./wpsk-report` for output. `cls` defaults to the mobile profile and `./wpsk-cls`. `compare` defaults to `./compare`.

`audit` accepts one or more URLs. It writes `report.html`, `report.json`, and representative Lighthouse JSON files when at least one run succeeds. `--json` writes command data to standard output; progress goes to standard error. `--cta "text|url"` adds a footer line to the HTML report, linked when an `https://` URL follows the bar. With `--device both`, `--runs` counts per device.

`--fail-on` is a comma-separated list of budget rules. Supported metrics are `lcp`, `fcp`, `tbt`, `cls`, `si`, `perf`, `a11y`, `bp`, and `seo`.

### Why the median

Each successful run is measured independently. Scores and metrics are summarized as medians with a minimum-to-maximum range. For an even number of runs, scores use the lower middle value and metrics use the mean of the two middle values.

### Layout-shift evidence

The recorder observes layout-shift entries, relevant DOM insertions, font events, and resource timing in a local browser session. It lists input-driven shifts separately from the CLS total.

Each possible cause is a correlation backed by the recorded timing and page state, not proof of cause. When no evidence matches, the report says so.

### CI budgets

```sh
wpsk audit <url> --runs 5 --fail-on "lcp>2500,cls>0.1,perf<90"
```

`audit` exits with:

- `0` when all requested runs succeed and no budget is broken.
- `1` when nothing can be measured.
- `2` when only part of the requested measurement succeeds. This takes precedence over a broken budget.
- `3` when all requested runs succeed and a `--fail-on` budget is broken.

## Privacy

wp-speed-kit contacts the URL you ask it to measure and the resources that page loads. It has no PageSpeed Insights integration and does not send measurements to a wp-speed-kit service.

Reports can contain the tested and final URLs, including query strings; Lighthouse results; resource URLs; page selectors and layout-shift evidence; and browser and system provenance. Do not run it against private or logged-in pages unless you are comfortable keeping those local report files.

## Architecture

```text
bin/wpsk.js            CLI entry point
src/
├── args.js            option parsing and validation
├── chrome.js, cdp.js  Chrome discovery and DevTools protocol client
├── lighthouse*.js     one Lighthouse run per worker process
├── aggregate.js       medians and ranges across runs
├── cls/               in-page recorder, shift screenshots, cause hypotheses
├── commands/          audit, cls, compare
└── report/            HTML, JSON, comparison page, WordPress hints
test/                  node:test suites and local HTML fixtures for each CLS cause
docs/usage.md          the full usage guide
```

Only `bin`, `src`, `README.md` and `LICENSE` are published to npm. Generated reports (`wpsk-report*/`, `wpsk-cls*/`, `compare*/`) are ignored by Git.

## Development

```sh
git clone https://github.com/MUHZERO/wp-speed-kit.git
cd wp-speed-kit
npm install
npm test            # 48 tests; needs a local Chrome
node bin/wpsk.js audit https://example.com --runs 1
```

## Release

```sh
npm test
npm version patch   # updates package.json and creates the Git tag
npm publish
git push --follow-tags
```

GitHub Actions runs the test suite on every push.

## Roadmap

- V1.1: an experimental PageSpeed Insights engine.
- V2: critical CSS and a small WordPress plugin to inline it with LiteSpeed.

---

<div align="center">

Designed and built by [MuhDroid](https://muhdroid.com). Need a slow WordPress or WooCommerce site fixed? Get in touch through the site.

MIT License

</div>
