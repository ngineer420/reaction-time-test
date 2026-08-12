/* percentile.js — a cited, population-model percentile engine.
   DOM-free and dependency-free. Loaded before app.js as a plain <script>;
   also require()-able from Node for unit tests.

   ─────────────────────────────────────────────────────────────────────────
   WHAT THIS IS, AND WHAT IT IS NOT
   ─────────────────────────────────────────────────────────────────────────
   The percentiles this file produces come from a MODEL fitted to figures
   published in the scientific literature and in one large public web
   dataset — every one of them cited in the SOURCES block below.

   They are NOT this site's own visitor data. This site has no backend and
   stores nothing off your device; it cannot and does not aggregate results.
   Any copy rendered from this module must name that origin — the model's
   `populationPhrase` carries the wording — and must never imply "other
   visitors here". A test greps every shipped page for the phrasings that
   would break that. If a number cannot be traced to a source below, it does
   not belong here.

   ─────────────────────────────────────────────────────────────────────────
   PORTING THIS TO ANOTHER SITE
   ─────────────────────────────────────────────────────────────────────────
   Everything above the "SITE-SPECIFIC POPULATION MODEL" heading is generic:
   it knows about scores, not about milliseconds. To reuse it on cpsboost /
   wpmflex / flicktrainer / chimpmemory, replace the model object (and its
   SOURCES) and leave the engine alone. `lowerIsBetter: false` covers the
   sites where a bigger score is the better score.
*/

