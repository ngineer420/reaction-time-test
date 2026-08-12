# reflexzap.com — working notes for Claude

Free reaction-time test (click the box the instant it turns green, 5 rounds,
milliseconds) built as a **retro arcade cabinet**. Static, zero-dependency site:
vanilla HTML/CSS/JS, no build step, GitHub Pages (`CNAME` → reflexzap.com,
Cloudflare DNS). Everything runs client-side; nothing is uploaded.

## Files

- `index.html` — the whole game UI + About/FAQ + article list. Articles in
  `articles/`.
- `assets/js/app.js` — pure stats/rating helpers up top (DOM-free, `module.exports`
  for Node tests), then one IIFE with the gamification layer (XP/levels/ranks/
  achievements/streaks), WebAudio sound synth, the round state machine, and the
  arcade HUD.
- `assets/js/percentile.js` — the cited percentile engine (see below). Loaded
  **before** `app.js`; DOM-free and `require()`-able.
- `assets/css/styles.css` — the whole design system, one file.
- `reaction-time-percentiles/index.html` + `reaction-time-percentiles.html` —
  the percentile reference page, shipped at the clean path with a flat alias
  (identical content, canonical on both points at `/reaction-time-percentiles/`).
- `privacy.html` / `terms.html` — required for ad networks; keep working.
- `test/percentile.test.js` — `node --test 'test/*.test.js'`. No package.json,
  no dependencies.

No `?v=` cache-bust convention (GitHub Pages `max-age=600`).

## Design language — the arcade cabinet

Early-90s arcade cabinet, **Street Fighter II / CPS-2 era**. Zero external
fonts/assets — the retro feel is pure CSS (glow, chunky notched `pixel-corners`
panels, CRT scanline + vignette overlay on `body`, `crt-power-on` boot flash, an
illuminated `.hero-sign` marquee, chunky depress-on-`:active` buttons). Palette:
dark purple-blue background, **electric-yellow** dominant accent (`--accent`
`#ffe600`), cyan + magenta secondaries. Light theme must keep working.

**This cabinet's genre flavour = QUICK-DRAW / LIGHTNING DUEL.** Siblings share
the arcade chrome but each is a *different* genre so they never feel like clones
(cpsboost = fighting game with a SUPER meter + combos, wpmflex = rhythm
"type-rush", flicktrainer = light-gun shooter). reflexzap's distinct bits:
electric-yellow **announce slams** that punctuate the duel, a **BEST TIME** LED
readout, and a post-match **GRADE** — but **no SUPER meter** (that's cpsboost's).

## The full-bleed rule (critical)

The actual reaction rounds go **full-bleed**: the whole viewport becomes the
colour cue (`.test-stage.is-active` + `body.test-active`), intentionally
uncluttered so there's zero ambiguity about what to watch and nothing to add
latency. **Do not** put HUD chrome, borders, or overlays *inside* the reacting
stage. The arcade dressing lives on the **idle/menu + results** views only.

## Arcade HUD (the "ARCADE CABINET HUD" block in styles.css / helpers in app.js)

Presentation only — **never touches the reaction measurement**:

- **Score strip** (`.round-status.score-strip`): `ROUND n OF 5` · `FREE PLAY`
  (blinks) · `BEST TIME <ms>`. It reuses the existing `#round-label` /
  `#best-chip-value` — no new storage; BEST TIME is `reflexzap_best_ms`.
- **CRT bezel + attract pulse** on the idle/contained `.test-stage:not(.is-active)`:
  dark border + inset depth + `::after` vignette, plus a yellow attract glow on
  `.state-idle`. ⚠️ the idle stage has a pixel-corners `clip-path` that clips
  OUTER shadows — depth is **border + inset only**.
- **Announce slam** (`.announce`, a *fixed* overlay so it sits above the
  `z-index:1000` full-bleed stage): beveled skewed outlined italic — "ROUND n"
  / "FINAL ROUND" at each round start (fires during the ~2–5s "waiting" phase
  and auto-hides after ~850ms, so it is always gone well before the green cue —
  keep it that way), "TOO SOON!" (red `.is-foul`) on an early click, "CLEAR!" on
  finish. **Never announce at the green/ready moment** — it would delay the
  reaction you're measuring.
