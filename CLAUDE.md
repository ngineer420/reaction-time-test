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
- `assets/css/styles.css` — the whole design system, one file.
- `privacy.html` / `terms.html` — required for ad networks; keep working.

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
