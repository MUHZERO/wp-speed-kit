# wp-speed-kit usage guide

This guide shows how to use `wpsk` day to day: a first audit, a before/after comparison, finding what moves the page, and running budgets in CI. Every flag mentioned here exists in the current version; `wpsk --help` prints the full list.

## 1. Install or run

You need Node.js 22+ and an installed Chrome or Chromium.

```sh
# run without installing
npx wp-speed-kit audit https://example.com/

# or install the wpsk command
npm install -g wp-speed-kit
wpsk audit https://example.com/
```

If Chrome is not found, pass its path: `--chrome-path "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"` (macOS) or `--chrome-path /usr/bin/chromium` (Linux). In Docker or other containers add `--chrome-flags=--no-sandbox`.

## 2. Your first audit

```sh
wpsk audit https://example.com/ --runs 5
```

What happens:

1. Two warm-up requests (`--warm 2`) fill the site's page cache (LiteSpeed, WP Rocket, Varnish…). Your browser cache is never reused: every Lighthouse run starts from a fresh, empty profile.
2. Lighthouse runs five times on the mobile profile, one run after the other.
3. The layout-shift recorder loads the page once more and records what moved.
4. The results are written to `./wpsk-report/` (an existing folder is never overwritten; you get `wpsk-report-2`, `-3`…).

Files:

| File | What it is |
|---|---|
| `report.html` | The report to read or send. Self-contained, works offline and on a phone. |
| `report.json` | Every run, the medians, the shifts and the versions used. Input for `compare` and scripts. |
| `lighthouse-mobile.json` | The full Lighthouse result of the run closest to the medians. Open it in the [Lighthouse viewer](https://googlechrome.github.io/lighthouse/viewer/) for every audit detail. |

How to read `report.html`:

- **Scores and Metrics** show the median of the successful runs and the range ("range 87–97, median of 5"). A wide range means the page or the server is unstable, not that the tool is wrong.
- **What delays the largest image** shows the LCP element, how its time splits (server, waiting, download, render), and every request that started before it. Large scripts, fonts and images in that list compete with the LCP image.
- **What moves the page** lists each layout shift, biggest first, with the evidence found next to it.
- **Render-blocking files** are the CSS and JS files the browser must download before it can paint.
- **WordPress hints** appear only on WordPress sites and say what was seen, for example "the LCP image is lazy-loaded".

How many runs:

| Goal | Runs |
|---|---|
| Quick check while working | `--runs 1` |
| Normal audit (default) | `--runs 5` |
| Numbers you will show a client | `--runs 9` |

`--runs` counts per device: `--device both --runs 5` makes 10 runs, alternating mobile and desktop so a slow minute on the server affects both.

## 3. Before and after a change

Measure, change one thing, measure again with the same settings, then compare.

```sh
wpsk audit https://example.com/ --runs 5 --out before
# … make your change (plugin setting, image sizes, theme option) and clear the site cache …
wpsk audit https://example.com/ --runs 5 --out after
wpsk compare before/report.json after/report.json --png --out compare
```

`compare/compare.html` and `compare/compare.png` show both results side by side with the difference for each score and metric.

Tips for a fair comparison:

- Use the same machine, network and number of runs for both. `compare` warns when the tool, Lighthouse or Chrome versions or the run counts differ.
- Leave `--warm` on after clearing the site cache, so the "after" run does not measure a cold server.
- Close heavy apps while measuring; a busy laptop slows the simulated CPU too.

## 4. Find what moves the page

```sh
wpsk cls https://example.com/ --device mobile
```

Each shift is printed with the elements that moved (their selector and position before and after) and the evidence recorded just before it:

| Evidence | Usual fix on WordPress |
|---|---|
| Web font swap | `font-display: swap` with a fallback of similar size, or preload the font used above the fold |
| Image without reserved space | add `width` and `height` attributes, or a CSS `aspect-ratio` |
| Element added above | reserve its height from the start (cookie bar, promo bar, mobile header built by JavaScript) |
| Stylesheet applied late | inline the CSS needed for the first screen, load the rest after |
| Carousel starting | give slides their final width before the slider script runs |
| Bar or banner changed height | give the bar a fixed height in CSS |

Evidence is a correlation in time, not proof. When nothing matches, the output says "no clear evidence" and shows the raw rectangles.

To see it:

```sh
wpsk cls https://example.com/ --shots
```

`--shots` saves a screenshot at first paint, one taken as each shift above 0.01 happens with the moved areas outlined in red, and the final state. They go to `./wpsk-cls/` (or a numbered folder next to it); `--out` picks another folder. The command prints their paths at the end.

When the page does not move at all, the output says "No layout shifts recorded".

## 5. Several pages at once

```sh
wpsk audit https://example.com/ https://example.com/shop/ https://example.com/product/sample/ --out site
```

Each URL gets its own folder inside `site/`, named after the host and path (`example.com-home`, `example.com-shop`…).

## 6. Budgets in CI

`--fail-on` turns the medians into a pass/fail check:

```sh
wpsk audit https://staging.example.com/ --runs 3 --fail-on "lcp>2500,cls>0.1,tbt>300,perf<85"
```

Rules use `>` or `<` with `fcp`, `lcp`, `tbt`, `si` (milliseconds), `cls`, and `perf`, `a11y`, `bp`, `seo` (scores 0–100).

| Exit code | Meaning |
|---|---|
| 0 | All runs succeeded, no budget broken |
| 1 | Nothing could be measured (bad URL, HTTP 4xx/5xx, Chrome missing) |
| 2 | Some runs failed; the report marks what is missing |
| 3 | A budget was broken |

GitHub Actions example:

```yaml
name: Speed budget
on: [pull_request]
jobs:
  speed:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - uses: browser-actions/setup-chrome@v1
      - run: npx wp-speed-kit audit https://staging.example.com/ --runs 3 --fail-on "lcp>2500,cls>0.1" --out speed
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: speed-report
          path: speed/
```

CI machines are slower and noisier than a laptop, so set budgets with some margin and compare results from the same runner type only.

## 7. JSON for scripts

`--json` prints the report data on standard output (progress stays on standard error):

```sh
wpsk audit https://example.com/ --runs 3 --json > result.json
jq '.aggregates.mobile.metrics.lcp.median' result.json
```

## 8. Reports for clients

`--cta "text|url"` adds one line at the bottom of `report.html`, linked when a `https://` URL follows the bar:

```sh
wpsk audit https://client-site.example/ --runs 9 --cta "Questions about this report? Contact us|https://your-agency.example/contact"
```

The report says "local Lighthouse lab result" everywhere. If the client compares with pagespeed.web.dev, explain that both use Lighthouse but on different machines, so numbers differ; trends and the before/after difference are what matter.

## 9. Troubleshooting

| Problem | What to do |
|---|---|
| An error about Chrome or `CHROME_PATH` | Install Chrome or Chromium, or pass `--chrome-path` |
| Chrome fails to start in Docker/CI | Add `--chrome-flags=--no-sandbox` |
| `Warm-up returned HTTP 404` | Check the URL; the tool stops on HTTP 4xx/5xx before running Lighthouse |
| Runs time out on a slow site | Raise `--timeout` (seconds per run, default 120) |
| Scores jump a lot between runs | Warm the cache (`--warm 2`), use more runs, close other apps; a wide range on a quiet machine points at the server |
| Pages behind a login | Not supported in this version; test the public pages |
| Scores differ from PageSpeed Insights | Expected: same Lighthouse model, different machine and network |
