# reflexzap.com

A free, ad-supported reaction time test:

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
index.html              Main app (test stage, results, history, FAQ)
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
test/percentile.test.js  node:test coverage for the percentile engine
CNAME                    GitHub Pages custom domain (reflexzap.com)
robots.txt / sitemap.xml SEO basics
```

## Tests

```
node --test 'test/*.test.js'
```

No `package.json` and no dependencies — `node:test` and `node:assert` only. The suite covers
the percentile engine's monotonicity and bounds, checks the reference page's static table
still matches the model, and greps every shipped page for copy that would imply the
percentiles come from this site's own visitors.

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

Based on average of 5 scored rounds (approximate, not clinical):

| Average       | Label                     |
|---------------|----------------------------|
| < 200ms       | Superhuman                 |
| 200–249ms     | Excellent                  |
| 250–299ms     | Above Average               |
| 300–349ms     | Average                     |
| ≥ 350ms       | Below Average — try again!  |
