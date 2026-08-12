/* Run with:  node --test test/
   No package.json, no dependencies — node:test and node:assert only. */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const P = require("../assets/js/percentile.js");
const MODEL = P.REACTION_TIME_MS;

const REPO = path.join(__dirname, "..");

/* A second, deliberately different model: higher-is-better, different units.
   The engine must not assume milliseconds or that low scores win. */
const HIGHER_IS_BETTER = {
  id: "synthetic-cps",
  unit: "clicks/sec",
  lowerIsBetter: false,
  mean: 6.5,
  sd: 1.6,
  shift: 0,
  precision: 2,
  domain: [2, 14],
  betterWord: "Higher",
  populationPhrase: "a synthetic test population",
};

/* ============================ bounds ============================ */

test("percentile is always finite and within 0-100", () => {
  for (let ms = 1; ms <= 5000; ms += 1) {
    const p = P.percentileForScore(ms, MODEL);
    assert.ok(Number.isFinite(p), `not finite at ${ms}ms: ${p}`);
    assert.ok(p >= 0 && p <= 100, `out of bounds at ${ms}ms: ${p}`);
  }
});

test("percentile stays in bounds for absurd and invalid scores", () => {
  for (const ms of [0, -1, -1e6, 1e6, 1e12]) {
    const p = P.percentileForScore(ms, MODEL);
    assert.ok(Number.isFinite(p) && p >= 0 && p <= 100, `out of bounds at ${ms}: ${p}`);
  }
  for (const bad of [NaN, Infinity, -Infinity, undefined, null, "250"]) {
    assert.ok(Number.isNaN(P.percentileForScore(bad, MODEL)), `expected NaN for ${bad}`);
  }
  assert.ok(Number.isNaN(P.percentileForScore(250, null)));
});

test("higher-is-better model is also bounded", () => {
  for (let cps = 0; cps <= 30; cps += 0.01) {
    const p = P.percentileForScore(cps, HIGHER_IS_BETTER);
    assert.ok(Number.isFinite(p) && p >= 0 && p <= 100, `out of bounds at ${cps}: ${p}`);
  }
});

/* ========================= monotonicity ========================= */

test("percentile never decreases as the score improves (lower ms is better)", () => {
  let prev = -Infinity;
  // Walk from the slowest score to the fastest — i.e. improving.
  for (let ms = 3000; ms >= 1; ms -= 0.25) {
    const p = P.percentileForScore(ms, MODEL);
    assert.ok(p >= prev, `percentile dropped when improving to ${ms}ms: ${p} < ${prev}`);
    prev = p;
  }
});

test("percentile never decreases as the score improves (higher is better)", () => {
  let prev = -Infinity;
  for (let cps = 0; cps <= 30; cps += 0.005) {
    const p = P.percentileForScore(cps, HIGHER_IS_BETTER);
    assert.ok(p >= prev, `percentile dropped when improving to ${cps}: ${p} < ${prev}`);
    prev = p;
  }
});

test("a worse score is never rewarded with a better percentile", () => {
  const samples = [120, 150, 180, 200, 220, 250, 273, 300, 350, 400, 500, 700, 1000];
  for (let i = 1; i < samples.length; i++) {
    const faster = P.percentileForScore(samples[i - 1], MODEL);
    const slower = P.percentileForScore(samples[i], MODEL);
    assert.ok(faster >= slower, `${samples[i - 1]}ms (${faster}) should beat ${samples[i]}ms (${slower})`);
  }
});

test("the displayed percentile is also monotone and clamped to 1-99", () => {
  let prev = -Infinity;
  for (let ms = 3000; ms >= 1; ms -= 0.5) {
    const shown = Number(P.formatPercentile(P.percentileForScore(ms, MODEL)));
    assert.ok(shown >= 1 && shown <= 99, `displayed percentile out of range at ${ms}ms: ${shown}`);
    assert.ok(shown >= prev, `displayed percentile dropped when improving to ${ms}ms`);
    prev = shown;
  }
});

/* ==================== model / table integrity ==================== */

