/* reflexzap.com — /audio-vs-visual-reaction-time/ only.

   STRICTLY READ-ONLY. This file reads the four tests' existing history keys and
   renders what it finds. It writes nothing, merges nothing, and creates no
   shared profile — the four tests stay four separate records on purpose (see
   CLAUDE.md: one shared gamification profile would let a tone clear thresholds
   picked for a green box). If you ever find yourself adding a setItem here,
   stop: that is a different feature and it needs its own argument.

   It also never touches the reaction measurement. Nothing on this page runs a
   test. */
(function () {
  "use strict";

  /* The existing keys, unchanged. Names and hrefs match the nav. */
  var TESTS = [
    { key: "reflexzap_history", name: "Visual", href: "/", what: "a box turning green" },
    { key: "reflexzap_audio_history", name: "Audio", href: "/audio-reaction-time-test/", what: "a tone, screen inert" },
    { key: "reflexzap_choice_history", name: "Go / no-go", href: "/choice-reaction-time-test/", what: "green go, red no-go" },
    { key: "reflexzap_f1_history", name: "F1 lights-out", href: "/f1-reaction-test/", what: "five lights going out" },
  ];

  /* Most-recent-first list of `{ date, avg }`, written by app.js at the end of
     a completed run. Anything that is not that shape is treated as absent
     rather than repaired — this page is a reader, not an owner. */
  function history(key) {
    var raw;
    try { raw = localStorage.getItem(key); } catch (e) { return []; }
    if (!raw) return [];
    var list;
    try { list = JSON.parse(raw); } catch (e) { return []; }
    if (!Array.isArray(list)) return [];
    return list.filter(function (row) {
      return row && typeof row.avg === "number" && isFinite(row.avg) && row.avg > 0;
    });
  }

  /* The mean of up to the last 10 session averages. Average-to-average is the
     only comparison this page makes: both sides are then the same statistic —
     a mean of 5-round means — which is what lets the gap be read beside the
     published within-subject contrast at all. */
  function meanAvg(list) {
    var use = list.slice(0, 10);
    if (!use.length) return null;
    var total = 0;
    for (var i = 0; i < use.length; i++) total += use[i].avg;
    return { ms: total / use.length, sessions: use.length };
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  /* ---------- completion prompt ---------- */

  function renderCompletion(done) {
    var count = document.getElementById("done-count");
    var grid = document.getElementById("test-slots");
    if (!grid) return;

    if (count) {
      count.textContent = done.filter(function (t) { return t.taken; }).length +
        " of " + TESTS.length + " tests done";
    }

    grid.textContent = "";
    done.forEach(function (t) {
      var tile = el("div", "latency-tile" + (t.taken ? " is-done" : ""));
      var value = el("div", "lt-value");
      if (t.taken) {
        value.textContent = Math.round(t.mean.ms) + "ms";
      } else {
        var link = el("a", null, "Take it →");
        link.href = t.href;
        value.appendChild(link);
      }
      tile.appendChild(value);
      tile.appendChild(el("div", "lt-label", t.name));
      tile.appendChild(el("div", "lt-note", t.taken
        ? "your average over " + t.mean.sessions + (t.mean.sessions === 1 ? " session" : " sessions")
        : t.what));
      grid.appendChild(tile);
    });
  }

  /* ---------- personal gap ---------- */

  function renderGap(visual, audio) {
    var box = document.getElementById("your-gap");
    if (!box) return;
    box.textContent = "";

    if (!visual || !audio) {
      var missing = !visual && !audio ? "either test"
        : (!visual ? "the visual test" : "the audio test");
      box.appendChild(el("p", null,
        "You have not finished " + missing + " in this browser yet, so there is no gap to show. " +
        "The two tests store their results separately and neither one is uploaded anywhere; " +
        "run both and this box fills itself in."));
      var links = el("p");
      var a1 = el("a", null, "Visual test");
      a1.href = "/";
      var a2 = el("a", null, "Audio test");
      a2.href = "/audio-reaction-time-test/";
      links.appendChild(a1);
      links.appendChild(document.createTextNode(" · "));
      links.appendChild(a2);
      box.appendChild(links);
      return;
    }

    var gap = visual.ms - audio.ms; // positive = sound was faster, as published work predicts
    var faster = gap >= 0;
    var head = el("p", "gap-head");
    var big = el("strong", null, Math.abs(gap).toFixed(0) + "ms");
    head.appendChild(big);
    head.appendChild(document.createTextNode(
      faster ? " faster on sound than on sight" : " faster on sight than on sound"));
    box.appendChild(head);

    box.appendChild(el("p", null,
      "Your visual average is " + visual.ms.toFixed(0) + "ms over " + visual.sessions +
      (visual.sessions === 1 ? " session" : " sessions") + "; your audio average is " +
      audio.ms.toFixed(0) + "ms over " + audio.sessions +
      (audio.sessions === 1 ? " session" : " sessions") + ". Both figures are the mean of your " +
      "recent session averages, so the two sides are the same kind of number."));

    var least = Math.min(visual.sessions, audio.sessions);
    if (least < 3) {
      box.appendChild(el("p", "gap-caveat",
        "With " + least + (least === 1 ? " session" : " sessions") + " on one side, treat this as a " +
        "first impression rather than a measurement — a single distracted round moves a 5-round " +
        "average by tens of milliseconds. Three or four runs each is where the number settles."));
    } else if (Math.abs(gap) < 10) {
      box.appendChild(el("p", "gap-caveat",
        "A gap this small is inside the run-to-run noise of both tests, so read it as “no " +
        "clear difference for you” rather than as a result."));
    } else if (!faster) {
      box.appendChild(el("p", "gap-caveat",
        "Reversed against the published contrast, which is common on individual data and usually " +
        "says more about the equipment than the ears: an audio path adds buffering that a screen " +
        "does not, and Bluetooth headphones add tens of milliseconds on their own."));
    }
  }

  /* ---------- go ---------- */

  var state = TESTS.map(function (t) {
    var mean = meanAvg(history(t.key));
    return { name: t.name, href: t.href, what: t.what, taken: !!mean, mean: mean };
  });

  renderCompletion(state);
  renderGap(state[0].mean, state[1].mean);
})();
