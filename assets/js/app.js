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

/* Band descriptions only. The one comparative claim on this screen is the
   percentile below, which comes from the cited model in percentile.js — these
   notes must never make a competing "faster than N people" claim of their own. */
const RATING_NOTES = {
  "Superhuman": "Under 200ms on a browser test is exceptional — worth a second run to confirm it wasn't an early click.",
  "Excellent": "Inside the 200–250ms band, which is quick for a test running through a browser and a monitor.",
  "Above Average": "Inside the 250–300ms band — the range most healthy adults land in on a browser test.",
  "Average": "Inside the 300–350ms band. Screen refresh rate and input lag alone account for a chunk of this.",
  "Below Average — try again!": "On the slower side today — fatigue, distraction, or device input lag can all add extra milliseconds.",
};

/* Percentiles come from assets/js/percentile.js — a model fitted to figures
   published in the literature, every one of them cited in that file. They are
   NOT this site's own visitor data (there is no backend to aggregate one), and
   nothing rendered from them may imply otherwise. percentile.js is loaded ahead
   of this script in the page; under Node it is require()d so these helpers stay
   unit-testable. */
const PERCENTILE =
  (typeof globalThis !== "undefined" && globalThis.PercentileEngine) ||
  (typeof require === "function" ? require("./percentile.js") : null);

function getPercentileNote(avgMs, modelName) {
  if (!PERCENTILE || !Number.isFinite(avgMs)) return "";
  const model = PERCENTILE[modelName || "REACTION_TIME_MS"];
  return model ? PERCENTILE.comparisonText(avgMs, model) : "";
}

/* Rating band for a test that has no absolute-ms convention of its own.
   Read off that test's own cited distribution, so the label moves with the
   model instead of inheriting thresholds picked for a different stimulus. */
/* Band copy for the percentile-rated tests. The absolute-millisecond notes
   above name specific ms ranges, which are only meaningful for the visual
   test they were written for. */
const PERCENTILE_BAND_NOTES = {
  "Superhuman": "Inside the fastest 5% of the modelled population for this test — worth a second run to rule out a click that anticipated the cue.",
  "Excellent": "Inside the fastest fifth of the modelled population for this test.",
  "Above Average": "Above the middle of the modelled population for this test.",
  "Average": "Around the middle of the modelled population for this test — an ordinary result.",
  "Below Average — try again!": "Below the middle today. Fatigue, distraction and device lag each add milliseconds on their own.",
};

const PERCENTILE_BANDS = [
  { min: 95, label: "Superhuman" },
  { min: 80, label: "Excellent" },
  { min: 55, label: "Above Average" },
  { min: 25, label: "Average" },
  { min: 0, label: "Below Average — try again!" },
];

function getRatingFromPercentile(pct) {
  if (!Number.isFinite(pct)) return "";
  for (const band of PERCENTILE_BANDS) if (pct >= band.min) return band.label;
  return PERCENTILE_BANDS[PERCENTILE_BANDS.length - 1].label;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    computeAverage,
    computeBest,
    getRatingLabel,
    RATING_NOTES,
    PERCENTILE_BAND_NOTES,
    getPercentileNote,
    getRatingFromPercentile,
  };
}

/* ============================= DOM-bound app ============================= */