- **Letter GRADE stamp** (`.grade-stamp`) in the results rating banner: S/A/B/C/D
  from average ms, aligned to the existing rating tiers.
- Beveled announce/grade text = `-webkit-text-stroke` + `paint-order: stroke
  fill` + hard offset `text-shadow` + `skewX` (the SFII "announce" look).

## Hard rules (don't regress)

- **The measurement is sacred.** Reaction time = `performance.now()` at the click
  minus `greenAt`. The pure helpers (`computeAverage` / `computeBest` /
  `getRatingLabel`) are DOM-free and unit-testable. The HUD, announce, and grade
  are flavour and must never feed back into timing.
- **Clicks/taps are handled on `pointerdown` only** (one listener covers mouse +
  touch + pen; we deliberately do NOT also listen for `click`). Don't add a
  second handler.
- **Ads: AdSense Auto ads only.** One `<script>` in `<head>` (client
  `ca-pub-7560786263587509`). NEVER add `.ad-slot` divs or manual units.
- **Respect `prefers-reduced-motion`** — every new animation needs a reduce
  fallback (already gated).
- **Zero external requests.** No webfonts/CDNs/beacons. Sound is synthesized via
  WebAudio (`playTone` + friends), no audio files, mute-toggleable + persisted
  (`reflexzap_sound_muted`).
- The `erabb.it` 🐇 mark is the portfolio signature — last in `<body>`, flush to
  the corner, `cursor: default`.

## Friend challenge links (URL state)

A shared result is a **URL**, not a dead text blob. `#copy-btn` copies
`https://reflexzap.com/?ms=<avg>`; opening that link shows `#challenge-banner`
on the CRT with the sender's average as the time to beat, and renders
`#challenge-verdict` (`.is-win` / `.is-loss`) on the results panel once you
finish all 5 rounds.

- `ms` — must be finite and within `50 <= ms <= 5000`. Sub-50ms is physically
  impossible and 5s+ is not a real reading, so both are treated as junk.
- **Lower is better here**, so the comparison inverts relative to cpsboost and
  flicktrainer — `diff < 0` is the win branch.
- **Validate every param before use.** A hand-edited or hostile query string
  must only ever degrade to "no challenge"; banner text is set via
  `textContent` so it can't inject markup.
- The banner is `visibility: hidden` under `body.test-active` (same rule the
  credit line uses), so it can never distract from the green cue mid-round.

## localStorage keys

`reflexzap_theme`, `reflexzap_sound_muted`, `reflexzap_profile` (XP/level/streak/
achievements), `reflexzap_best_ms` (fastest single round = BEST TIME),
`reflexzap_history` (last 10 session averages).

## Shipping

Worktree under `.claude/worktrees/`, open a PR, merge when Max says (currently
"merge as they land"). Never push straight to `main`. Verify with a headless
render of the idle screen; force the results + announce state via a throwaway
preview (strip `app.js`, un-hide `#results-panel`, add `.show`/content to
`.announce` and `.grade-stamp`) since `--screenshot` can't drive the game.

## PIXEL-ART REFLEX DUEL overhaul (supersedes the sections above)

reflexzap was rebuilt from the "web-slick" arcade pass into a genuine
**pixel-art cabinet** (bar: metekamil.com). Key shifts:
- **Self-hosted pixel font** `assets/fonts/pressstart2p.woff2` (Press Start 2P,
  OFL) via `@font-face "PixArc"`, applied to all arcade text. This is the one
  deliberate exception to "system-fonts only" — it is **same-origin**, so it
  still makes **no third-party request** (the privacy intent of the rule holds).
- **Pixel-art discipline**: FLAT colours, HARD pixel edges (layered
  `box-shadow` borders, `border-radius:0`), `image-rendering: pixelated`, hard
  offset `text-shadow` (no `-webkit-text-stroke`/`skewX`, no smooth glows). An
  animated diagonal-stripe backdrop on `.crt-screen`.