test("the fitted distribution reproduces the published figures it is pinned to", () => {
  // The 50th percentile must come back as exactly the cited median.
  assert.ok(Math.abs(P.scoreForPercentile(50, MODEL) - MODEL.median) < 0.5);
  assert.ok(MODEL.median > MODEL.domain[0] && MODEL.median < MODEL.domain[1]);

  // ...and the fitted spread must reproduce the cited SD. Integrate the density
  // numerically rather than trusting the closed form we used to fit it.
  let m0 = 0, m1 = 0, m2 = 0;
  for (let x = 1; x < 4000; x += 0.05) {
    const d = P.density(MODEL, x);
    m0 += d; m1 += d * x; m2 += d * x * x;
  }
  const mean = m1 / m0;
  const sd = Math.sqrt(m2 / m0 - mean * mean);
  assert.ok(Math.abs(sd - MODEL.sd) < 0.5, `fitted SD ${sd.toFixed(2)} != cited ${MODEL.sd}`);
  assert.ok(mean > MODEL.median, "a right-skewed model must have mean > median");
});

test("the mean-anchored fit also reproduces its inputs", () => {
  // The other parameterisation (mean + SD) has to work too — sibling sites
  // will cite a mean rather than a median.
  const m = Object.assign({}, HIGHER_IS_BETTER);
  let m0 = 0, m1 = 0, m2 = 0;
  for (let x = 0.001; x < 60; x += 0.001) {
    const d = P.density(m, x);
    m0 += d; m1 += d * x; m2 += d * x * x;
  }
  const mean = m1 / m0;
  const sd = Math.sqrt(m2 / m0 - mean * mean);
  assert.ok(Math.abs(mean - m.mean) < 0.02, `fitted mean ${mean} != ${m.mean}`);
  assert.ok(Math.abs(sd - m.sd) < 0.02, `fitted SD ${sd} != ${m.sd}`);
});

test("scoreForPercentile round-trips through percentileForScore", () => {
  for (const p of [1, 5, 10, 25, 50, 75, 90, 95, 99]) {
    const score = P.scoreForPercentile(p, MODEL);
    const back = P.percentileForScore(score, MODEL);
    assert.ok(Math.abs(back - p) < 0.01, `round-trip failed at p${p}: ${back}`);
  }
});

test("the published quantile table matches the model it claims to come from", () => {
  assert.ok(Array.isArray(MODEL.quantiles) && MODEL.quantiles.length > 0);
  for (const row of MODEL.quantiles) {
    const actual = P.percentileForScore(row.ms, MODEL);
    assert.ok(
      Math.abs(actual - row.percentile) <= 1,
      `table row p${row.percentile} = ${row.ms}ms actually maps to p${actual.toFixed(2)}`
    );
  }
});

test("the quantile table is ordered fastest-to-slowest", () => {
  const rows = MODEL.quantiles;
  for (let i = 1; i < rows.length; i++) {
    assert.ok(rows[i].percentile < rows[i - 1].percentile, "percentiles must descend");
    assert.ok(rows[i].ms > rows[i - 1].ms, "milliseconds must ascend as percentile falls");
  }
});

test("quantileTable() generates an ordered table for any model", () => {
  const table = P.quantileTable(HIGHER_IS_BETTER);
  assert.ok(table.length > 0);
  for (let i = 1; i < table.length; i++) {
    assert.ok(table[i].percentile < table[i - 1].percentile);
    assert.ok(table[i].score < table[i - 1].score, "higher-is-better scores must fall with percentile");
  }
});

test("every age band is traceable to a cited source", () => {
  const ids = new Set(P.SOURCES.map((s) => s.id));
  assert.ok(ids.size === P.SOURCES.length, "source ids must be unique");
  for (const band of MODEL.ageBands) {
    assert.ok(ids.has(band.source), `age band ${band.label} cites unknown source ${band.source}`);
  }
  assert.ok(ids.has(MODEL.source), `model cites unknown source ${MODEL.source}`);
  for (const s of P.SOURCES) {
    assert.ok(s.citation && s.url && s.kind, `source ${s.id} is missing citation/url/kind`);
  }
});

