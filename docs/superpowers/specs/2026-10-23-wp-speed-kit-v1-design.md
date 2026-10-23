# wp-speed-kit — V1 design

Status: draft for review (2026-10-23), revised after a Codex review. Nothing is built yet.

## Why

The goal is to bring in clients and companies for speed work. The tool gives a store owner an honest, readable speed report for free; the report and the repository show that the author can fix what the report finds, and point to muhdroid.com for that.

Two real problems it answers:

- **Lab scores jump between runs** (the same page can score 78 one run and 98 the next). Owners and agencies argue over one lucky or unlucky run. The tool reports repeatable local Lighthouse lab results: the median of several runs, with the range.
- **"Avoid large layout shifts" names the element but not why it moved.** The tool records what moved, by how much and when, together with what happened just before (a font, a stylesheet, an element added, an image loaded), and shows ranked hypotheses with that evidence.

## Goals (V1)

1. `audit`: local Lighthouse run N times per device; per-metric medians and ranges, the diagnostics of the most representative run, and the layout-shift observations, in one HTML report and one versioned JSON file.
2. `cls`: the layout-shift recorder on its own, for quick checks while fixing.
3. `compare`: a before/after HTML page, and a PNG of it, from two `audit` JSON files.
4. Works on any public or local `http(s)` URL. WordPress-aware hints (LiteSpeed, Elementor, WooCommerce, theme loaders) but not WordPress-only.

## Non-goals (V1)

- No fixing: no critical CSS generation and no WordPress plugin (V2).
- No PageSpeed Insights API (V1.1, as an experimental, clearly separate engine).
- No server, account, dashboard or SaaS. Runs on the user's machine or CI.
- No crawling, and no logged-in pages (no cookies or custom headers in V1).
- No field data (CrUX). Lab data only, and the report says so.

## Anti-goals (failure even if it works)

- A report that invents numbers or presents a hypothesis as a fact. Every number comes from a run kept in the JSON.
- Any client site, name, domain or screenshot in the repository, examples, tests or docs. Examples use the demo site and the test fixtures only.
- Hidden calls home or tracking. The tool contacts only the URL under test (and whatever that page loads).
- A loud sales pitch inside the report. The call to action is one configurable footer line.

## Measurement model

- **Engine:** the `lighthouse` npm package, pinned to an exact version, with its default mobile and desktop configs (simulated throttling). Labelled everywhere as "local Lighthouse lab result", never as "PageSpeed score": the model is the same, the machine is not.
- **Warm-up:** `--warm N` (default 2) plain HTTP requests per device user agent before the runs. This warms the **server's** page cache (LiteSpeed, WP Rocket, Varnish) only. Every Lighthouse run starts from a fresh, empty Chrome profile, so the browser side is always cold, as on PageSpeed. The report states both.
- **Runs:** `--runs N` (default 5, odd numbers recommended; `--runs 1` for a fast check). Runs are sequential; with `--device both`, devices alternate (m, d, m, d…) so a slow minute hits both.
- **Aggregation:** each category score and each metric (FCP, LCP, TBT, CLS, Speed Index) is the median of its own values across the successful runs, shown with min–max. For an even count, the lower of the two middle values is used for scores and the mean for metrics, and the report says "median of N".
- **Representative run:** the diagnostics (LCP element and breakdown, render-blocking requests, requests before LCP) come from the run whose five metrics are closest to the medians (sum of distances, each metric divided by its median). The report names that run.
- **Provenance block** in the report and JSON: tool version, Lighthouse version, Chrome version and path, OS, CPU count, Node version, UTC start/end, runs requested/succeeded, warm-up count, config used.

## Commands

Binary `wpsk`. Node 22+ (built-in `WebSocket` and `util.parseArgs`). Requires an installed Chrome or Chromium; found automatically on macOS, Linux and Windows, or given with `--chrome-path`.

```
wpsk audit <url...> [--runs 5] [--device mobile|desktop|both] [--warm 2]
                    [--out ./wpsk-report] [--cta "text|url"] [--json]
                    [--fail-on "lcp>2500,cls>0.1,perf<90"] [--timeout 120]
wpsk cls <url> [--device mobile|desktop] [--shots] [--json]
wpsk compare <before.json> <after.json> [--out ./compare] [--png]
```

- Only `http:` and `https:` URLs. Redirects are followed and the final URL is reported. TLS errors, DNS errors and HTTP status ≥ 400 on the page itself stop that URL with a clear message.
- Several URLs in `audit` write `<out>/<host>-<path-slug>/` each. An existing output folder is never overwritten: a numbered folder is created next to it.
- Output: human progress on stderr; stdout carries only the JSON when `--json` is set.
- Exit codes: `0` all runs succeeded and no `--fail-on` budget broken; `1` nothing could be measured; `2` partial result (some runs or a device failed; the report is still written and marks what is missing); `3` a `--fail-on` budget was broken.
- `--timeout` is per run, in seconds. A failed run is retried once only for a Chrome crash or a navigation timeout, and the retry is recorded.
- `--chrome-flags` is passed through; the README documents `--no-sandbox` for containers.

## Layout-shift recorder (`cls`, and once per device in `audit`)

- Chrome is opened through its DevTools Protocol with a small built-in client (Node 22 `WebSocket`, about a hundred lines) on a fresh profile, same viewport, DPR, CPU and network throttling as the Lighthouse mobile/desktop config.
- Before navigation, a script is injected that records: every `layout-shift` entry (value, start time, `hadRecentInput`, sources with previous/current rectangles and a stable selector for the node), DOM insertions above the viewport fold (MutationObserver, with time and selector), font loads (`document.fonts` events), and resource timing for stylesheets, fonts, images and scripts.
- Recording ends at the load event plus 5 s with no new shift, or after 30 s.
- Shifts with `hadRecentInput` are listed separately and excluded from the CLS total, as in the metric.
- Each shift gets zero or more **hypotheses**, each with its evidence:

| Hypothesis | Evidence shown |
|---|---|
| Web font swap | a font finished loading ≤ 500 ms before; the moved node's text uses that family |
| Image without reserved space | an `img` in the moved node's container changed height; whether it has `width`/`height` attributes or a CSS aspect-ratio |
| Element added above | a MutationObserver insertion above the moved node ≤ 1 s before (it can wait several frames to be painted), after the HTML finished parsing, with its selector |
| Stylesheet applied late | a stylesheet finished ≤ 500 ms before |
| Carousel starting | the container has a known carousel class (Swiper, Slick, Splide, Owl, Flickity) and its class list changed at the shift |
| Bar or banner changed height | a top/fixed element above the moved node changed height |

  The report says "correlated with", lists every hypothesis that matched, and shows "no clear evidence" when none did. Raw rectangles and timings are always shown next to them.
- `--shots` saves a screenshot right after each shift above 0.01, plus first paint and the final state, with the moved rectangles outlined.
- Nodes that no longer exist, shadow DOM and cross-origin frames are reported as "not attributable" rather than dropped.

## Report (`report.html`)

One self-contained HTML file (inline CSS and images), readable on a phone, printable, light and dark.

1. **Header**: URL (final URL if redirected), date, device(s), "local Lighthouse lab result", runs, warm-up note.
2. **Scores**: four categories, median with range ("Performance 93, range 87–97, median of 5").
3. **Metrics**: FCP, LCP, TBT, CLS, Speed Index, median with range and the pass / needs improvement / poor band.
4. **What delays the largest image**: from the representative run: LCP element, breakdown (server, load delay, load time, render delay), and requests started before LCP grouped by type with sizes.
5. **What moves the page**: shifts biggest first, with hypotheses and evidence, and the screenshot crop when available.
6. **Render-blocking files**: from the representative run.
7. **WordPress hints**: only when WordPress is detected; each hint names what was seen (for example "LiteSpeed combined CSS is render-blocking", "the LCP image is lazy-loaded", "a full-page loader stays until window load", "icon fonts preloaded but not used above the fold").
8. **Method and provenance**: the measurement model above, in plain words, and the provenance block.
9. **Footer**: "Made with wp-speed-kit" (repo link) and the `--cta` line if given. No author CTA by default.

`report.json` has a `schemaVersion`, every run with status, metrics and errors, the representative run id, the shift list with hypotheses, and the provenance block.

The README warns that reports and screenshots contain the page's content, URLs (including query strings) and third-party requests, so they should not be made for private or logged-in pages.

## `compare`

`compare.html` places two reports side by side: scores and metrics with differences, the shift totals, and a note when the two reports were made with different tool, Lighthouse or Chrome versions or run counts. `--png` renders that page with Chrome and saves `compare.png` (no image library).

## Tests

- Fixture pages served by a local test server: a page with an unsized image, a late web font, an element inserted by script, a late stylesheet, a Swiper-like carousel, and a clean page. Tests assert the recorder finds the shift and the expected hypothesis, and that the clean page reports none.
- Unit tests for aggregation (odd/even runs, failed runs, ties) and for exit codes.
- CI: macOS and Ubuntu with Chrome installed by the CI action. Windows is tested by hand before each release and documented as best effort in V1.

## README outline

1. Pitch: "Repeatable Lighthouse lab reports for WordPress and WooCommerce pages, with the evidence behind every layout shift and a before/after comparison."
2. Screenshot of a report and of a `compare.png`, from the demo site, labelled as a synthetic demo.
3. Quick start: `npx wp-speed-kit audit https://example.com`.
4. Requirements (Node 22+, Chrome) and commands with flags.
5. "Why the median": the range seen on the demo site over 10 runs, raw JSON linked.
6. How layout shifts are recorded and what a hypothesis means (and does not mean).
7. Demo: before/after on the demo site, the exact changes made between the two, tool/Lighthouse/Chrome versions and dates, and the raw reports. States that the demo was made slow on purpose and that gains on other sites will differ.
8. Privacy: what the tool contacts, what the reports contain.
9. CI usage with `--fail-on` and exit codes.
10. Roadmap: V1.1 PSI engine (experimental), V2 critical CSS and a small WordPress plugin to inline it with LiteSpeed.
11. "Need this fixed on your site?": one paragraph and a link to muhdroid.com.
12. License: MIT.

## Demo site

A WordPress + WooCommerce site built for the project, with the stack where these problems show up: a popular free multipurpose theme, Elementor (free) with a product carousel and an image carousel, LiteSpeed Cache, a promo bar, WooCommerce sample products, and large unoptimised images on purpose. Two states (before fixes and after fixes), each at its own address on a subdomain of muhdroid.com. Every number in the README comes from `wpsk audit` runs on it, and those reports are committed under `examples/`.

## Decisions taken

- Node 22+, ESM. Runtime dependency: `lighthouse` (pinned). It uses `chrome-launcher` to find Chrome; the layout-shift recorder uses its own small CDP client over Node's built-in `WebSocket`, not Lighthouse internals.
- No image library: Chrome renders `compare.png`.
- MIT license, public GitHub repository `wp-speed-kit` under the author's account.
- The client-specific scripts written earlier are not copied; V1 is written fresh and carries no client data.

## Left to the builder

- Exact HTML/CSS of the report and compare page, within the sections above.
- The stable-selector algorithm for moved nodes.
- Which free multipurpose theme the demo uses.

## Open questions for the owner

1. Keep the names `wp-speed-kit` and `wpsk`?
2. Which subdomain of muhdroid.com for the demo's two states?
3. README and report in English only for V1?