(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PercentileEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /* ===================== generic math ===================== */

  /* Abramowitz & Stegun 7.1.26 rational approximation of the error function
     (|error| < 1.5e-7). Monotone across the range we evaluate it over, which
     is what keeps percentileForScore monotone — see test/percentile.test.js. */
  function erf(x) {
    var sign = x < 0 ? -1 : 1;
    var ax = Math.abs(x);
    var t = 1 / (1 + 0.3275911 * ax);
    var y =
      1 -
      ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
        0.254829592) *
        t *
        Math.exp(-ax * ax);
    return sign * y;
  }

  function normalCdf(z) {
    return 0.5 * (1 + erf(z / Math.SQRT2));
  }

  /* Inverse standard normal CDF — Acklam's rational approximation
     (|error| < 1.15e-9). Used to turn a percentile back into a score. */
  function normalQuantile(p) {
    if (p <= 0) return -Infinity;
    if (p >= 1) return Infinity;
    var a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
             1.383577518672690e2, -3.066479806614716e1, 2.506628277459239e0];
    var b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
             6.680131188771972e1, -1.328068155288572e1];
    var c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838e0,
             -2.549732539343734e0, 4.374664141464968e0, 2.938163982698783e0];
    var d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996e0,
             3.754408661907416e0];
    var pLow = 0.02425, pHigh = 1 - pLow, q, r;
    if (p < pLow) {
      q = Math.sqrt(-2 * Math.log(p));
      return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
             ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    if (p > pHigh) {
      q = Math.sqrt(-2 * Math.log(1 - p));
      return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
              ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    q = p - 0.5;
    r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
           (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }

  /* A lognormal is the standard shape for reaction-time-like data: bounded
     below by zero, right-skewed, long slow tail. Optional `shift` moves the
     floor; mu/sigma describe log(score - shift).

     The model is pinned to TWO published numbers and has no free parameters.
     Anchor it on whichever central figure the source actually reports:

       median given (preferred — robust to a junk tail):
         M       = median - shift
         u       = exp(sigma^2), solved from  SD^2 = M^2 * u * (u - 1)
                   ->  u = (1 + sqrt(1 + 4*(SD/M)^2)) / 2
         mu      = ln(M)

       mean given:
         m       = mean - shift
         sigma^2 = ln(1 + SD^2 / m^2)
         mu      = ln(m) - sigma^2 / 2                                      */
  function lognormalParams(model) {
    var shift = model.shift || 0;
    var sd = model.sd;
    if (model.median != null) {
      var M = model.median - shift;
      var k = (sd / M) * (sd / M);
      var u = (1 + Math.sqrt(1 + 4 * k)) / 2;
      return { mu: Math.log(M), sigma: Math.sqrt(Math.log(u)), shift: shift };
    }
    var m = model.mean - shift;
    var sigmaSq = Math.log(1 + (sd * sd) / (m * m));
    return { mu: Math.log(m) - sigmaSq / 2, sigma: Math.sqrt(sigmaSq), shift: shift };
  }

  function paramsFor(model) {
    if (!model._params) model._params = lognormalParams(model);
    return model._params;
  }

  /* ===================== generic engine ===================== */

  /* Share (0..1) of the modelled population scoring at or below `score`. */
  function shareAtOrBelow(model, score) {
    var p = paramsFor(model);
    var x = score - p.shift;
    if (!(x > 0)) return 0;
    return normalCdf((Math.log(x) - p.mu) / p.sigma);
  }

  /* Raw score at a given share (0..1) of the population. */
  function scoreAtShare(model, share) {
    var p = paramsFor(model);
    if (share <= 0) return p.shift;
    if (share >= 1) return Infinity;
    return p.shift + Math.exp(p.mu + p.sigma * normalQuantile(share));
  }

  /* Probability density at `score` (unnormalised units are fine — only ever
     used to give the drawn curve its shape). */
  function density(model, score) {
    var p = paramsFor(model);
    var x = score - p.shift;
    if (!(x > 0)) return 0;
    var z = (Math.log(x) - p.mu) / p.sigma;
    return Math.exp(-0.5 * z * z) / (x * p.sigma * Math.sqrt(2 * Math.PI));
  }

  function modeOf(model) {
    var p = paramsFor(model);
    return p.shift + Math.exp(p.mu - p.sigma * p.sigma);
  }

  /* THE headline function: what percentage of the modelled population does
     this score beat? Always finite and within 0-100. Monotone — a better
     score can never come back with a lower percentile. */
  function percentileForScore(score, model) {
    if (!model || !Number.isFinite(score)) return NaN;
    var below = shareAtOrBelow(model, score);
    var beaten = model.lowerIsBetter ? 1 - below : below;
    return Math.min(100, Math.max(0, beaten * 100));
  }

  /* Inverse: the score sitting at "beats P% of the population". */
  function scoreForPercentile(percentile, model) {
    if (!model || !Number.isFinite(percentile)) return NaN;
    var beaten = Math.min(100, Math.max(0, percentile)) / 100;
    return scoreAtShare(model, model.lowerIsBetter ? 1 - beaten : beaten);
  }

  /* Display form. Clamped to 1-99: the tails of a smooth model fitted to
     published summary statistics do not support "beats 100% of people". */
  function formatPercentile(percentile) {
    if (!Number.isFinite(percentile)) return "";
    return String(Math.min(99, Math.max(1, Math.round(percentile))));
  }

  /* Comparison copy. The population wording is owned by the model so it can
     never drift into implying we aggregate visitor results. */
  function comparisonText(score, model) {
    if (!model || !Number.isFinite(score)) return "";
    var pct = formatPercentile(percentileForScore(score, model));
    return model.betterWord + " than " + pct + "% of " + model.populationPhrase + ".";
  }

  /* A quantile table: [{ percentile, score }, ...] for the reference page and
     for the results-screen ladder. `percentile` is again "beats this many".
     Scores are rounded to model.precision decimals — whole milliseconds here,
     but a clicks-per-second model would want 2. */
  function quantileTable(model, percentiles) {
    var factor = Math.pow(10, model.precision || 0);
    return (percentiles || DEFAULT_PERCENTILES).map(function (p) {
      return { percentile: p, score: Math.round(scoreForPercentile(p, model) * factor) / factor };
    });
  }

  var DEFAULT_PERCENTILES = [99, 95, 90, 75, 50, 25, 10, 5];

  /* ===================== generic curve geometry ===================== */

  function resolveGeom(model, geom) {
    var g = geom || {};
    var domain = model.domain || [model.mean - 3 * model.sd, model.mean + 4 * model.sd];
    return {
      width: g.width || 320,
      height: g.height || 130,
      padTop: g.padTop == null ? 12 : g.padTop,
      padBottom: g.padBottom == null ? 26 : g.padBottom,
      padLeft: g.padLeft == null ? 10 : g.padLeft,
      padRight: g.padRight == null ? 10 : g.padRight,
      min: g.min == null ? domain[0] : g.min,
      max: g.max == null ? domain[1] : g.max,
      samples: g.samples || 96,
    };
  }

  function scalesFor(model, geom) {
    var g = resolveGeom(model, geom);
    var plotW = g.width - g.padLeft - g.padRight;
    var plotH = g.height - g.padTop - g.padBottom;
    var span = g.max - g.min || 1;
    var peak = density(model, modeOf(model)) || 1;
    return {
      g: g,
      baseline: g.padTop + plotH,
      xFor: function (score) {
        var t = (score - g.min) / span;
        return g.padLeft + Math.min(1, Math.max(0, t)) * plotW;
      },
      yFor: function (score) {
        var d = density(model, score) / peak;
        return g.padTop + (1 - Math.min(1, Math.max(0, d))) * plotH;
      },
    };
  }

  /* SVG path `d` for the distribution curve.
     opts.close — close the path down to the baseline (a fillable area)
     opts.step  — draw a staircase instead of a smooth polyline
     opts.from / opts.to — draw only that score slice (used to shade the part
     of the population the visitor beat). */
  function distributionPath(model, geom) {
    if (!model) return "";
    var s = scalesFor(model, geom);
    var g = s.g;
    var from = geom && geom.from != null ? Math.max(g.min, geom.from) : g.min;
    var to = geom && geom.to != null ? Math.min(g.max, geom.to) : g.max;
    if (!(to > from)) return "";
    var stepped = !!(geom && geom.step);
    var step = (to - from) / g.samples;
    var parts = [];
    for (var i = 0; i <= g.samples; i++) {
      var score = from + i * step;
      var x = s.xFor(score).toFixed(2);
      var y = s.yFor(score).toFixed(2);
      // A staircase repeats each sample's height across its own bin width, so
      // the curve reads as hard-edged pixel steps rather than a smooth spline.
      if (stepped && i > 0) parts.push("L" + x + " " + parts[parts.length - 1].split(" ")[1]);
      parts.push((i === 0 ? "M" : "L") + x + " " + y);
    }
    var d = parts.join(" ");
    if (geom && geom.close) {
      d += " L" + s.xFor(to).toFixed(2) + " " + s.baseline.toFixed(2);
      d += " L" + s.xFor(from).toFixed(2) + " " + s.baseline.toFixed(2) + " Z";
    }
    return d;
  }

  /* Where the visitor's marker sits on that same curve. */
  function projectScore(model, score, geom) {
    var s = scalesFor(model, geom);
    var clamped = Math.min(s.g.max, Math.max(s.g.min, score));
    return {
      score: clamped,
      x: s.xFor(clamped),
      y: s.yFor(clamped),
      baseline: s.baseline,
      top: s.g.padTop,
      clamped: clamped !== score,
    };
  }

  /* The slice of the drawn domain this score beats — the part of the curve
     worth shading. Which side that is depends only on model.lowerIsBetter,
     so callers stay unit-agnostic. */
  function beatenRange(model, score, geom) {
    var s = scalesFor(model, geom);
    var at = Math.min(s.g.max, Math.max(s.g.min, score));
    return model.lowerIsBetter ? { from: at, to: s.g.max } : { from: s.g.min, to: at };
  }

  /* Evenly spaced axis ticks across the drawn domain. */
  function axisTicks(model, geom, count) {
    var s = scalesFor(model, geom);
    var n = count || 4;
    var out = [];
    for (var i = 0; i <= n; i++) {
      var score = s.g.min + ((s.g.max - s.g.min) * i) / n;
      out.push({ score: Math.round(score), x: s.xFor(score) });
    }
    return out;
  }

  /* ===================== SOURCES ===================== */
  /* Every figure in the model below traces to one of these. Nothing in this
     file comes from visitors to this site. */

  var SOURCES = [
    {
      id: "woods2015",
      citation:
        "Woods DL, Wyma JM, Yund EW, Herron TJ, Reed B (2015). Factors influencing the " +
        "latency of simple reaction time. Frontiers in Human Neuroscience 9:131.",
      url: "https://doi.org/10.3389/fnhum.2015.00131",
      kind: "peer-reviewed",
      used:
        "Experiment 1, N = 1469, ages 18-65, 120 scored trials each. Mean simple visual " +
        "reaction time 231 ms (213 ms once the apparatus's own 17.8 ms hardware delay is " +
        "removed); between-subject SD 26.8 ms; mean intraindividual (trial-to-trial) SD " +
        "40.0 ms; age slope 0.55 ms/year; the seven age-band means below; measured display " +
        "delay 11.0 ms and response-button delay 6.8 ms. No significant sex difference.",
    },
    {
      id: "humanbenchmark",
      citation: "Human Benchmark — Reaction Time Statistics (accessed 2026).",
      url: "https://humanbenchmark.com/tests/reactiontime/statistics",
      kind: "web dataset",
      used:
        "Over 81 million browser-measured reaction time clicks: median 273 ms, mean 284 ms. " +
        "Also states \"30ms is currently a typical lag for a desktop/laptop\". Aggregated " +
        "by that site, not by this one.",
    },
    {
      id: "anwylirvine2021",
      citation:
        "Anwyl-Irvine A, Dalmaijer ES, Hodges N, Evershed JK (2021). Realistic precision " +
        "and accuracy of online experiment platforms, web browsers, and devices. " +
        "Behavior Research Methods 53(4):1407-1425.",
      url: "https://doi.org/10.3758/s13428-020-01501-5",
      kind: "peer-reviewed",
      used:
        "Response-time lag of browser-based experiment platforms, measured with a " +
        "calibrated robot actuator whose own initiation latency was accounted for: " +
        "platform means 71.3-87.4 ms; by browser, Safari 76.5 ms to Firefox 82.3 ms; " +
        "by system, Windows laptop 73.7 ms to macOS desktop 85.4 ms.",
    },
  ];

  /* ===================== SITE-SPECIFIC POPULATION MODEL ===================== */

  /* HOW THIS MODEL WAS BUILT — the whole derivation, so every number is checkable.

     What we are modelling: one person's AVERAGE over the 5 rounds this site
     runs, measured through a browser on ordinary consumer hardware. That is a
     different statistic from either source on its own, so each source supplies
     the part it actually measures.

     LOCATION — median 273 ms, from [humanbenchmark]: 81 million+ clicks on the
     same task in the same medium (a browser, on whatever hardware people own).
     We take their MEDIAN, not their mean of 284 ms: a raw single-click dataset
     has a long junk tail (distracted clicks, tab-switches, mistimed taps) that
     drags a mean upward, and a median is robust to it.

     SPREAD — 38 ms, derived from [woods2015], because no public web dataset
     publishes one. Woods et al. give both components:
       between-subject SD of a person's mean SRT ......... 26.8 ms
       mean intraindividual (trial-to-trial) SD .......... 40.0 ms
     Averaging only 5 rounds leaves sampling noise of 40.0 / sqrt(5) = 17.9 ms
     on top of the real between-person spread, so the SD of a 5-round average is
       sqrt(26.8^2 + 17.9^2) = 32.2 ms
     as a fraction of that study's own mean: 32.2 / 231 = 0.139. Applied to the
     browser-scale median above: 0.139 * 273 = 38.0 ms.
     (Woods' 26.8 ms itself carries 40.0/sqrt(120) = 3.7 ms of sampling noise;
     removing it changes the result by 0.2 ms, so it is ignored.)

     THE SHAPE is a two-parameter lognormal fixed by exactly those two numbers.
     There are no fitted, tuned or invented parameters anywhere in this model,
     and no observation of anyone's score on this site is used at any point. */

  var REACTION_TIME_MS = {
    id: "simple-visual-rt-ms",
    label: "Simple visual reaction time, 5-round browser average",
    unit: "ms",
    precision: 0,
    lowerIsBetter: true,
    betterWord: "Faster",
    // Reads as: "Faster than 74% of the population in published reaction-time
    // data." Says where the figure comes from without claiming it is ours.
    populationPhrase: "the population in published reaction-time data",
    source: "humanbenchmark",

    median: 273, // [humanbenchmark]
    sd: 38, // derived from [woods2015] — see the derivation above
    shift: 0,
    domain: [170, 450], // drawing range only; no effect on any percentile

    /* Lab figures read lower than browser figures because a browser test also
       measures the screen and the mouse. The gap between the two central
       values we cite is 273 - 231 = 42 ms, which is what the reference page
       uses to put the lab age bands on browser-test footing. */
    browserOffsetMs: 42,

    /* [woods2015] Table 2, Experiment 1 — printed exactly as published.
       `labMs` is their measured mean for the band; `n` their sample size. */
    ageBands: [
      { label: "18–24", n: 86, labMs: 217.9, labSd: 19.5, source: "woods2015" },
      { label: "25–31", n: 115, labMs: 221.0, labSd: 22.8, source: "woods2015" },
      { label: "32–38", n: 201, labMs: 224.8, labSd: 23.4, source: "woods2015" },
      { label: "39–45", n: 273, labMs: 227.7, labSd: 26.6, source: "woods2015" },
      { label: "46–51", n: 276, labMs: 233.6, labSd: 27.2, source: "woods2015" },
      { label: "51–58", n: 272, labMs: 236.4, labSd: 27.0, source: "woods2015" },
      { label: "59–65", n: 246, labMs: 239.1, labSd: 28.1, source: "woods2015" },
    ],

    quantiles: [], // filled below from the model itself, never hand-written
  };

  REACTION_TIME_MS.quantiles = [99, 95, 90, 75, 50, 25, 10, 5, 1].map(function (p) {
    return { percentile: p, ms: Math.round(scoreForPercentile(p, REACTION_TIME_MS)) };
  });

  return {
    // engine
    percentileForScore: percentileForScore,
    scoreForPercentile: scoreForPercentile,
    formatPercentile: formatPercentile,
    comparisonText: comparisonText,
    quantileTable: quantileTable,
    shareAtOrBelow: shareAtOrBelow,
    density: density,
    distributionPath: distributionPath,
    projectScore: projectScore,
    beatenRange: beatenRange,
    axisTicks: axisTicks,
    DEFAULT_PERCENTILES: DEFAULT_PERCENTILES,
    // math (exported for tests)
    erf: erf,
    normalCdf: normalCdf,
    normalQuantile: normalQuantile,
    lognormalParams: lognormalParams,
    // site data
    SOURCES: SOURCES,
    REACTION_TIME_MS: REACTION_TIME_MS,
  };
});
