# reflexzap.com — working notes for Claude

Free reaction-time test (click the box the instant it turns green, 5 rounds,
milliseconds) built as a **retro arcade cabinet**. Static, zero-dependency site:
vanilla HTML/CSS/JS, no build step, GitHub Pages (`CNAME` → reflexzap.com,
Cloudflare DNS). Everything runs client-side; nothing is uploaded.

## The four tests — one engine, `data-mode` on `<body>`

reflexzap runs four tests off one state machine. `document.body.dataset.mode`
picks the stimulus; an absent attribute is the original visual test, so
`index.html` needs no attribute and no behaviour change.

| mode | page | stimulus | scored |
|---|---|---|---|
| (none) / `visual` | `/` | box turns green | 5 rounds |
| `audio` | `/audio-reaction-time-test/` | synthesized tone, screen inert | 5 rounds |
| `choice` | `/choice-reaction-time-test/` | green go / red no-go | 5 go + 3 no-go |
| `f1` | `/f1-reaction-test/` | 5 lights, 0.2–3s hold, lights out | 5 starts |

The `MODES` table at the top of the app.js IIFE owns everything that must not
bleed between them: the cited model the percentile is read from, the
localStorage keys, the share URL, the stage copy, the CPU rival's speed.

- **Only the visual test keeps the absolute-millisecond rating bands.** They were
  chosen for that stimulus. The other three read their band off their own model's
  percentile, which is the only rating that stays honest when the distribution
  moves.
- **Only the visual test is gamified.** XP, streaks and achievements have
  thresholds picked for it ("average under 200ms"); a tone or a lights-out start
  clears them far more easily, and one shared profile would turn the badges into
  participation trophies.
- **Audio and F1 must not change anything on screen when the round arms.** A
  visual change would be a second and faster stimulus, and it would put layout
  work inside the interval being measured. The CSS pins those stages to the idle
  inset through `waiting` and `ready` alike — do not "helpfully" add a cue.
- The audio cue is timestamped at the tone's real onset via
  `AudioContext.getOutputTimestamp()`, not at the moment the note was scheduled.
  Scheduling time would hand the player the whole output buffer as free reaction
  time. `outputLatency` is the documented fallback.
- The F1 test rejects anything under **100ms** as an anticipated getaway rather
  than scoring it. That threshold is World Athletics' sprint-start rule
  (Technical Rules, Book C – C2.1) and lives in `percentile.js` with the other
  cited constants. The FIA's own false-start rule is about the car *moving*, not
  about latency — never invent an F1 reaction-time threshold or a "record".

## The three sibling test pages are GENERATED

`tools/build_tests.py` renders all six files (three clean paths + three flat
aliases, byte-identical pairs). **Edit that script, never the HTML it writes** —
`node --test test/percentile.test.js` runs `--check` and fails on a hand-edit.

`/reaction-time-percentiles/` and `/audio-vs-visual-reaction-time/` are NOT
generated — they are prose, not variations on a test — but they ship as the same
byte-identical twin pair, and `percentile.test.js` asserts each pair is identical
and canonicalises to the clean path.

```
python3 tools/build_tests.py && python3 tools/sync_nav.py
```

Order-independent and idempotent: `build_tests.py` carries whatever sync_nav has
put between the nav markers straight across. `index.html` is NOT generated; it is
the one page whose markup is not a variation on anything.

## Files

- `index.html` — the whole game UI + About/FAQ + article list. Articles in
  `articles/`.
- `assets/js/app.js` — pure stats/rating helpers up top (DOM-free, `module.exports`
  for Node tests), then one IIFE with the gamification layer (XP/levels/ranks/
  achievements/streaks), WebAudio sound synth, the round state machine, and the
  arcade HUD.
- `assets/js/percentile.js` — the cited percentile engine (see below), now
  carrying **four** models. Loaded **before** `app.js`; DOM-free and
  `require()`-able. It also carries `MECHANISM_SOURCES`, kept separate from
  `SOURCES`: those four citations feed no model parameter, they are the
  physiology cited on `/audio-vs-visual-reaction-time/`, and keeping them out of
  `SOURCES` is what stops the percentile reference page being forced to print
  citations that explain nothing about its own table.
- `assets/js/compare.js` — `/audio-vs-visual-reaction-time/` only, and
  **strictly read-only**: it reads the four tests' existing `*_history` keys to
  render the completion prompt and the personal audio-vs-visual gap. It writes
  nothing and merges nothing — the four records stay four records, for the same
  reason the sibling tests are not gamified. It compares average-to-average
  (a mean of 5-round means on each side) and never a `*_best_ms` against the
  published contrast, which would set a fastest-of-many figure beside a
  mean-based one.
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
achievements — visual test only), `reflexzap_best_ms` (fastest single round =
BEST TIME), `reflexzap_history` (last 10 session averages).

Each sibling test carries its own pair, so a tone never lands in the visual
test's history: `reflexzap_audio_best_ms` / `reflexzap_audio_history`,
`reflexzap_choice_best_ms` / `reflexzap_choice_history`, `reflexzap_f1_best_ms` /
`reflexzap_f1_history`. The keys live in the `MODES` table, not scattered through
the engine.

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
  with stale CSS (this exact bug hit cpsboost). Currently `?v=6`.

## The nav toolbar — never hand-edit it

Every page carries the portfolio toolbar (spec:
`ngineer420/ngineer420.github.io#13`) as a `<nav class="toolbar">` between
`<!-- nav:start -->` / `<!-- nav:end -->`, a direct child of `<body>` right
after `</header>`.

- **`tools/nav_data.py` is the only file you edit.** `tools/sync_nav.py` is the
  generic portfolio script, byte-identical across sites — do not modify it.
  `python3 tools/sync_nav.py` rewrites the block in all ten `.html` files;
  `--check` exits nonzero on drift and is worth running before you push.
- Ten tier-1 destinations — four tests, then the percentile reference, the
  audio-vs-visual comparison and four guides. The rail carries the first eight
  and the sheet carries all ten, so the ORDER in `nav_data.py` is what decides
  which two destinations are sheet-only: the whole "How it is measured" group
  (How This Test Works, History of Reaction Time), because those are the pages a
  visitor goes looking for rather than stumbles into between rounds. Group
  headings are on from the ninth destination; below nine the renderer emits one
  flat list.
- `HUBS` is now empty. The hub row existed only to give `index.html` a place in
  the chrome; it is one of four sibling tests now and takes the first rail chip,
  which carries the `aria-current` target the hub row was there to provide.
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
- **Four models now, exported as `MODELS` and individually.** Audio shifts the
  visual model by the within-subject auditory advantage from a study that
  measured both stimuli in the same people (only the *contrast* transfers, not
  the levels). Go/no-go converts a laboratory mean onto browser footing with
  Anwyl-Irvine's measured Chrome lag, and states that correction rather than
  absorbing it. F1 deliberately reuses the visual model's two numbers, because
  the stimulus is the same and no F1-specific distribution is published — that is
  the finding, not a shortcut.
- **Some numbers may only be quoted with their task parameters.** The go/no-go
  commission rate of 8.23% belongs to a 500ms stimulus and a 1250–1750ms ISI;
  quoted bare it reads as a benchmark a visitor can compare against, and it is
  not one. A test enforces this. The false-start count therefore ships with no
  percentile at all — an empty cell beats an invented one.
- The reference page's table is static HTML for SEO; a test asserts it still
  matches what the module computes, so **re-run the tests after changing the
  model** and update the page if they fail.
