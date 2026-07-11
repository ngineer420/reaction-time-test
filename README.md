# reflexcheck.io

A free, ad-supported reaction time test:

- **5-round visual reaction time test**: the stage waits a random 2–5 second delay, turns green, and measures the milliseconds between the color change and your click/tap using the browser's high-resolution timer.
- Clicking before green shows a "Too soon!" warning and restarts that round without counting it.
- After 5 scored rounds, shows a results screen with each round's time, the session average, the fastest single round, and a rating label (Superhuman / Excellent / Above Average / Average / Below Average) based on real-world human reaction-time ranges.
- Personal best (fastest round ever) and a history of the last 10 test sessions are persisted in the browser via `localStorage`.
- Works on desktop (mouse) and mobile (touch) via a single `pointerdown` listener, so clicks aren't double-counted.
- "Copy result" button copies a shareable summary to the clipboard.

Everything runs client-side — no backend, no build step, no uploads. Deployed as static files on GitHub Pages.

## Local development

No build tooling required. Serve the folder with any static file server, e.g.:

```
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Structure

```
index.html              Main app (test stage, results, history, FAQ)
privacy.html             Privacy policy (required for ad networks)
terms.html                Terms of use
404.html                   Not-found page
assets/css/styles.css   Design system
assets/js/app.js        All app logic: timing state machine, stats/rating logic,
                          localStorage persistence, clipboard share, theme toggle
assets/favicon.svg      Original lightning-bolt favicon
CNAME                    GitHub Pages custom domain (reflexcheck.io)
robots.txt / sitemap.xml SEO basics
```

## Enabling ads (Google AdSense)

1. Deploy the site and get it live at reflexcheck.io (or the `github.io` URL until the domain is purchased).
2. Apply at https://adsense.google.com with the live URL. Approval requires a working privacy policy (already included) and some real content/traffic — it isn't instant.
3. Once approved, uncomment the AdSense `<script>` tag in `index.html`'s `<head>` and replace `ca-pub-XXXXXXXXXXXXXXXX` with your publisher ID.
4. Fill in real ad units in place of the `.ad-slot` placeholder `<div>`s (`#ad-top`, `#ad-inline`, `#ad-footer`) with your AdSense ad unit code.

## Custom domain (reflexcheck.io)

**The domain `reflexcheck.io` has NOT been purchased yet.** It was only checked for apparent availability via DNS lookup at the time this site was built — it still needs to be registered through a domain registrar before any of the DNS steps below matter. Until it's purchased and DNS is configured, the site will only be reachable at its `github.io` URL (e.g. `https://ngineer420.github.io/reaction-time-test/`).

The `CNAME` file is included now, per convention, so it's ready to go the moment the domain is bought. Once purchased:

- Apex domain (`reflexcheck.io`): four `A` records to `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`.
- `www` subdomain (optional): `CNAME` record to `<username>.github.io`.

Then enable Pages in the repo's Settings → Pages, and enter `reflexcheck.io` as the custom domain (GitHub will offer to enforce HTTPS once DNS propagates).

## Reaction time rating thresholds

Based on average of 5 scored rounds (approximate, not clinical):

| Average       | Label                     |
|---------------|----------------------------|
| < 200ms       | Superhuman                 |
| 200–249ms     | Excellent                  |
| 250–299ms     | Above Average               |
| 300–349ms     | Average                     |
| ≥ 350ms       | Below Average — try again!  |