/* ======================= curve geometry ======================= */

test("distributionPath returns a usable SVG path", () => {
  const geom = { width: 320, height: 130 };
  const d = P.distributionPath(MODEL, geom);
  assert.match(d, /^M[\d.]+ [\d.]+( L[\d.]+ [\d.]+)+$/, "path must be a plain move+line polyline");
  assert.ok(!/NaN|Infinity|undefined/.test(d), "path must not contain NaN/Infinity");

  const closed = P.distributionPath(MODEL, Object.assign({ close: true }, geom));
  assert.ok(closed.endsWith(" Z"), "closed path must end with Z");
});

test("distributionPath stays inside the requested box", () => {
  const geom = { width: 300, height: 120, padTop: 10, padBottom: 20, padLeft: 8, padRight: 8 };
  const d = P.distributionPath(MODEL, geom);
  const nums = d.replace(/[ML]/g, " ").trim().split(/[\s]+/).map(Number);
  for (let i = 0; i < nums.length; i += 2) {
    const x = nums[i], y = nums[i + 1];
    assert.ok(x >= geom.padLeft - 0.01 && x <= geom.width - geom.padRight + 0.01, `x out of box: ${x}`);
    assert.ok(y >= geom.padTop - 0.01 && y <= geom.height - geom.padBottom + 0.01, `y out of box: ${y}`);
  }
});

test("an empty slice returns an empty path rather than junk", () => {
  assert.strictEqual(P.distributionPath(MODEL, { from: 400, to: 400 }), "");
  assert.strictEqual(P.distributionPath(null, {}), "");
});

test("projectScore clamps the marker into the drawn domain", () => {
  const geom = { width: 320, height: 130, min: 150, max: 600 };
  const inside = P.projectScore(MODEL, 300, geom);
  assert.ok(inside.x > 0 && !inside.clamped);
  assert.ok(P.projectScore(MODEL, 10, geom).clamped);
  assert.ok(P.projectScore(MODEL, 9000, geom).clamped);
  // A faster score always sits to the left of a slower one.
  assert.ok(P.projectScore(MODEL, 200, geom).x < P.projectScore(MODEL, 400, geom).x);
});

test("axisTicks span the domain in order", () => {
  const ticks = P.axisTicks(MODEL, { min: 150, max: 600 }, 4);
  assert.strictEqual(ticks.length, 5);
  assert.strictEqual(ticks[0].score, 150);
  assert.strictEqual(ticks[4].score, 600);
  for (let i = 1; i < ticks.length; i++) assert.ok(ticks[i].x > ticks[i - 1].x);
});

/* =================== the reference page =================== */
/* Its table is static HTML for crawlers, so nothing keeps it in step with the
   module except these assertions. If the model changes, they fail. */

const PAGE = path.join(REPO, "reaction-time-percentiles/index.html");
const ALIAS = path.join(REPO, "reaction-time-percentiles.html");
const pageHtml = fs.readFileSync(PAGE, "utf8");

test("the reference page prints the model's own quantile table", () => {
  for (const row of MODEL.quantiles) {
    assert.ok(
      pageHtml.includes(`<td>${row.percentile}% of the modelled population</td><td class="num">${row.ms}ms</td>`),
      `page is missing the p${row.percentile} = ${row.ms}ms row`
    );
  }
});

test("the reference page prints the model's own age bands", () => {
  for (const band of MODEL.ageBands) {
    const browser = Math.round(band.labMs + MODEL.browserOffsetMs);
    assert.ok(
      pageHtml.includes(`<td>${band.label}</td><td class="num">${band.n}</td><td class="num">${band.labMs.toFixed(1)}ms</td><td class="num">${browser}ms</td>`),
      `page is missing or disagrees on the ${band.label} age band`
    );
  }
});

