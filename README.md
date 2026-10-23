# wp-speed-kit

Repeatable Lighthouse lab reports for WordPress and WooCommerce pages, with the evidence behind every layout shift and a before/after comparison.

These are local Lighthouse lab results, not PageSpeed scores. Lighthouse uses the same measurement model, but results depend on the machine and the conditions of each run.

## Report and comparison

Coming soon: demo results.

Report screenshots and a `compare.png` from a synthetic demo will be added here. No demo measurements or images are published yet.

## Quick start

```sh
npx wp-speed-kit audit <url>
```

`<url>` must use `http:` or `https:`.

## Requirements

- Node.js 22 or later.
- An installed Chrome or Chromium browser. The tool locates it automatically, or you can set it with `--chrome-path /path/to/browser`.
- Containers commonly need `--chrome-flags=--no-sandbox`; every command that starts Chrome accepts `--chrome-path` and `--chrome-flags`.

## Commands

```sh
wpsk audit <url...> [--runs 5] [--device mobile|desktop|both] [--warm 2]
                 [--out ./wpsk-report] [--cta "text|url"] [--json]
                 [--fail-on "lcp>2500,cls>0.1,perf<90"] [--timeout 120]
                 [--chrome-path /path/to/browser] [--chrome-flags=--no-sandbox]

wpsk cls <url> [--device mobile|desktop] [--shots] [--json]
           [--chrome-path /path/to/browser] [--chrome-flags=--no-sandbox]

wpsk compare <before.json> <after.json> [--out ./compare] [--png]
             [--chrome-path /path/to/browser] [--chrome-flags=--no-sandbox]
```

`audit` defaults to 5 runs, the mobile device profile, 2 warm-up requests, a 120-second timeout per run, and `./wpsk-report` for output. `cls` defaults to the mobile profile. `compare` defaults to `./compare`.

`audit` accepts one or more URLs. It writes `report.html`, `report.json`, and representative Lighthouse JSON files when at least one run succeeds. `--json` writes command data to standard output; progress goes to standard error. `--cta` adds a footer line to the HTML report.

`--fail-on` is a comma-separated list of budget rules such as `lcp>2500`, `cls>0.1`, or `perf<90`. Supported metrics are `lcp`, `fcp`, `tbt`, `cls`, `si`, `perf`, `a11y`, `bp`, and `seo`.

`cls` records layout shifts for one URL. `compare` reads two `report.json` files and writes a side-by-side HTML comparison; `--png` also renders `compare.png`.

## Why the median

Each successful run is measured independently. Scores and metrics are summarized as medians with a minimum-to-maximum range. For an even number of runs, scores use the lower middle value and metrics use the mean of the two middle values.

Coming soon: demo results.

The demo site's 10-run range and raw JSON will be linked here when they are available.

## Layout-shift evidence

The recorder observes layout-shift entries, relevant DOM insertions, font events, and resource timing in a local browser session. It lists input-driven shifts separately from the CLS total.

Each possible cause is a correlation backed by the recorded timing and page state, not proof of cause. A report can identify evidence for late font loading, images without reserved space, elements added above content, late stylesheets, carousel changes, or bar and banner height changes. When no evidence matches, it says so.

## Demo

Coming soon: demo results.

The before/after demo, its exact changes, measurement dates and versions, and raw reports will be added here. It will state that the demo was made slow on purpose and that results on other sites will differ.

## Privacy

wp-speed-kit contacts the URL you ask it to measure and the resources that page loads. It has no PageSpeed Insights integration and does not send measurements to a wp-speed-kit service.

Reports can contain the tested and final URLs, including query strings; Lighthouse results; resource URLs; page selectors and layout-shift evidence; and browser and system provenance. Do not run it against private or logged-in pages unless you are comfortable keeping those local report files.

## CI budgets

Use `--fail-on` to make an audit enforce performance budgets in CI:

```sh
wpsk audit <url> --runs 5 --fail-on "lcp>2500,cls>0.1,perf<90"
```

`audit` exits with:

- `0` when all requested runs succeed and no budget is broken.
- `1` when nothing can be measured.
- `2` when only part of the requested measurement succeeds. This takes precedence over a broken budget.
- `3` when all requested runs succeed and a `--fail-on` budget is broken.

## Roadmap

- V1.1: an experimental PageSpeed Insights engine.
- V2: critical CSS and a small WordPress plugin to inline it with LiteSpeed.

## Need this fixed on your site?

For help investigating and fixing performance or layout-shift problems on your site, contact the author through [muhdroid.com](https://muhdroid.com).

Author: muhdroid (https://muhdroid.com)

## License

MIT. See `LICENSE`.
