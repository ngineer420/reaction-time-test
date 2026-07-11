/* reflexzap.com — Reaction Time Test
   Pure vanilla JS, zero dependencies, zero build step. */

/* ============================= pure stats / rating logic =============================
   Kept free of DOM access so it can be required() and unit-tested from Node directly. */

function computeAverage(times) {
  if (!Array.isArray(times) || times.length === 0) return NaN;
  const sum = times.reduce((a, b) => a + b, 0);
  return Math.round(sum / times.length);
}

function computeBest(times) {
  if (!Array.isArray(times) || times.length === 0) return NaN;
  return Math.min(...times);
}

function getRatingLabel(avgMs) {
  if (!Number.isFinite(avgMs)) return "";
  if (avgMs < 200) return "Superhuman";
  if (avgMs < 250) return "Excellent";
  if (avgMs < 300) return "Above Average";
  if (avgMs < 350) return "Average";
  return "Below Average — try again!";
}

const RATING_NOTES = {
  "Superhuman": "That's faster than nearly all recorded human visual reaction times — enjoy the bragging rights (or try again to confirm it wasn't an early click).",
  "Excellent": "Well above typical human reaction speed. Nicely done.",
  "Above Average": "Faster than most people's average reaction time.",
  "Average": "Right in the typical human range of roughly 200–300ms.",
  "Below Average — try again!": "On the slower side today — fatigue, distraction, or device input lag can all add extra milliseconds.",
};

/* Rough, illustrative percentile bands mapped onto the existing rating tiers above.
   Not derived from a real population study — just a fun approximation so results feel
   meaningful at a glance, paired with the disclaimer already shown on the results panel. */
const RATING_PERCENTILE = {
  "Superhuman": 99,
  "Excellent": 90,
  "Above Average": 70,
  "Average": 40,
  "Below Average — try again!": 15,
};

function getPercentileNote(avgMs) {
  const label = getRatingLabel(avgMs);
  const pct = RATING_PERCENTILE[label];
  if (!Number.isFinite(pct)) return "";
  return `Faster than about ${pct}% of people tested.`;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    computeAverage,
    computeBest,
    getRatingLabel,
    RATING_NOTES,
    RATING_PERCENTILE,
    getPercentileNote,
  };
}

/* ============================= DOM-bound app ============================= */