(function () {
  if (typeof document === "undefined") return;

  const MIN_DELAY_MS = 2000;
  const MAX_DELAY_MS = 5000;
  const TOO_SOON_DISPLAY_MS = 1400;
  const ROUND_RESULT_DISPLAY_MS = 1100;
  const NOGO_HOLD_MS = 1000;
  const TOAST_DISPLAY_MS = 1800;
  const MAX_HISTORY = 10;
  const THEME_KEY = "reflexzap_theme";

  /* ---------- the four tests ----------
     One engine, four pages. `data-mode` on <body> selects which stimulus a
     round waits for; everything that must not bleed between the tests hangs
     off this object — the cited model the percentile is read from, the
     localStorage keys, the share URL, the CPU rival's speed. An absent
     attribute is the original visual test, so index.html needs no change in
     behaviour and no page can silently fall into the wrong distribution.

     Each test measures a different thing, so each has its own published
     distribution in percentile.js. Only `visual` keeps the absolute-ms rating
     bands: they were chosen for simple visual reaction time and mean nothing
     for a tone or a go/no-go. The other three read their band off their own
     model's percentile, which is the only rating that stays honest when the
     underlying distribution moves. */
  const MODES = {
    visual: {
      key: "visual",
      scored: 5,
      model: "REACTION_TIME_MS",
      bestKey: "reflexzap_best_ms",
      historyKey: "reflexzap_history",
      url: "https://reflexzap.com/",
      gamified: true,
      goWord: "Click!",
      foulWord: "Too Soon!",
      rivalBase: 240, rivalSpread: 170,
      waitHtml:
        '<p class="stage-title">Wait for green...</p>' +
        '<p class="stage-sub">Click as soon as the box turns green.</p>',
      idleHtml:
        '<p class="stage-title">Ready to test your reflexes?</p>' +
        '<p class="stage-sub">Click Start, then click the box the instant it turns green.</p>',
    },
    audio: {
      key: "audio",
      scored: 5,
      model: "AUDIO_REACTION_TIME_MS",
      bestKey: "reflexzap_audio_best_ms",
      historyKey: "reflexzap_audio_history",
      url: "https://reflexzap.com/audio-reaction-time-test/",
      gamified: false,
      goWord: "Click!",
      foulWord: "Too Soon!",
      rivalBase: 200, rivalSpread: 150,
      waitHtml:
        '<p class="stage-title">Listen...</p>' +
        '<p class="stage-sub">The screen will not change. Click the instant you hear the tone.</p>',
      idleHtml:
        '<p class="stage-title">Ears only</p>' +
        '<p class="stage-sub">Turn the volume up, hit Draw, then click the instant you hear the tone.</p>',
    },
    choice: {
      key: "choice",
      scored: 5,
      nogo: 3,
      model: "CHOICE_REACTION_TIME_MS",
      bestKey: "reflexzap_choice_best_ms",
      historyKey: "reflexzap_choice_history",
      url: "https://reflexzap.com/choice-reaction-time-test/",
      gamified: false,
      goWord: "Go!",
      foulWord: "False Start!",
      rivalBase: 320, rivalSpread: 190,
      waitHtml:
        '<p class="stage-title">Wait for a colour...</p>' +
        '<p class="stage-sub">Green means click. Red means do not.</p>',
      idleHtml:
        '<p class="stage-title">Green go, red no</p>' +
        '<p class="stage-sub">Hit Draw. Click on green, hold on red — eight rounds, five of them green.</p>',
    },
    f1: {
      key: "f1",
      scored: 5,
      model: "F1_REACTION_TIME_MS",
      bestKey: "reflexzap_f1_best_ms",
      historyKey: "reflexzap_f1_history",
      url: "https://reflexzap.com/f1-reaction-test/",
      gamified: false,
      goWord: "Go!",
      foulWord: "Jump Start!",
      rivalBase: 210, rivalSpread: 140,
      /* A response this fast after lights-out was already on its way before
         the lights went out. World Athletics publishes exactly this threshold
         for a sprint start (Technical Rules, Book C - C2.1) and it is the only
         governing-body reaction-time number that exists — the FIA's own rule
         is about movement, not latency, so it cannot be applied to a click.
         The constant lives with the other cited figures in percentile.js. */
      anticipationMs:
        (PERCENTILE && PERCENTILE.F1_REACTION_TIME_MS &&
          PERCENTILE.F1_REACTION_TIME_MS.anticipationMs) || 100,
      waitHtml:
        '<p class="stage-title">Lights out and away we go</p>' +
        '<p class="stage-sub">Five lights on, then a hold, then dark. Go on dark.</p>',
      idleHtml:
        '<p class="stage-title">On the grid</p>' +
        '<p class="stage-sub">Hit Draw. Five red lights come on one by one — react the instant they all go out.</p>',
    },
  };

  const MODE =
    MODES[(document.body && document.body.getAttribute("data-mode")) || "visual"] ||
    MODES.visual;

  const ROUNDS = MODE.scored;
  const SITE_URL = MODE.url;
  const BEST_KEY = MODE.bestKey;
  const HISTORY_KEY = MODE.historyKey;

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

  /* ============================= gamification ============================= */

  const PROFILE_KEY = "reflexzap_profile";
  const SOUND_KEY = "reflexzap_sound_muted";

  const RANK_TITLES = [
    { level: 1, title: "Rookie Reflex" },
    { level: 2, title: "Quick Draw" },
    { level: 3, title: "Sharp Shooter" },
    { level: 4, title: "Fast Twitch" },
    { level: 5, title: "Speed Demon" },
    { level: 6, title: "Lightning Reflex" },
    { level: 7, title: "Reflex Machine" },
    { level: 8, title: "Neural Overclock" },
    { level: 9, title: "Reflex Legend" },
    { level: 10, title: "Reflex God" },
  ];

  // Cumulative XP required to *reach* a given level (triangular growth curve).
  function xpForLevel(level) {
    return 50 * level * (level - 1);
  }

  function levelForXp(xp) {
    let level = 1;
    while (xp >= xpForLevel(level + 1)) level += 1;
    return Math.min(level, RANK_TITLES.length);
  }

  function titleForLevel(level) {
    const entry = RANK_TITLES[Math.min(level, RANK_TITLES.length) - 1];
    return entry ? entry.title : RANK_TITLES[RANK_TITLES.length - 1].title;
  }

  const ACHIEVEMENTS = [
    { id: "first_zap", icon: "🎯", title: "First Zap", desc: "Complete your first test.", check: (c) => c.totalSessions >= 1 },
    { id: "sub_300", icon: "🥉", title: "Sub-300 Club", desc: "Average under 300ms.", check: (c) => c.avg < 300 },
    { id: "sub_250", icon: "🥈", title: "Sub-250 Club", desc: "Average under 250ms.", check: (c) => c.avg < 250 },
    { id: "sub_200", icon: "🥇", title: "Sub-200 Club", desc: "Average under 200ms.", check: (c) => c.avg < 200 },
    { id: "zero_jump", icon: "💎", title: "Zero Jump", desc: "Finish a session with no early clicks.", check: (c) => c.flawless },
    { id: "pb_breaker", icon: "🏆", title: "Record Breaker", desc: "Beat your personal best 5 times.", check: (c) => c.pbBeatenCount >= 5 },
    { id: "streak_3", icon: "🔥", title: "3-Day Streak", desc: "Play 3 days in a row.", check: (c) => c.streak >= 3 },
    { id: "streak_7", icon: "🔥", title: "Week Warrior", desc: "Play 7 days in a row.", check: (c) => c.streak >= 7 },
    { id: "streak_30", icon: "🔥", title: "Monthly Grind", desc: "Play 30 days in a row.", check: (c) => c.streak >= 30 },
    { id: "sessions_10", icon: "🕹️", title: "Arcade Regular", desc: "Complete 10 test sessions.", check: (c) => c.totalSessions >= 10 },
    { id: "sessions_50", icon: "🕹️", title: "Arcade Veteran", desc: "Complete 50 test sessions.", check: (c) => c.totalSessions >= 50 },
    { id: "night_owl", icon: "🦉", title: "Night Owl", desc: "Complete a test between midnight and 5am.", check: (c) => c.hour >= 0 && c.hour < 5 },
    { id: "level_5", icon: "⭐", title: "Rising Star", desc: "Reach level 5.", check: (c) => c.level >= 5 },
    { id: "level_10", icon: "👑", title: "Reflex God", desc: "Reach the max level.", check: (c) => c.level >= 10 },
  ];

  function loadProfile() {
    try {
      const raw = JSON.parse(localStorage.getItem(PROFILE_KEY));
      if (raw && typeof raw === "object") {
        return Object.assign(
          { totalXP: 0, totalSessions: 0, pbBeatenCount: 0, streak: 0, lastPlayedDate: null, achievements: [] },
          raw
        );
      }
    } catch (e) { /* ignore */ }
    return { totalXP: 0, totalSessions: 0, pbBeatenCount: 0, streak: 0, lastPlayedDate: null, achievements: [] };
  }

  function saveProfile(profile) {
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); } catch (e) { /* ignore */ }
  }

  function dateKey(d) {
    return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
  }

  function updateStreak(profile, now) {
    const today = dateKey(now);
    if (profile.lastPlayedDate === today) return profile.streak;
    const yesterday = dateKey(new Date(now.getTime() - 86400000));
    profile.streak = profile.lastPlayedDate === yesterday ? profile.streak + 1 : 1;
    profile.lastPlayedDate = today;
    return profile.streak;
  }

  function xpForSession(rating, isNewBest, isFirstBest, flawless) {
    let xp = 20;
    if (rating === "Superhuman") xp += 40;
    else if (rating === "Excellent") xp += 25;
    else if (rating === "Above Average") xp += 15;
    else if (rating === "Average") xp += 8;
    else xp += 5;
    if (isNewBest && !isFirstBest) xp += 30;
    if (flawless) xp += 10;
    return xp;
  }

  // Records a completed session against the persisted profile: awards XP,
  // advances the daily streak, and unlocks any newly-earned achievements.
  // Returns everything the UI layer needs to render + celebrate the update.
  function recordSession({ avg, isNewBest, isFirstBest, flawless, now }) {
    const profile = loadProfile();
    const prevLevel = levelForXp(profile.totalXP);

    profile.totalSessions += 1;
    if (isNewBest && !isFirstBest) profile.pbBeatenCount += 1;
    const streak = updateStreak(profile, now);
    const gained = xpForSession(getRatingLabel(avg), isNewBest, isFirstBest, flawless);
    profile.totalXP += gained;
    const newLevel = levelForXp(profile.totalXP);

    const ctx = {
      avg,
      totalSessions: profile.totalSessions,
      pbBeatenCount: profile.pbBeatenCount,
      streak,
      flawless,
      level: newLevel,
      hour: now.getHours(),
    };
    const newlyUnlocked = [];
    ACHIEVEMENTS.forEach((a) => {
      if (profile.achievements.indexOf(a.id) === -1 && a.check(ctx)) {
        profile.achievements.push(a.id);
        newlyUnlocked.push(a);
      }
    });

    saveProfile(profile);
    return {
      profile,
      xpGained: gained,
      leveledUp: newLevel > prevLevel,
      newLevel,
      newlyUnlocked,
    };
  }

  /* ---------- gamification rendering ---------- */

  const chipLevel = document.getElementById("chip-level");
  const chipStreak = document.getElementById("chip-streak");
  const xpRankLabel = document.getElementById("xp-rank-label");
  const xpProgressLabel = document.getElementById("xp-progress-label");
  const xpBarFill = document.getElementById("xp-bar-fill");
  const achievementsGrid = document.getElementById("achievements-grid");
  const unlockStack = document.getElementById("unlock-stack");

  function renderStatusChips(profile) {
    const level = levelForXp(profile.totalXP);
    if (chipLevel) chipLevel.textContent = "LV " + level;
    if (chipStreak) {
      chipStreak.textContent = "🔥" + profile.streak;
      chipStreak.classList.toggle("is-zero", profile.streak === 0);
    }
    if (xpRankLabel) xpRankLabel.textContent = titleForLevel(level);
    if (xpProgressLabel && xpBarFill) {
      const base = xpForLevel(level);
      const next = xpForLevel(level + 1);
      const span = next - base || 1;
      const into = Math.max(0, profile.totalXP - base);
      const pct = level >= RANK_TITLES.length ? 100 : Math.min(100, (into / span) * 100);
      xpProgressLabel.textContent =
        level >= RANK_TITLES.length ? "MAX LEVEL" : into + " / " + span + " XP";
      xpBarFill.style.width = pct + "%";
    }
  }

  function renderAchievements(profile) {
    if (!achievementsGrid) return;
    achievementsGrid.innerHTML = ACHIEVEMENTS.map((a) => {
      const unlocked = profile.achievements.indexOf(a.id) !== -1;
      return (
        `<div class="badge${unlocked ? " unlocked" : ""}" title="${a.title}: ${a.desc}">` +
        `<span class="badge-icon" aria-hidden="true">${a.icon}</span>` +
        `<span class="badge-title">${a.title}</span>` +
        `</div>`
      );
    }).join("");
  }

  function queueUnlockToasts(items, kickerFor) {
    if (!unlockStack || !items.length) return;
    items.forEach((item, i) => {
      setTimeout(() => {
        const el = document.createElement("div");
        el.className = "unlock-toast";
        el.innerHTML =
          `<span class="unlock-icon" aria-hidden="true">${item.icon}</span>` +
          `<span class="unlock-text"><span class="unlock-kicker">${kickerFor(item)}</span>` +
          `<span class="unlock-title">${item.title}</span></span>`;
        unlockStack.appendChild(el);
        playAchievementChime();
        setTimeout(() => el.remove(), 3600);
      }, i * 550);
    });
  }

  /* ---------- arcade sound synth (WebAudio, no audio files) ---------- */

  let audioCtx = null;
  let soundMuted = false;
  try { soundMuted = localStorage.getItem(SOUND_KEY) === "1"; } catch (e) { /* ignore */ }

  function getAudioCtx() {
    if (audioCtx) return audioCtx;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
    return audioCtx;
  }

  // One oscillator, scheduled at an absolute AudioContext time. Split out of
  // playTone so the audio test's cue can use it while bypassing the effects
  // mute — that tone is not an effect, it is the stimulus being measured.
  function toneAt(freq, t0, duration, type, peakGain) {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(peakGain || 0.08, t0 + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  function playTone(freq, startOffset, duration, type, peakGain) {
    if (soundMuted) return;
    const ctx = getAudioCtx();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume();
    toneAt(freq, ctx.currentTime + startOffset, duration, type, peakGain);
  }

  /* The audio test's stimulus. Returns the performance.now() instant the tone
     will actually be audible, which is what the reaction is measured from.

     Scheduling it a fixed lead ahead of ctx.currentTime is what stops the
     attack being clipped by scheduling jitter; getOutputTimestamp() then maps
     that AudioContext instant onto the performance.now() clock, and it is the
     only API that accounts for the buffer the samples still have to travel
     through before anyone hears them. Where it is missing, outputLatency (or
     baseLatency) is the documented fallback. Taking performance.now() at the
     moment we *schedule* the note would credit the player with the whole
     output latency — tens of milliseconds of free reaction time. */
  const CUE_LEAD_S = 0.09;

  function playCueTone() {
    const now = performance.now();
    const ctx = getAudioCtx();
    if (!ctx) return now;
    if (ctx.state === "suspended") ctx.resume();
    const t0 = ctx.currentTime + CUE_LEAD_S;
    toneAt(1000, t0, 0.13, "square", 0.14);
    const ts = ctx.getOutputTimestamp ? ctx.getOutputTimestamp() : null;
    if (ts && Number.isFinite(ts.contextTime) && Number.isFinite(ts.performanceTime) &&
        ts.contextTime > 0 && ts.performanceTime > 0) {
      return ts.performanceTime + (t0 - ts.contextTime) * 1000;
    }
    const lag = ctx.outputLatency || ctx.baseLatency || 0;
    return now + (CUE_LEAD_S + lag) * 1000;
  }

  function playClickBlip() { playTone(880, 0, 0.09, "sine", 0.06); }
  function playTooSoonBuzz() { playTone(140, 0, 0.18, "square", 0.05); }
  function playAchievementChime() {
    [660, 880, 1320].forEach((f, i) => playTone(f, i * 0.09, 0.16, "triangle", 0.07));
  }
  function playLevelUpFanfare() {
    [523, 659, 784, 1046, 1318].forEach((f, i) => playTone(f, i * 0.08, 0.22, "square", 0.06));
  }
  function playNewBestSparkle() {
    [988, 1318, 1568, 2093].forEach((f, i) => playTone(f, i * 0.06, 0.14, "sine", 0.07));
  }

  const soundToggleBtn = document.getElementById("sound-toggle");
  function renderSoundToggle() {
    if (!soundToggleBtn) return;
    soundToggleBtn.textContent = soundMuted ? "🔇" : "🔊";
  }
  if (soundToggleBtn) {
    soundToggleBtn.addEventListener("click", () => {
      soundMuted = !soundMuted;
      try { localStorage.setItem(SOUND_KEY, soundMuted ? "1" : "0"); } catch (e) { /* ignore */ }
      renderSoundToggle();
      if (!soundMuted) playClickBlip();
    });
    renderSoundToggle();
  }

  const statusChipBtn = document.getElementById("status-chip");
  if (statusChipBtn) {
    statusChipBtn.addEventListener("click", () => {
      const panel = document.getElementById("achievements-panel");
      if (panel) panel.scrollIntoView({ behavior: "smooth", block: "start" });
    });
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
  const lightsEl = document.getElementById("f1-lights");
  const falseAlarmTile = document.getElementById("result-false-alarms");

  const resultsPanel = document.getElementById("results-panel");
  const ratingLabelEl = document.getElementById("rating-label");
  const ratingNoteEl = document.getElementById("rating-note");
  const ratingPercentileEl = document.getElementById("rating-percentile");
  const resultAvgEl = document.getElementById("result-avg");
  const resultBestEl = document.getElementById("result-best");
  const resultAllTimeBestEl = document.getElementById("result-alltime-best");
  const roundsTbody = document.getElementById("rounds-tbody");
  const roundsChart = document.getElementById("rounds-chart");
  const distCard = document.getElementById("dist-card");
  const distChart = document.getElementById("dist-chart");
  const retryBtn = document.getElementById("retry-btn");
  const copyBtn = document.getElementById("copy-btn");

  const historyEmpty = document.getElementById("history-empty");
  const historyTable = document.getElementById("history-table");
  const historyTbody = document.getElementById("history-tbody");
  const historySparkline = document.getElementById("history-sparkline");

  const toast = document.getElementById("toast");

  /* ---------- arcade cabinet HUD (announce slams + post-match grade) ----------
     Presentation only — none of this feeds the reaction measurement. The
     announce is a fixed overlay so it works over the full-bleed test stage; it
     only fires during the "waiting" phase (fades ~850ms, long before green) or
     at the too-soon/finish beats, never at the green cue itself. */
  const announceEl = document.getElementById("announce");
  const resultGrade = document.getElementById("result-grade");
  let announceTimer = null;
  function showAnnounce(text, foul) {
    if (!announceEl) return;
    announceEl.classList.toggle("is-foul", !!foul);
    announceEl.innerHTML = '<span class="announce-text"></span>';
    announceEl.firstChild.textContent = text;
    announceEl.classList.remove("show");
    void announceEl.offsetWidth; // restart the slam animation
    announceEl.classList.add("show");
    clearTimeout(announceTimer);
    announceTimer = setTimeout(() => announceEl.classList.remove("show"), 850);
  }
  const GRADE_FOR_LABEL = {
    "Superhuman": "S",
    "Excellent": "A",
    "Above Average": "B",
    "Average": "C",
    "Below Average — try again!": "D",
  };

  function gradeForAvg(avg) {
    if (!Number.isFinite(avg)) return "E";
    // The four tests share one ladder but not one scale, so the letter comes
    // from whichever rating rule this mode uses — absolute milliseconds on the
    // visual test, its own cited percentile everywhere else.
    if (MODE.key !== "visual") return GRADE_FOR_LABEL[ratingFor(avg)] || "D";
    if (avg < 200) return "S";
    if (avg < 250) return "A";
    if (avg < 300) return "B";
    if (avg < 350) return "C";
    return "D";
  }

  function percentileFor(avg) {
    const model = PERCENTILE && PERCENTILE[MODE.model];
    if (!model || !Number.isFinite(avg)) return NaN;
    return PERCENTILE.percentileForScore(avg, model);
  }

  function ratingFor(avg) {
    if (MODE.key === "visual") return getRatingLabel(avg);
    const pct = percentileFor(avg);
    return Number.isFinite(pct) ? getRatingFromPercentile(pct) : getRatingLabel(avg);
  }
  function showGrade(avg) {
    if (!resultGrade) return;
    const g = gradeForAvg(avg);
    resultGrade.textContent = g;
    resultGrade.setAttribute("data-grade", g);
    resultGrade.classList.remove("show");
    void resultGrade.offsetWidth;
    resultGrade.classList.add("show");
  }

  // Duel pips: each round is a draw vs a CPU rival — beat its reaction and your
  // pip lights, else the rival's does. Pure flavour on top of the real timing.
  const pipsYou = document.getElementById("pips-you");
  const pipsRival = document.getElementById("pips-rival");
  function buildPips(el, n) {
    if (!el) return;
    el.innerHTML = "";
    for (var i = 0; i < n; i++) { var p = document.createElement("span"); p.className = "pip"; el.appendChild(p); }
  }
  function resetPips() {
    const n = sequence.length;
    buildPips(pipsYou, n);
    buildPips(pipsRival, n);
  }
  function lightPip(idx, youWin) {
    var el = youWin ? pipsYou : pipsRival;
    if (el && el.children[idx]) el.children[idx].className = "pip " + (youWin ? "win" : "loss");
  }

  const IDLE_CONTENT_HTML = MODE.idleHtml;

  const FINISH_TRANSITION_MS = 220;

  /* ---------- state ---------- */
  let state = "idle"; // idle | waiting | ready | nogo | toosoon | round-result | done
  let trialIndex = 0;          // position in `sequence`, not the scored count
  let roundTimes = [];         // scored go-trial latencies only
  let falseAlarms = 0;         // go/no-go: responses on a no-go trial
  let greenAt = 0;
  let waitTimeoutId = null;
  let readyTimeoutId = null;
  let lightsTimeoutId = null;
  let advanceTimeoutId = null;
  let toastTimeoutId = null;
  let earlyClickCount = 0;

  /* The trial order for a session. Every test but go/no-go is N identical
     scored trials; go/no-go interleaves three no-go trials that are scored on
     whether you managed *not* to respond, which is the second measured number
     this site has never had. Shuffled per session so the pattern is not
     learnable, and built once per session so the pip row and the round labels
     agree with what is actually coming. */
  function buildSequence() {
    const out = [];
    for (let i = 0; i < MODE.scored; i++) out.push("go");
    for (let i = 0; i < (MODE.nogo || 0); i++) out.push("nogo");
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = out[i]; out[i] = out[j]; out[j] = tmp;
    }
    // Never open on a no-go: the first trial teaches the rule.
    if (out[0] === "nogo") {
      const firstGo = out.indexOf("go");
      out[0] = "go"; out[firstGo] = "nogo";
    }
    return out;
  }

  let sequence = buildSequence();

  function randomDelay() {
    return MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS);
  }

  function setStageState(cls) {
    stageEl.classList.remove(
      "state-idle", "state-waiting", "state-ready", "state-nogo",
      "state-toosoon", "state-result", "state-done"
    );
    stageEl.classList.add(cls);
  }

  /* F1 start gantry. One className write per step — the lights-out frame is
     the measured stimulus, so it must not cost five separate style mutations
     and it must not touch layout at all. */
  function setLights(n) {
    if (lightsEl) lightsEl.className = "f1-lights lit-" + n;
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
    const label = text || `Round ${trialIndex + 1} of ${sequence.length}`;
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
    if (readyTimeoutId) { clearTimeout(readyTimeoutId); readyTimeoutId = null; }
    if (lightsTimeoutId) { clearTimeout(lightsTimeoutId); lightsTimeoutId = null; }
    if (advanceTimeoutId) { clearTimeout(advanceTimeoutId); advanceTimeoutId = null; }
  }

  function startTest() {
    clearTimers();
    sequence = buildSequence();
    trialIndex = 0;
    roundTimes = [];
    falseAlarms = 0;
    earlyClickCount = 0;
    resultsPanel.hidden = true;
    stageControls.hidden = true;
    resetPips();
    setLights(0);
    enterFullBleed();
    beginRound();
  }

  function beginRound() {
    state = "waiting";
    setStageState("state-waiting");
    updateRoundLabel();
    const rn = trialIndex + 1;
    showAnnounce(rn >= sequence.length ? "Final Round" : "Round " + rn);
    setStageContentHTML(MODE.waitHtml);
    if (MODE.key === "f1") { runLightsSequence(); return; }
    waitTimeoutId = setTimeout(fireCue, randomDelay());
  }

  /* The FIA start procedure: five lights come on one per second, hold for an
     unannounced interval, then all go out at once. Lights-out is the cue, so
     the hold has to be unpredictable — the published range for a real start
     is roughly 0.2 to 3 seconds. */
  const F1_LIGHT_STEP_MS = 1000;
  const F1_HOLD_MIN_MS = 200;
  const F1_HOLD_MAX_MS = 3000;

  function runLightsSequence() {
    setLights(0);
    let lit = 0;
    (function step() {
      lightsTimeoutId = setTimeout(() => {
        lightsTimeoutId = null;
        lit += 1;
        setLights(lit);
        playTone(440, 0, 0.06, "square", 0.05);
        if (lit < 5) { step(); return; }
        waitTimeoutId = setTimeout(() => {
          waitTimeoutId = null;
          // Timestamp first, then the single className write — the same order
          // the visual test uses, so the two numbers stay comparable.
          greenAt = performance.now();
          state = "ready";
          setLights(0);
        }, F1_HOLD_MIN_MS + Math.random() * (F1_HOLD_MAX_MS - F1_HOLD_MIN_MS));
      }, F1_LIGHT_STEP_MS);
    })();
  }

  function fireCue() {
    waitTimeoutId = null;
    if (sequence[trialIndex] === "nogo") {
      state = "nogo";
      setStageState("state-nogo");
      setStageContentHTML(
        '<p class="stage-title">Hold!</p>' +
        '<p class="stage-sub">Red — do not click. Wait it out.</p>'
      );
      advanceTimeoutId = setTimeout(() => {
        advanceTimeoutId = null;
        passNoGo();
      }, NOGO_HOLD_MS);
      return;
    }

    if (MODE.key === "audio") {
      // The stimulus is the sound. Nothing on screen may change here: a visual
      // change would leak a second cue and would put layout work in the path
      // being measured. `ready` is armed at the tone's real onset, not when it
      // was scheduled, so a click in between still counts as too soon.
      greenAt = playCueTone();
      const lead = Math.max(0, greenAt - performance.now());
      readyTimeoutId = setTimeout(() => {
        readyTimeoutId = null;
        state = "ready";
      }, lead);
      return;
    }

    greenAt = performance.now();
    state = "ready";
    setStageState("state-ready");
    setStageContentHTML(`<p class="stage-title">${MODE.goWord}</p>`);
  }

  function handleTooSoon(subHtml) {
    clearTimers();
    earlyClickCount += 1;
    state = "toosoon";
    setStageState("state-toosoon");
    setLights(0);
    triggerShake(stageEl);
    playTooSoonBuzz();
    showAnnounce(MODE.foulWord, true);
    setStageContentHTML(
      '<p class="stage-title">Not yet!</p>' +
      (subHtml || '<p class="stage-sub">You went before the cue — that round restarts.</p>')
    );
    advanceTimeoutId = setTimeout(() => {
      advanceTimeoutId = null;
      beginRound();
    }, TOO_SOON_DISPLAY_MS);
  }

  // Go/no-go only: the red trial ran its course untouched. Scored as a win,
  // but it contributes no latency — the whole point is that nothing happened.
  function passNoGo() {
    lightPip(trialIndex, true);
    state = "round-result";
    setStageState("state-result");
    setStageContentHTML(
      '<p class="stage-title">Held</p>' +
      `<p class="stage-sub">Round ${trialIndex + 1} of ${sequence.length}</p>`
    );
    advanceTrial();
  }

  // Go/no-go only: a response on a red trial. Counted, never timed.
  function handleFalseAlarm() {
    clearTimers();
    falseAlarms += 1;
    lightPip(trialIndex, false);
    playTooSoonBuzz();
    showAnnounce(MODE.foulWord, true);
    state = "round-result";
    setStageState("state-toosoon");
    triggerShake(stageEl);
    setStageContentHTML(
      '<p class="stage-title">False start</p>' +
      '<p class="stage-sub">That one was red — you were meant to hold.</p>'
    );
    advanceTrial();
  }

  function handleClickWhileReady() {
    const rawElapsed = performance.now() - greenAt;
    const elapsed = Math.max(0, Math.round(Number.isFinite(rawElapsed) ? rawElapsed : 0));

    // Anticipation, not reaction — the F1 test is the one mode where guessing
    // the cue is worth attempting, so it is the one mode that rules on it.
    // Scoring a 40ms "reaction" would put a physically impossible number into
    // the average and onto the percentile curve.
    if (MODE.anticipationMs && elapsed < MODE.anticipationMs) {
      handleTooSoon(
        `<p class="stage-sub">${elapsed}ms is faster than a human start — that is an ` +
        `anticipated getaway, not a reaction. Round restarts.</p>`
      );
      return;
    }

    roundTimes.push(elapsed);
    lightPip(trialIndex, elapsed < MODE.rivalBase + Math.random() * MODE.rivalSpread);
    playClickBlip();

    state = "round-result";
    setStageState("state-result");
    setStageContentHTML(
      `<p class="stage-time">${elapsed}ms</p>` +
      `<p class="stage-sub">Round ${trialIndex + 1} of ${sequence.length}</p>`
    );
    advanceTrial();
  }

  function advanceTrial() {
    trialIndex += 1;
    advanceTimeoutId = setTimeout(() => {
      advanceTimeoutId = null;
      if (trialIndex >= sequence.length) {
        finishSession();
      } else {
        beginRound();
      }
    }, ROUND_RESULT_DISPLAY_MS);
  }

  function handleStageActivate() {
    if (state === "waiting") { handleTooSoon(); return; }
    if (state === "nogo") { handleFalseAlarm(); return; }
    if (state === "ready") { handleClickWhileReady(); return; }
    // idle / toosoon / round-result / done: ignore extra activations
  }

  function cancelTest() {
    clearTimers();
    state = "idle";
    trialIndex = 0;
    exitFullBleed();
    setStageState("state-idle");
    setLights(0);
    updateRoundLabel(`Round 1 of ${sequence.length}`);
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
      showAnnounce("Clear!");

      const avg = computeAverage(roundTimes);
      const best = computeBest(roundTimes);

      const prevBest = loadBest();
      const isNewBest = prevBest === null || best < prevBest;
      const newAllTimeBest = isNewBest ? best : prevBest;
      if (isNewBest) saveBest(newAllTimeBest);
      renderBestChip();

      const history = loadHistory();
      history.unshift({ date: new Date().toISOString(), avg });
      const trimmed = history.slice(0, MAX_HISTORY);
      saveHistory(trimmed);

      renderResults(avg, best, newAllTimeBest);
      renderChallengeVerdict(avg);
      renderHistory(trimmed);

      // XP, streaks and achievements belong to the visual test alone. Their
      // thresholds ("average under 200ms") were picked for that stimulus, and
      // a tone or a lights-out start clears them far more easily — one shared
      // profile would quietly turn the badges into participation trophies.
      const gameResult = MODE.gamified
        ? recordSession({
            avg,
            isNewBest,
            isFirstBest: prevBest === null,
            flawless: earlyClickCount === 0,
            now: new Date(),
          })
        : null;
      if (gameResult) {
        renderStatusChips(gameResult.profile);
        renderAchievements(gameResult.profile);
      }

      if (isNewBest && prevBest !== null) {
        const avgTile = document.getElementById("result-avg");
        if (avgTile) avgTile.closest(".stat-tile").classList.add("new-record");
        playNewBestSparkle();
      }
      if (gameResult && gameResult.leveledUp) {
        setTimeout(playLevelUpFanfare, gameResult.newlyUnlocked.length ? 700 : 0);
      }
      if (gameResult) {
        queueUnlockToasts(gameResult.newlyUnlocked, () =>
          gameResult.leveledUp ? "Achievement Unlocked · LV " + gameResult.newLevel : "Achievement Unlocked"
        );
      }

      resultsPanel.hidden = false;
      resultsPanel.classList.remove("panel-enter");
      void resultsPanel.offsetWidth;
      resultsPanel.classList.add("panel-enter");
      showGrade(avg);
      resultsPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, FINISH_TRANSITION_MS);
  }

  function renderResults(avg, best, allTimeBest) {
    const label = ratingFor(avg);
    const notes = MODE.key === "visual" ? RATING_NOTES : PERCENTILE_BAND_NOTES;
    ratingLabelEl.textContent = label;
    ratingNoteEl.textContent = notes[label] || "";
    ratingPercentileEl.textContent = getPercentileNote(avg, MODE.model);

    // Go/no-go's second measured number: how often you responded to a red
    // trial. Nothing else on this site has ever reported an error count.
    if (falseAlarmTile) {
      falseAlarmTile.textContent = `${falseAlarms} / ${MODE.nogo || 0}`;
      falseAlarmTile.closest(".stat-tile").classList.toggle("is-bad", falseAlarms > 0);
    }

    resultAvgEl.textContent = `${avg}ms`;
    resultBestEl.textContent = `${best}ms`;
    resultAllTimeBestEl.textContent = Number.isFinite(allTimeBest) ? `${allTimeBest}ms` : "—";

    roundsTbody.innerHTML = roundTimes
      .map((t, i) => `<tr><td>Round ${i + 1}</td><td class="num">${t}ms</td></tr>`)
      .join("");

    renderChart(roundTimes, avg, best);
    renderDistribution(avg);
  }

  // Draws the published-literature distribution with the visitor's average
  // marked on it. The curve is a model of figures from the studies cited in
  // percentile.js — never an aggregate of anyone's results on this site, and
  // the caption below it says so.
  function renderDistribution(avg) {
    if (!distChart || !distCard) return;
    if (!PERCENTILE || !Number.isFinite(avg)) {
      distCard.hidden = true;
      return;
    }
    const model = PERCENTILE[MODE.model];
    if (!model) { distCard.hidden = true; return; }
    const geom = {
      width: 320, height: 136,
      padTop: 30, padBottom: 26, padLeft: 10, padRight: 10,
      samples: 36, step: true,
    };

    const areaAll = PERCENTILE.distributionPath(model, Object.assign({ close: true }, geom));
    const outline = PERCENTILE.distributionPath(model, geom);
    const range = PERCENTILE.beatenRange(model, avg, geom);
    const areaBeaten = PERCENTILE.distributionPath(
      model, Object.assign({ close: true }, geom, range)
    );
    const marker = PERCENTILE.projectScore(model, avg, geom);
    const pct = PERCENTILE.formatPercentile(PERCENTILE.percentileForScore(avg, model));

    const ticks = PERCENTILE.axisTicks(model, geom, 4)
      .map((t) =>
        `<line x1="${t.x.toFixed(1)}" y1="${marker.baseline}" x2="${t.x.toFixed(1)}" y2="${marker.baseline + 4}" class="dist-tick-mark" />` +
        `<text x="${t.x.toFixed(1)}" y="${geom.height - 8}" class="dist-tick" text-anchor="middle">${t.score}</text>`
      )
      .join("");

    // Keep the marker's label inside the box at both extremes of the domain.
    const anchor = marker.x < 50 ? "start" : marker.x > geom.width - 50 ? "end" : "middle";
    const labelX = anchor === "start" ? geom.padLeft : anchor === "end" ? geom.width - geom.padRight : marker.x;

    distCard.hidden = false;
    distChart.innerHTML =
      `<svg viewBox="0 0 ${geom.width} ${geom.height}" class="dist-svg" role="img" ` +
      `aria-label="Modelled distribution of ${model.label.toLowerCase()} from published studies. ` +
      `Your ${avg} millisecond average is faster than ${pct}% of that modelled population.">` +
      `<path class="dist-area" d="${areaAll}" />` +
      `<path class="dist-area dist-area--beaten" d="${areaBeaten}" />` +
      `<path class="dist-curve" d="${outline}" />` +
      `<line x1="${geom.padLeft}" y1="${marker.baseline}" x2="${geom.width - geom.padRight}" y2="${marker.baseline}" class="dist-baseline" />` +
      ticks +
      `<line x1="${marker.x.toFixed(1)}" y1="${marker.baseline}" x2="${marker.x.toFixed(1)}" y2="${geom.padTop - 8}" class="dist-marker" />` +
      `<rect x="${(marker.x - 4).toFixed(1)}" y="${(marker.y - 4).toFixed(1)}" width="8" height="8" class="dist-marker-pip" />` +
      `<text x="${labelX.toFixed(1)}" y="${geom.padTop - 14}" class="dist-marker-label" text-anchor="${anchor}">You · ${avg}ms</text>` +
      `<text x="${geom.width - geom.padRight}" y="${(marker.baseline - 6).toFixed(1)}" class="dist-band-label" text-anchor="end">slower →</text>` +
      `</svg>`;
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
    if (!historyEmpty || !historyTable || !historyTbody) return;
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

  /* ---------- friend challenge links ----------
     A shared result is a URL, not a dead text blob: `?ms=245` opens the test
     with the sender's average shown as the time to beat, and a verdict once
     you finish. Lower is better here, so the comparison inverts relative to
     the sibling cabinets. The param is validated before use — a hand-edited or
     hostile query string can only degrade to "no challenge". */

  const challengeBanner = document.getElementById("challenge-banner");
  const challengeText = document.getElementById("challenge-text");
  const challengeVerdict = document.getElementById("challenge-verdict");
  let challenge = null; // { ms } once a valid challenge link is opened

  function readChallengeFromUrl() {
    let params;
    try {
      params = new URLSearchParams(window.location.search);
    } catch (e) {
      return null;
    }
    const ms = Number(params.get("ms"));
    // Outside a plausible human reaction time this is junk, not a challenge:
    // sub-50ms is physically impossible and 5s+ is not a real reading.
    if (!Number.isFinite(ms) || ms < 50 || ms > 5000) return null;
    return { ms: Math.round(ms) };
  }

  function buildChallengeUrl(avg) {
    return `${SITE_URL}?ms=${Math.round(avg)}`;
  }

  function applyChallenge() {
    challenge = readChallengeFromUrl();
    if (!challenge) return;
    if (challengeText) {
      challengeText.textContent =
        `A friend averaged ${challenge.ms}ms over 5 rounds. Beat it.`;
    }
    if (challengeBanner) challengeBanner.hidden = false;
  }

  function renderChallengeVerdict(avg) {
    if (!challengeVerdict) return;
    if (!challenge || !Number.isFinite(avg)) {
      challengeVerdict.hidden = true;
      return;
    }
    const diff = avg - challenge.ms; // negative = you were faster
    challengeVerdict.hidden = false;
    challengeVerdict.classList.toggle("is-win", diff < 0);
    challengeVerdict.classList.toggle("is-loss", diff > 0);
    if (diff < 0) {
      challengeVerdict.textContent =
        `Challenge beaten — ${Math.abs(diff)}ms faster than their ${challenge.ms}ms.`;
    } else if (diff === 0) {
      challengeVerdict.textContent = `Dead heat — you matched their ${challenge.ms}ms exactly.`;
    } else {
      challengeVerdict.textContent =
        `Challenge missed by ${diff}ms — they averaged ${challenge.ms}ms. Try again.`;
    }
  }

  function copyResult() {
    const avg = computeAverage(roundTimes);
    if (!Number.isFinite(avg)) return;
    const profile = loadProfile();
    const rank = titleForLevel(levelForXp(profile.totalXP));
    const text = `My average reaction time is ${avg}ms on Reaction Time Test (${rank}, LV ${levelForXp(profile.totalXP)})! Beat me: ${buildChallengeUrl(avg)}`;

    function fallbackCopy() {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch (e) { /* ignore */ }
      document.body.removeChild(ta);
      showToast("Challenge link copied!");
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        () => showToast("Challenge link copied!"),
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
  applyChallenge();
  resetPips();
  setLights(0);
  updateRoundLabel(`Round 1 of ${sequence.length}`);
  renderBestChip();
  renderHistory(loadHistory());
  renderStatusChips(loadProfile());
  renderAchievements(loadProfile());
})();