test("the reference page states the model's parameters and cites every source", () => {
  assert.ok(pageHtml.includes(`${MODEL.median}ms`), "page must state the median it is built on");
  assert.ok(pageHtml.includes(`<strong>${MODEL.sd}ms</strong>`), "page must state the derived SD");
  assert.ok(pageHtml.includes(`${MODEL.browserOffsetMs}ms to each`), "page must explain the browser offset");
  for (const source of P.SOURCES) {
    assert.ok(pageHtml.includes(source.url), `page does not cite ${source.id}`);
    assert.ok(pageHtml.includes(source.citation), `page is missing the full citation for ${source.id}`);
  }
});

test("the flat alias is identical to the clean-path page and both canonicalise to the clean path", () => {
  assert.strictEqual(fs.readFileSync(ALIAS, "utf8"), pageHtml, "alias has drifted from the canonical page");
  const canonical = '<link rel="canonical" href="https://reflexzap.com/reaction-time-percentiles/">';
  assert.ok(pageHtml.includes(canonical), "canonical must point at the clean path");
});

test("the reference page carries the portfolio furniture", () => {
  // One Auto-ads tag, no manual ad units, and the erabb.it mark last in <body>.
  const adTags = pageHtml.match(/adsbygoogle\.js\?client=ca-pub-7560786263587509/g) || [];
  assert.strictEqual(adTags.length, 1, "exactly one Auto-ads script tag");
  assert.ok(!/class="[^"]*ad-slot/.test(pageHtml), "no manually placed ad units");
  // Scripts may sit between the footer and the mark — the year stamp, and the
  // toolbar's nav.js, which loads last so the chrome never blocks the article.
  assert.match(pageHtml, /<\/footer>\s*(<script[^>]*>[^<]*<\/script>\s*)*<a href="https:\/\/erabb\.it" class="erabbit-mark"/);
  assert.match(pageHtml, /erabbit-mark[\s\S]*?<\/a>\s*<\/body>/, "the mark must be the last element in body");
  assert.ok(pageHtml.includes('aria-current="page"'), "the active nav link must be marked");
});

test("the reference page makes no external requests", () => {
  const external = [...pageHtml.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)]
    .map((m) => m[1])
    .filter((u) => !u.startsWith("https://reflexzap.com/"))
    .filter((u) => !u.startsWith("https://pagead2.googlesyndication.com/")) // the one allowed ad tag
    .filter((u) => !/^https?:\/\/(doi\.org|humanbenchmark\.com|erabb\.it|schema\.org)/.test(u)); // plain links, not loads
  assert.deepStrictEqual(external, [], "unexpected external resource");
  assert.ok(!/<link[^>]+fonts\./.test(pageHtml), "no web fonts");
});

/* ======================= honesty guards ======================= */
/* These exist because mislabelling a modelled figure as this site's own
   visitor data would be fabricated statistics, not a feature. */

test("comparison copy attributes the figures to published studies", () => {
  const text = P.comparisonText(280, MODEL);
  assert.match(text, /published/i, "comparison copy must name its source class");
  assert.ok(/^Faster than \d+% of /.test(text), `unexpected copy: ${text}`);
  assert.strictEqual(P.comparisonText(NaN, MODEL), "");
});

test("no shipped file claims the percentiles come from this site's visitors", () => {
  const banned = [
    /than other (visitors|players|users)/i,
    /of (our|site) (visitors|users|players)/i,
    /(visitors|users|players) (who|that) (have )?(took|taken|tried) (this|the) test/i,
    /people who (took|have taken) this test/i,
    /(everyone|others) (who|that) (took|played)/i,
    /our (database|dataset|data) of (results|scores|times)/i,
    /\bwe (collect|aggregate|store|track) (your |the )?(results|scores|times)/i,
  ];
  const files = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === ".git" || entry.name === ".worktrees" || entry.name === "node_modules") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(html|js)$/.test(entry.name)) files.push(full);
    }
  })(REPO);
  assert.ok(files.length > 5, "expected to scan the site's pages");
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    for (const pattern of banned) {
      assert.ok(
        !pattern.test(text),
        `${path.relative(REPO, file)} implies visitor-data aggregation: ${pattern}`
      );
    }
  }
});
