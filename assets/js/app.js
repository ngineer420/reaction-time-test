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

if (typeof module !== "undefined" && module.exports) {
  module.exports = { computeAverage, computeBest, getRatingLabel, RATING_NOTES };
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

  const resultsPanel = document.getElementById("results-panel");
  const ratingLabelEl = document.getElementById("rating-label");
  const ratingNoteEl = document.getElementById("rating-note");
  const resultAvgEl = document.getElementById("result-avg");
  const resultBestEl = document.getElementById("result-best");
  const resultAllTimeBestEl = document.getElementById("result-alltime-best");
  const roundsTbody = document.getElementById("rounds-tbody");
  const retryBtn = document.getElementById("retry-btn");
  const copyBtn = document.getElementById("copy-btn");

  const historyEmpty = document.getElementById("history-empty");
  const historyTable = document.getElementById("history-table");
  const historyTbody = document.getElementById("history-tbody");

  const toast = document.getElementById("toast");

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

  function updateRoundLabel(text) {
    roundLabel.textContent = text || `Round ${currentRound + 1} of ${ROUNDS}`;
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
    beginRound();
  }

  function beginRound() {
    state = "waiting";
    setStageState("state-waiting");
    updateRoundLabel();
    stageContent.innerHTML =
      '<p class="stage-title">Wait for green...</p>' +
      '<p class="stage-sub">Click as soon as the box turns green.</p>';
    const delay = randomDelay();
    waitTimeoutId = setTimeout(() => {
      waitTimeoutId = null;
      state = "ready";
      greenAt = performance.now();
      setStageState("state-ready");
      stageContent.innerHTML = '<p class="stage-title">Click!</p>';
    }, delay);
  }

  function handleTooSoon() {
    clearTimers();
    state = "toosoon";
    setStageState("state-toosoon");
    stageContent.innerHTML =
      '<p class="stage-title">Too soon!</p>' +
      '<p class="stage-sub">Wait for green next time.</p>';
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
    stageContent.innerHTML =
      `<p class="stage-time">${elapsed}ms</p>` +
      `<p class="stage-sub">Round ${currentRound + 1} of ${ROUNDS}</p>`;

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

  function finishSession() {
    state = "done";
    setStageState("state-done");
    updateRoundLabel("Complete");
    stageContent.innerHTML =
      '<p class="stage-title">Test complete!</p>' +
      '<p class="stage-sub">See your results below.</p>';

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
    resultsPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function renderResults(avg, best, allTimeBest) {
    const label = getRatingLabel(avg);
    ratingLabelEl.textContent = label;
    ratingNoteEl.textContent = RATING_NOTES[label] || "";

    resultAvgEl.textContent = `${avg}ms`;
    resultBestEl.textContent = `${best}ms`;
    resultAllTimeBestEl.textContent = Number.isFinite(allTimeBest) ? `${allTimeBest}ms` : "—";

    roundsTbody.innerHTML = roundTimes
      .map((t, i) => `<tr><td>Round ${i + 1}</td><td class="num">${t}ms</td></tr>`)
      .join("");
  }

  function formatHistoryDate(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  function renderHistory(list) {
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