(function () {
  if (typeof document === "undefined") return;

  const ROUNDS = 5;
  const MIN_DELAY_MS = 2000;
  const MAX_DELAY_MS = 5000;
  const TOO_SOON_DISPLAY_MS = 1400;
  const ROUND_RESULT_DISPLAY_MS = 1100;
  const TOAST_DISPLAY_MS = 1800;
  const MAX_HISTORY = 10;
  const SITE_URL = "https://reflexzap.com/";

  const BEST_KEY = "reflexzap_best_ms";
  const HISTORY_KEY = "reflexzap_history";
  const THEME_KEY = "reflexzap_theme";

  /* ---------- theme toggle ---------- */
  (function initTheme() {
    let stored = null;
    try { stored = localStorage.getItem(THEME_KEY); } catch (e) { /* ignore */ }
    if (stored) document.documentElement.setAttribute("data-theme", stored);
    const btn = document.getElementById("theme-toggle");
    if (!btn) return;
    btn.addEventListener("click", () => {
      const current =
        document.documentElement.getAttribute("data-theme") ||
        (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
      const next = current === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* ignore */ }
    });
  })();

  document.getElementById("year").textContent = new Date().getFullYear();

  /* ---------- storage helpers ---------- */
  function loadBest() {
    try {
      const raw = localStorage.getItem(BEST_KEY);
      const n = raw === null ? NaN : Number(raw);
      return Number.isFinite(n) ? n : null;
    } catch (e) {
      return null;
    }
  }

  function saveBest(ms) {
    try { localStorage.setItem(BEST_KEY, String(ms)); } catch (e) { /* ignore */ }
  }

  function loadHistory() {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function saveHistory(list) {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list)); } catch (e) { /* ignore */ }
  }

  /* ---------- DOM refs ---------- */
  const stageEl = document.getElementById("test-stage");
  const stageContent = document.getElementById("stage-content");
  const roundLabel = document.getElementById("round-label");
  const bestChipValue = document.getElementById("best-chip-value");
  const stageControls = document.getElementById("stage-controls");
  const startBtn = document.getElementById("start-btn");

  const stageRoundPill = document.getElementById("stage-round-pill");
  const cancelBtn = document.getElementById("stage-cancel-btn");

  const resultsPanel = document.getElementById("results-panel");
  const ratingLabelEl = document.getElementById("rating-label");
  const ratingNoteEl = document.getElementById("rating-note");
  const ratingPercentileEl = document.getElementById("rating-percentile");
  const resultAvgEl = document.getElementById("result-avg");
  const resultBestEl = document.getElementById("result-best");
  const resultAllTimeBestEl = document.getElementById("result-alltime-best");
  const roundsTbody = document.getElementById("rounds-tbody");
  const roundsChart = document.getElementById("rounds-chart");
  const retryBtn = document.getElementById("retry-btn");
  const copyBtn = document.getElementById("copy-btn");

  const historyEmpty = document.getElementById("history-empty");
  const historyTable = document.getElementById("history-table");
  const historyTbody = document.getElementById("history-tbody");
  const historySparkline = document.getElementById("history-sparkline");

  const toast = document.getElementById("toast");

  const IDLE_CONTENT_HTML =
    '<p class="stage-title">Ready to test your reflexes?</p>' +
    '<p class="stage-sub">Click Start, then click the box the instant it turns green.</p>';

  const FINISH_TRANSITION_MS = 220;

  /* ---------- state ---------- */
  let state = "idle"; // idle | waiting | ready | toosoon | round-result | done
  let currentRound = 0;
  let roundTimes = [];
  let greenAt = 0;
  let waitTimeoutId = null;
  let advanceTimeoutId = null;
  let toastTimeoutId = null;

  function randomDelay() {
    return MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS);
  }

  function setStageState(cls) {
    stageEl.classList.remove(
      "state-idle", "state-waiting", "state-ready",
      "state-toosoon", "state-result", "state-done"
    );
    stageEl.classList.add(cls);
  }

  // Replaces the stage message and restarts its entrance animation so every
  // state change (wait / ready / too soon / round result) reads as a
  // deliberate transition instead of an instant text swap.
  function setStageContentHTML(html) {
    stageContent.innerHTML = html;
    stageContent.classList.remove("content-anim");
    void stageContent.offsetWidth; // force reflow so the animation restarts
    stageContent.classList.add("content-anim");
  }

  function triggerShake(el) {
    el.classList.remove("stage-shake");
    void el.offsetWidth;
    el.classList.add("stage-shake");
  }

  function updateRoundLabel(text) {
    const label = text || `Round ${currentRound + 1} of ${ROUNDS}`;
    roundLabel.textContent = label;
    if (stageRoundPill) stageRoundPill.textContent = label;
  }

  // The active portion of the test (waiting / ready / too-soon / round-result)
  // goes true full-bleed: the whole viewport becomes the color cue, not a
  // contained box, so there's zero ambiguity about what to watch.
  function enterFullBleed() {
    stageEl.classList.add("is-active");
    document.body.classList.add("test-active");
  }

  function exitFullBleed() {
    stageEl.classList.remove("is-active", "stage-exiting");
    document.body.classList.remove("test-active");
  }

  function renderBestChip() {
    const best = loadBest();
    bestChipValue.textContent = best !== null && Number.isFinite(best) ? `${best}ms` : "—";
  }

  function clearTimers() {
    if (waitTimeoutId) { clearTimeout(waitTimeoutId); waitTimeoutId = null; }
    if (advanceTimeoutId) { clearTimeout(advanceTimeoutId); advanceTimeoutId = null; }
  }

  function startTest() {
    clearTimers();
    currentRound = 0;
    roundTimes = [];
    resultsPanel.hidden = true;
    stageControls.hidden = true;
    enterFullBleed();
    beginRound();
  }

  function beginRound() {
    state = "waiting";
    setStageState("state-waiting");
    updateRoundLabel();
    setStageContentHTML(
      '<p class="stage-title">Wait for green...</p>' +
      '<p class="stage-sub">Click as soon as the box turns green.</p>'
    );
    const delay = randomDelay();
    waitTimeoutId = setTimeout(() => {
      waitTimeoutId = null;
      state = "ready";
      greenAt = performance.now();
      setStageState("state-ready");
      setStageContentHTML('<p class="stage-title">Click!</p>');
    }, delay);
  }

  function handleTooSoon() {
    clearTimers();
    state = "toosoon";
    setStageState("state-toosoon");
    triggerShake(stageEl);
    setStageContentHTML(
      '<p class="stage-title">Not yet!</p>' +
      '<p class="stage-sub">You clicked before it turned green — wait for it next time.</p>'
    );
    advanceTimeoutId = setTimeout(() => {
      advanceTimeoutId = null;
      beginRound();
    }, TOO_SOON_DISPLAY_MS);
  }

  function handleClickWhileReady() {
    const rawElapsed = performance.now() - greenAt;
    const elapsed = Math.max(0, Math.round(Number.isFinite(rawElapsed) ? rawElapsed : 0));
    roundTimes.push(elapsed);

    state = "round-result";
    setStageState("state-result");
    setStageContentHTML(
      `<p class="stage-time">${elapsed}ms</p>` +
      `<p class="stage-sub">Round ${currentRound + 1} of ${ROUNDS}</p>`
    );

    currentRound += 1;

    advanceTimeoutId = setTimeout(() => {
      advanceTimeoutId = null;
      if (currentRound >= ROUNDS) {
        finishSession();
      } else {
        beginRound();
      }
    }, ROUND_RESULT_DISPLAY_MS);
  }

  function handleStageActivate() {
    if (state === "waiting") { handleTooSoon(); return; }
    if (state === "ready") { handleClickWhileReady(); return; }
    // idle / toosoon / round-result / done: ignore extra activations
  }

  function cancelTest() {
    clearTimers();
    state = "idle";
    exitFullBleed();
    setStageState("state-idle");
    updateRoundLabel("Round 1 of 5");
    setStageContentHTML(IDLE_CONTENT_HTML);
    stageControls.hidden = false;
  }

  function finishSession() {
    // Let the full-bleed color state fade out before collapsing back into the
    // normal page layout, rather than snapping straight to the results panel.
    stageEl.classList.add("stage-exiting");
    advanceTimeoutId = setTimeout(() => {
      advanceTimeoutId = null;
      state = "done";
      exitFullBleed();
      setStageState("state-done");
      updateRoundLabel("Complete");
      setStageContentHTML(
        '<p class="stage-title">Test complete!</p>' +
        '<p class="stage-sub">See your results below.</p>'
      );

      const avg = computeAverage(roundTimes);
      const best = computeBest(roundTimes);

      const prevBest = loadBest();
      const newAllTimeBest = prevBest === null || best < prevBest ? best : prevBest;
      if (newAllTimeBest !== prevBest) saveBest(newAllTimeBest);
      renderBestChip();

      const history = loadHistory();
      history.unshift({ date: new Date().toISOString(), avg });
      const trimmed = history.slice(0, MAX_HISTORY);
      saveHistory(trimmed);

      renderResults(avg, best, newAllTimeBest);
      renderHistory(trimmed);

      resultsPanel.hidden = false;
      resultsPanel.classList.remove("panel-enter");
      void resultsPanel.offsetWidth;
      resultsPanel.classList.add("panel-enter");
      resultsPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, FINISH_TRANSITION_MS);
  }

  function renderResults(avg, best, allTimeBest) {
    const label = getRatingLabel(avg);
    ratingLabelEl.textContent = label;
    ratingNoteEl.textContent = RATING_NOTES[label] || "";
    ratingPercentileEl.textContent = getPercentileNote(avg);

    resultAvgEl.textContent = `${avg}ms`;
    resultBestEl.textContent = `${best}ms`;
    resultAllTimeBestEl.textContent = Number.isFinite(allTimeBest) ? `${allTimeBest}ms` : "—";

    roundsTbody.innerHTML = roundTimes
      .map((t, i) => `<tr><td>Round ${i + 1}</td><td class="num">${t}ms</td></tr>`)
      .join("");

    renderChart(roundTimes, avg, best);
  }

  // Simple SVG bar chart: one bar per round, height scaled to its ms value,
  // fastest round highlighted, average shown as a dashed reference line.
  // No charting library needed for 5 data points.
  function renderChart(times, avg, best) {
    if (!roundsChart || !times.length) return;
    const w = 320;
    const h = 168;
    const padTop = 30;
    const padBottom = 28;
    const padSide = 12;
    const chartH = h - padTop - padBottom;
    const domainMax = Math.max(...times) * 1.15 || 1;

    function yFor(v) {
      const ratio = Math.max(0, Math.min(1, v / domainMax));
      return padTop + (1 - ratio) * chartH;
    }

    const avgY = yFor(avg);
    const barSlot = (w - padSide * 2) / times.length;
    const barW = barSlot * 0.6;

    const bars = times
      .map((t, i) => {
        const slotX = padSide + i * barSlot + (barSlot - barW) / 2;
        const y = yFor(t);
        const barH = Math.max(2, padTop + chartH - y);
        const isBest = t === best;
        return (
          `<rect x="${slotX.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${barH.toFixed(1)}" rx="4" ` +
          `class="chart-bar${isBest ? " chart-bar--best" : ""}"><title>Round ${i + 1}: ${t}ms</title></rect>` +
          `<text x="${(slotX + barW / 2).toFixed(1)}" y="${(y - 6).toFixed(1)}" class="chart-bar-value" text-anchor="middle">${t}</text>` +
          `<text x="${(slotX + barW / 2).toFixed(1)}" y="${h - 8}" class="chart-bar-label" text-anchor="middle">R${i + 1}</text>`
        );
      })
      .join("");

    roundsChart.innerHTML =
      `<svg viewBox="0 0 ${w} ${h}" class="chart-svg" role="img" aria-label="Bar chart of your 5 round times in milliseconds. Average ${avg} milliseconds, best ${best} milliseconds.">` +
      `<line x1="${padSide}" y1="${avgY.toFixed(1)}" x2="${w - padSide}" y2="${avgY.toFixed(1)}" class="chart-avg-line" />` +
      `<text x="${w - padSide}" y="${(avgY - 6).toFixed(1)}" text-anchor="end" class="chart-avg-label">avg ${avg}ms</text>` +
      bars +
      `</svg>`;
  }

  // Compact sparkline of past session averages, reusing the existing
  // localStorage history list (most-recent-first) — no new storage added.
  function renderSparkline(list) {
    if (!historySparkline) return;
    if (!list.length) {
      historySparkline.hidden = true;
      historySparkline.innerHTML = "";
      return;
    }
    historySparkline.hidden = false;

    const chrono = list.slice().reverse(); // oldest -> newest, left to right
    const w = 280;
    const h = 44;
    const pad = 6;
    const vals = chrono.map((e) => e.avg);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const range = max - min || 1;
    const stepX = chrono.length > 1 ? (w - pad * 2) / (chrono.length - 1) : 0;

    const points = chrono.map((entry, i) => {
      const x = pad + i * stepX;
      const y = pad + (1 - (entry.avg - min) / range) * (h - pad * 2);
      return { x, y, entry };
    });

    const polyline =
      points.length > 1
        ? `<polyline points="${points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}" class="spark-line" fill="none" />`
        : "";

    const dots = points
      .map((p, i) => {
        const isLast = i === points.length - 1;
        return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${isLast ? 3.5 : 2.5}" class="spark-dot${isLast ? " spark-dot--current" : ""}"><title>${formatHistoryDate(p.entry.date)}: ${p.entry.avg}ms</title></circle>`;
      })
      .join("");

    historySparkline.innerHTML =
      `<svg viewBox="0 0 ${w} ${h}" class="spark-svg" role="img" aria-label="Sparkline of your last ${chrono.length} session averages, oldest to newest">` +
      polyline +
      dots +
      `</svg>`;
  }

  function formatHistoryDate(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  function renderHistory(list) {
    renderSparkline(list);
    if (!list.length) {
      historyEmpty.hidden = false;
      historyTable.hidden = true;
      return;
    }
    historyEmpty.hidden = true;
    historyTable.hidden = false;
    historyTbody.innerHTML = list
      .map((entry) => `<tr><td>${formatHistoryDate(entry.date)}</td><td class="num">${entry.avg}ms</td></tr>`)
      .join("");
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    if (toastTimeoutId) clearTimeout(toastTimeoutId);
    toastTimeoutId = setTimeout(() => {
      toast.classList.remove("show");
      toastTimeoutId = null;
    }, TOAST_DISPLAY_MS);
  }

  function copyResult() {
    const avg = computeAverage(roundTimes);
    if (!Number.isFinite(avg)) return;
    const text = `My average reaction time is ${avg}ms on Reaction Time Test! Try to beat me: ${SITE_URL}`;

    function fallbackCopy() {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch (e) { /* ignore */ }
      document.body.removeChild(ta);
      showToast("Copied!");
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        () => showToast("Copied!"),
        () => fallbackCopy()
      );
    } else {
      fallbackCopy();
    }
  }

  /* ---------- event wiring ---------- */
  // A single pointerdown listener handles mouse, touch, and pen without double-firing
  // (pointer events unify these; we deliberately do not also listen for "click").
  stageEl.addEventListener("pointerdown", handleStageActivate);
  stageEl.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " " || e.key === "Spacebar") && !e.repeat) {
      e.preventDefault();
      handleStageActivate();
    }
  });

  startBtn.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    startTest();
  });
  if (cancelBtn) {
    cancelBtn.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      cancelTest();
    });
  }
  retryBtn.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    startTest();
  });
  copyBtn.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    copyResult();
  });

  /* ---------- init ---------- */
  renderBestChip();
  renderHistory(loadHistory());
})();
