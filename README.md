# reflexzap.com

A free, ad-supported reaction time test — four of them, on one engine:

| Test | Stimulus | Reports |
|---|---|---|
| `/` | a box turning green after a random 2–5s wait | mean of 5 rounds |
| `/audio-reaction-time-test/` | a synthesized tone; the screen never changes | mean of 5 rounds |
| `/choice-reaction-time-test/` | green = go, red = hold; 8 trials, 3 of them red | mean go-latency **and** a false-start count |
| `/f1-reaction-test/` | five red lights, a 0.2–3s hold, then lights out | mean of 5 starts, sub-100ms rejected as anticipation |

`data-mode` on `<body>` is the only switch between them; an absent attribute is the
original visual test. Each has its own cited distribution in `assets/js/percentile.js`
and its own `localStorage` keys, so nothing bleeds between them.

- **5-round visual reaction time test**: the stage waits a random 2–5 second delay, turns green, and measures the milliseconds between the color change and your click/tap using the browser's high-resolution timer.
- Clicking before green shows a "Too soon!" warning and restarts that round without counting it.
- After 5 scored rounds, shows a results screen with each round's time, the session average, the fastest single round, and a rating label (Superhuman / Excellent / Above Average / Average / Below Average) based on real-world human reaction-time ranges.
- Personal best (fastest round ever) and a history of the last 10 test sessions are persisted in the browser via `localStorage`.
- Works on desktop (mouse) and mobile (touch) via a single `pointerdown` listener, so clicks aren't double-counted.
- "Copy result" button copies a shareable summary to the clipboard.
- A **percentile** for the session average, plus the visitor's marker drawn on an inline SVG of the distribution, and a `/reaction-time-percentiles/` reference page carrying the full table, age bands, methodology and sources.

Everything runs client-side — no backend, no build step, no uploads. Deployed as static files on GitHub Pages.

> **The percentiles are a model of published research, not this site's data.** There is no backend, so no results are ever collected or aggregated. See `assets/js/percentile.js` for the model and the citation for every figure in it.

## Local development

No build tooling required. Serve the folder with any static file server, e.g.:

```
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Structure

```
index.html              Main app (test stage, results, history, FAQ) — hand-written
audio-reaction-time-test/index.html    The three sibling tests, clean path...
choice-reaction-time-test/index.html
f1-reaction-test/index.html
audio-reaction-time-test.html          ...and their flat aliases, byte-identical.
choice-reaction-time-test.html         All six are OUTPUT of tools/build_tests.py.
f1-reaction-test.html
reaction-time-percentiles/index.html   Percentile reference page (clean path)
reaction-time-percentiles.html         Flat alias of the same page
articles/                Long-form SEO articles
privacy.html             Privacy policy (required for ad networks)
terms.html                Terms of use
404.html                   Not-found page
assets/css/styles.css   Design system
assets/js/percentile.js Cited percentile engine (DOM-free, drop-in reusable)
assets/js/app.js        All app logic: timing state machine, stats/rating logic,
                          localStorage persistence, clipboard share, theme toggle
assets/js/nav.js        Toolbar behaviour (edge fades, Escape, click-outside)
assets/favicon.svg      Original lightning-bolt favicon
tools/nav_data.py       The nav's single source of truth (destinations, labels)
tools/sync_nav.py       Renders the toolbar into every .html between markers
tools/build_tests.py    Renders the three sibling test pages from one shared shell
test/percentile.test.js  node:test coverage for the percentile engine
CNAME                    GitHub Pages custom domain (reflexzap.com)
robots.txt / sitemap.xml SEO basics
```

## Tests

```
node --test 'test/*.test.js'
```

No `package.json` and no dependencies — `node:test` and `node:assert` only. The suite covers
all four percentile models' monotonicity and bounds, checks that each reproduces the
published figures it is pinned to, checks the reference page's static tables still match
the models, asserts every test page pair is byte-identical and carries the right
`data-mode`, and greps every shipped page for copy that would imply the percentiles come
from this site's own visitors — plus two more honesty guards: the go/no-go commission
error rate may never be quoted without the task parameters it belongs to, and no page may
assert an F1 reaction-time threshold or record, because none is published.

The three sibling test pages are generated. Regenerate and re-sync the nav after editing
`tools/build_tests.py`:

```
python3 tools/build_tests.py && python3 tools/sync_nav.py
python3 tools/build_tests.py --check && python3 tools/sync_nav.py --check
```

The two scripts are order-independent and idempotent: `build_tests.py` carries the nav
region across untouched, and `--check` for both runs inside the node suite.

## Enabling ads (Google AdSense)

1. The site is live at https://reflexzap.com/.
2. Apply at https://adsense.google.com with the live URL. Approval requires a working privacy policy (already included) and some real content/traffic — it isn't instant.
3. Once approved, uncomment the AdSense `<script>` tag in `index.html`'s `<head>` and replace `ca-pub-XXXXXXXXXXXXXXXX` with your publisher ID. Auto ads then places ad units automatically — no manual placement needed.

## Custom domain (reflexzap.com)

`reflexzap.com` is purchased and live via Cloudflare DNS, pointed at GitHub Pages using the `CNAME` file in this repo:

- Apex domain (`reflexzap.com`): four `A` records to `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`.
- `www` subdomain (optional): `CNAME` record to `<username>.github.io`.

Pages is enabled in the repo's Settings → Pages with `reflexzap.com` as the custom domain, with HTTPS enforced.

## Reaction time rating thresholds

The absolute-millisecond ladder below applies to the **visual test only** — it was chosen
for that stimulus and means nothing for a tone, a go/no-go decision or a lights-out start.
The other three tests take their rating band from their own cited distribution's
percentile instead, so the label moves with the model rather than inheriting thresholds
picked for a different test.

Based on average of 5 scored rounds (approximate, not clinical):

| Average       | Label                     |
|---------------|----------------------------|
| < 200ms       | Superhuman                 |
| 200–249ms     | Excellent                  |
| 250–299ms     | Above Average               |
| 300–349ms     | Average                     |
| ≥ 350ms       | Below Average — try again!  |
