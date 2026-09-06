/* reflexzap.com — the leaderboard, on sch3ma. Loaded as a module on the four test pages.
   Off until the project below is set: the panel stays hidden and nothing is requested.

   Two requests a visitor can cause. On load, the ten fastest posted averages for this
   test are read. After a session, if the visitor presses Post, one row is created with the
   test, the average in milliseconds and an optional name, and the rank comes back from a
   count. Nothing is posted without the press. */

const PROJECT = "prj_01M1TEZC4XYQDE7ZN2QVYXJ1E8";
const KEY = "pk_live_01M1TF1VBYBSG5K618S8A6YFE5_N9dKa6xuDcuHGq82JsUqWF8gRXzLAtwz"; // publishable: it ships in the page by design
const NAME_KEY = "reflexzap_board_name";
const TOP = 10;

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

let dbPromise = null;
function client() {
  if (window.__rzClient) return Promise.resolve(window.__rzClient());
  if (!PROJECT || !KEY) return Promise.resolve(null);
  if (!dbPromise) dbPromise = import("https://sch3ma.com/sdk/1.js").then((m) => m.sch3ma({ project: PROJECT, key: KEY })).catch(() => null);
  return dbPromise;
}

const test = document.body.dataset.mode || "visual";
const $ = (id) => document.getElementById(id);
const ms = (n) => Math.round(n).toLocaleString() + "ms";

function renderRows(rows) {
  const tbody = $("board-tbody");
  tbody.textContent = "";
  rows.forEach((r, i) => {
    const tr = document.createElement("tr");
    const rank = document.createElement("td"); rank.textContent = String(i + 1);
    const name = document.createElement("td"); name.textContent = r.name || "Anonymous";
    const avg = document.createElement("td"); avg.className = "num"; avg.textContent = ms(r.ms);
    tr.append(rank, name, avg);
    tbody.append(tr);
  });
  $("board-table").hidden = rows.length === 0;
  if (rows.length === 0) $("board-note").textContent = "No averages posted on this test yet. Run it, then post yours.";
}

async function refresh(db) {
  const page = await db.list("results", { filter: { test }, sort: "ms", limit: TOP });
  renderRows(page.data);
}

function status(text) {
  const el = $("board-status");
  el.textContent = text;
  el.hidden = text === "";
}

async function boot() {
  const panel = $("board-panel");
  if (!panel) return;
  const db = await client();
  if (!db) return;
  panel.hidden = false;
  try { await refresh(db); } catch { status("The leaderboard is not reachable right now."); }

  let pending = null;
  window.addEventListener("rz:session-done", (e) => {
    pending = e.detail;
    // .btn-row sets display, which outranks the hidden attribute, so the form toggles display itself.
    $("board-form").style.display = "flex";
    $("board-post").disabled = false;
    $("board-post").textContent = "Post my " + ms(pending.ms) + " average";
    $("board-name").value = store.get(NAME_KEY) || "";
    status("");
  });

  $("board-form").onsubmit = async (evt) => {
    evt.preventDefault();
    if (!pending) return;
    const button = $("board-post");
    button.disabled = true;
    const name = $("board-name").value.trim().slice(0, 20);
    store.set(NAME_KEY, name);
    const body = name ? { test, ms: pending.ms, name } : { test, ms: pending.ms };
    try {
      await db.create("results", body);
      const [faster, all] = await Promise.all([db.count("results", { filter: { test, ms: { lt: pending.ms } } }), db.count("results", { filter: { test } })]);
      status("Posted. You are #" + (faster.count + 1).toLocaleString() + " of " + all.count.toLocaleString() + (all.exact ? "" : "+") + " averages posted on this test.");
      button.textContent = "Posted";
      pending = null;
      await refresh(db);
    } catch (err) {
      button.disabled = false;
      status(err && err.message ? err.message : "The post did not go through. Try again.");
    }
  };
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();