- **Full cabinet**: `.cabinet` → `.marquee` (pixel logo) → `.crt`/`.crt-screen`
  (VS `.duel-hud`: YOU/RIVAL names + `.pips` best-of-5, `ROUND/BEST`, the
  contained reaction stage) → `.deck` (DRAW! pixel button + coin door + player
  card). See the "REFLEX DUEL" block at the bottom of `styles.css`.
- **The full-bleed rule is REVERSED**: the reaction stage is now **contained**
  inside the CRT (`.test-stage.is-active` overridden to `position:relative`),
  so only the CRT flashes colour — the cabinet is the frame. `body.test-active`
  still toggles (hides `.credit-line` during a round).
- **Duel pips** (`#pips-you`/`#pips-rival`, `resetPips`/`lightPip` in app.js):
  each round is a draw vs a CPU rival (`elapsed < 240+rand*170`) — pure flavour,
  never touches timing.
- **Cache-bust adopted**: `styles.css?v=` / `app.js?v=` on every page. **Bump
  the `?v=` on any coupled HTML+CSS/JS change** or cached visitors get new HTML
  with stale CSS (this exact bug hit cpsboost). Currently `?v=5`.

## The nav toolbar — never hand-edit it

Every page carries the portfolio toolbar (spec:
`ngineer420/ngineer420.github.io#13`) as a `<nav class="toolbar">` between
`<!-- nav:start -->` / `<!-- nav:end -->`, a direct child of `<body>` right
after `</header>`.

- **`tools/nav_data.py` is the only file you edit.** `tools/sync_nav.py` is the
  generic portfolio script, byte-identical across sites — do not modify it.
  `python3 tools/sync_nav.py` rewrites the block in all ten `.html` files;
  `--check` exits nonzero on drift and is worth running before you push.
- The rail is the five tier-1 destinations (percentile reference + four
  guides). The test is the sheet's **hub row**, not a rail chip, because Home is
  the brand — it is the one destination in the chrome that is not a peer of the
  list above it, and it is what gives `index.html` an `aria-current` target.
- **Not sticky.** Neither the header nor the bar; the spec forbids it (sticky
  chrome can overlay an AdSense anchor unit). Closed chrome is 51px header +
  45px bar = **96px at every width**; the 100px ceiling is the budget, so any
  header change has to be measured, not eyeballed.
- `assets/js/nav.js` is loaded by every page and is pure enhancement (active
  chip centring, edge fades, Escape, click-outside). It is separate from
  `app.js` because only `index.html` loads the duel engine. With JS off the
  `<details>` still discloses, the rail still scrolls and the scrim is still
  CSS.
- **One bolt.** `.bolt` is an empty span painted by a CSS mask (`--bolt-mark`)
  so it follows `--accent` through the theme switch. The 90-rect inline SVG on
  index and the ⚡ emoji on the articles are gone — that split is exactly how
  the two headers drifted apart. Every page's header markup is now identical
  apart from `.header-actions`, which stays on `index.html` alone because its
  buttons are driven by `app.js`.

## The percentile engine (`assets/js/percentile.js`) — read before touching

The percentiles are a **model fitted to published figures**, every one cited in
the `SOURCES` block of that file. They are **not** this site's visitor data —
there is no backend and nothing leaves the device, so we cannot have any.

- Copy must read "**the population in published studies**", never "other
  visitors / other players / people who took this test". `test/percentile.test.js`
  greps every shipped `.html`/`.js` for that class of phrasing and fails the
  build if it appears. Mislabelled, this is fabricated statistics — a trust
  problem and an AdSense-policy problem, not a wording nit.
- If a number can't be traced to a source in that file, it does not ship.
- The distribution is a two-parameter lognormal derived from a cited mean and
  SD, so there are **no free/unsourced parameters** in the fit. Keep it that way.
- Everything above the "SITE-SPECIFIC POPULATION MODEL" heading is generic and
  unit-agnostic (`lowerIsBetter` flips the direction). It is meant to drop into
  cpsboost / wpmflex / flicktrainer / chimpmemory with only the model replaced.
- The reference page's table is static HTML for SEO; a test asserts it still
  matches what the module computes, so **re-run the tests after changing the
  model** and update the page if they fail.
