#!/usr/bin/env python3
"""Render the three sibling test pages from one shared cabinet shell.

    python3 tools/build_tests.py            # write all six files
    python3 tools/build_tests.py --check    # exit 1 if any file is stale

WHY THIS EXISTS. index.html is hand-written and stays that way: it is the one
page whose markup is not a variation on anything. The other three tests are —
they are the same cabinet, the same results panel and the same history table
with a different stimulus, and each of them ships TWICE, at `/x/index.html` and
at the flat `/x.html` alias, byte-identical, because that is the precedent
`reaction-time-percentiles` set. Six files that must agree on several hundred
lines of shared chrome is exactly the shape of thing that drifts when it is
maintained by hand, and drift in the cabinet shell is invisible until a page
loses its ad tag or its erabbit mark.

So: the shell lives here once, the per-test content lives in TESTS below, and
the files on disk are output. Edit this file, not the HTML it writes.

This is not a build step in the sense CLAUDE.md rules out — the site still ships
plain static HTML with nothing computed at page load, exactly like
tools/sync_nav.py, which this script is deliberately shaped after. Run
sync_nav.py afterwards: the nav region is left as an empty marker pair here so
that one script stays the only thing that knows about the toolbar.

`test/percentile.test.js` independently checks the OUTPUT — pairs identical, one
ad tag, mark last in body, no external requests — so a hand-edit that bypasses
this script still gets caught.
"""

import argparse
import re
import sys
from pathlib import Path

# The toolbar belongs to sync_nav.py and to no one else. This script emits an
# empty marker pair and, on every subsequent run, carries whatever sync_nav has
# put between the markers straight across — so the two scripts can be run in
# either order, any number of times, without fighting over the same bytes.
NAV_RE = re.compile(r"(<!-- nav:start -->)(.*?)(<!-- nav:end -->)", re.S)

ROOT = Path(__file__).resolve().parent.parent

# Bump together with the ?v= in every other page whenever the coupled
# HTML/CSS/JS change ships. Cached visitors get new HTML with stale CSS
# otherwise; this exact bug has hit a sibling site.
V = "6"

AD_TAG = (
    '<script async src="https://pagead2.googlesyndication.com/pagead/js/'
    'adsbygoogle.js?client=ca-pub-7560786263587509" crossorigin="anonymous"></script>'
)

ERABBIT = (
    '<a href="https://erabb.it" class="erabbit-mark" aria-label="erabb.it">'
    '<img src="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 '
    'viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>&#128007;</text>'
    "</svg>\" width=\"10\" height=\"10\" alt=\"\"></a>"
)

# The four tests, in nav order. Used to render the cross-link strip under every
# cabinet, so a visitor on any one test can reach the other three.
SWITCH = [
    ("/", "Visual"),
    ("/audio-reaction-time-test/", "Audio"),
    ("/choice-reaction-time-test/", "Go / No-Go"),
    ("/f1-reaction-test/", "F1 Lights"),
]


def esc(text):
    return (
        text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")
    )


# --------------------------------------------------------------------------
# Shared reference blocks
# --------------------------------------------------------------------------

BROWSER_CAVEAT = """  <div class="callout">
    <strong>Your browser is in the measurement.</strong> Every number on this page
    is a browser reading, and a browser reads slower than a laboratory. Anwyl-Irvine
    and colleagues drove research-grade browser platforms with a calibrated robot
    finger and measured a mean response lag of <strong>78.81ms</strong> (SD 18.51) in
    Chrome, and 71.3&ndash;87.4ms across platforms. That delay is your screen, your
    input device and your operating system, and none of it is you. Where this page
    quotes a figure measured on laboratory equipment it says so and states the
    correction applied &mdash; a lab number and a browser number are never presented
    as the same kind of thing.
  </div>"""

SRC_ANWYL = (
    '    <li>Anwyl-Irvine A, Dalmaijer ES, Hodges N, Evershed JK (2021). Realistic '
    "precision and accuracy of online experiment platforms, web browsers, and devices. "
    'Behavior Research Methods 53(4):1407-1425.<span class="src-kind">peer-reviewed</span>'
    '<br><a href="https://doi.org/10.3758/s13428-020-01501-5" rel="nofollow noopener" '
    'target="_blank">https://doi.org/10.3758/s13428-020-01501-5</a><br>Mean browser '
    "response lag measured with a calibrated robot actuator: Chrome 78.81 ms (SD 18.51); "
    "71.3-87.4 ms across the four platforms tested.</li>"
)

SRC_WOODS = (
    "    <li>Woods DL, Wyma JM, Yund EW, Herron TJ, Reed B (2015). Factors influencing "
    "the latency of simple reaction time. Frontiers in Human Neuroscience 9:131."
    '<span class="src-kind">peer-reviewed</span><br><a href="https://doi.org/10.3389/'
    'fnhum.2015.00131" rel="nofollow noopener" target="_blank">https://doi.org/10.3389/'
    "fnhum.2015.00131</a><br>N = 1469, ages 18-65, 120 scored trials each. Mean simple "
    "visual reaction time 231 ms; between-subject SD 26.8 ms; mean trial-to-trial SD "
    "40.0 ms within each individual.</li>"
)

SRC_HB = (
    "    <li>Human Benchmark &mdash; Reaction Time Statistics (accessed 2026)."
    '<span class="src-kind">web dataset</span><br><a href="https://humanbenchmark.com/'
    'tests/reactiontime/statistics" rel="nofollow noopener" target="_blank">https://'
    "humanbenchmark.com/tests/reactiontime/statistics</a><br>Over 81 million "
    "browser-measured reaction time clicks: median 273 ms, mean 284 ms. Aggregated by "
    "that site, not by this one.</li>"
)


def related(items):
    out = ["  <h2>Related</h2>"]
    for href, title, blurb in items:
        out.append('  <div class="faq-item">')
        out.append('    <h3><a href="%s">%s</a></h3>' % (href, title))
        out.append("    <p>%s</p>" % blurb)
        out.append("  </div>")
    return "\n".join(out)


def faq(items):
    out = ["  <h2>Frequently asked questions</h2>"]
    for q, a in items:
        out.append('  <div class="faq-item">')
        out.append("    <h3>%s</h3>" % q)
        out.append("    <p>%s</p>" % a)
        out.append("  </div>")
    return "\n".join(out)


# --------------------------------------------------------------------------
# The three tests
# --------------------------------------------------------------------------

AUDIO_BODY = """  <h1>Audio Reaction Time Test</h1>

  <p>This is a reaction time test with nothing to look at. The stage stays dark for
  a random two to five seconds, a short tone fires, and the clock runs from the
  moment that tone is actually audible to the moment you click, tap or hit
  <kbd>Space</kbd>. Five rounds, then an average. It is the same measurement the
  <a href="/">visual reaction time test</a> makes, with the eye taken out of the
  loop &mdash; which turns out to be worth about twenty milliseconds.</p>

%(caveat)s

  <h2 id="why-faster">Why hearing beats sight</h2>
  <p>Sound gets to the motor system on a shorter path. A visual stimulus has to be
  transduced by photoreceptors &mdash; a comparatively slow chemical cascade &mdash;
  before anything travels down the optic nerve. A sound is transduced mechanically
  by hair cells, and the auditory pathway to the cortex has fewer synapses to cross.
  The consequence is measurable, consistent, and smaller than the internet usually
  claims.</p>

  <p>The cleanest way to see it is a study that measured both stimuli in the
  <em>same</em> people on the <em>same</em> apparatus. Jain and colleagues did exactly
  that with 120 subjects: mean visual reaction time <strong>247.60ms</strong> (SD
  18.54) against mean auditory reaction time <strong>228.01ms</strong> (SD 16.49).
  The gap is <strong>19.6ms</strong>.</p>

  <p>Two caveats belong with those numbers, and they are why this page does not
  quote a bigger figure. First, each subject's score in that study is the
  <em>fastest of five readings</em>, not a mean, so the absolute values sit lower
  than a mean-based measurement would &mdash; it is the difference between the two
  conditions that is being borrowed here, not the levels. Second, you will see much
  larger auditory advantages quoted elsewhere, sometimes forty or fifty milliseconds;
  those almost always compare figures collected on different equipment in different
  studies, which measures the equipment as much as the ear. A defensible auditory
  advantage is around twenty to thirty milliseconds. Anything much larger is an
  artefact of how the comparison was assembled.</p>

  <h2 id="tone">How the tone is made, and why that matters</h2>
  <p>The cue is a 1000&nbsp;Hz square wave lasting 130 milliseconds, generated on
  the fly by the Web Audio API. Nothing is downloaded &mdash; this site makes no
  external requests of any kind, so there is no audio file to fetch and no chance
  of a first round being slower than the rest because a sample was still loading.</p>

  <p>The subtle part is deciding <em>when</em> the tone happened. Audio does not
  play the instant you ask for it: the samples are scheduled, then travel through
  an output buffer before a speaker moves. Timestamping the moment the note was
  scheduled would hand you the whole of that buffer as free reaction time, tens of
  milliseconds of it. So the test schedules the note a fixed lead ahead, then uses
  <code>AudioContext.getOutputTimestamp()</code> to map that scheduled instant onto
  the same high-resolution clock the click is read from &mdash; the one API that
  accounts for the buffer. Where a browser does not provide it, the reported
  <code>outputLatency</code> is used instead. A click that lands before the tone is
  genuinely audible is still a false start, and the round restarts.</p>

  <p>Headphones will generally give you a cleaner reading than laptop speakers, and
  Bluetooth headphones will give you a much worse one &mdash; wireless audio adds its
  own buffering, often over a hundred milliseconds of it, and no browser API can
  subtract that for you. If your audio result is dramatically slower than your visual
  one, suspect the headphones before you suspect your ears.</p>

  <h2 id="distribution">What the percentile compares you to</h2>
  <p>The percentile on your results is read off a model built from published figures,
  not from anyone's score on this site &mdash; there is no backend here and nothing
  leaves your device, so there is nothing to aggregate. The model is anchored by
  shifting this site's visual distribution by the auditory advantage above: a median
  of <strong>253ms</strong> (273 &minus; 19.6) with a standard deviation of
  <strong>34ms</strong> (38 &times; 16.49/18.54, the same study's ratio between its
  two conditions). Two published numbers, no free parameters, and the whole derivation
  is in <code>assets/js/percentile.js</code> and on the
  <a href="/reaction-time-percentiles/">percentile reference page</a>.</p>

  <p>One limitation this model does not correct for: audio output latency varies more
  between machines than display latency does. The test removes the part of it the
  browser can report, but a set of wireless earbuds can still put you a whole band
  lower than the same ears on wired headphones. Compare yourself to yourself, on the
  same equipment, on different days &mdash; that comparison is real in a way that a
  rank against a modelled population never quite is.</p>

%(faq)s

  <h2 id="sources">Sources</h2>
  <ul class="source-list">
    <li>Jain A, Bansal R, Kumar A, Singh KD (2015). A comparative study of visual and
    auditory reaction times on the basis of gender and physical activity levels of
    medical first year students. International Journal of Applied and Basic Medical
    Research 5(2):124-127.<span class="src-kind">peer-reviewed</span><br>
    <a href="https://doi.org/10.4103/2229-516X.157168" rel="nofollow noopener" target="_blank">https://doi.org/10.4103/2229-516X.157168</a><br>
    Visual and auditory simple reaction time in the same 120 subjects on the same
    apparatus: visual 247.60 ms (SD 18.54), auditory 228.01 ms (SD 16.49). Each score
    is the fastest of five readings.</li>
%(hb)s
%(anwyl)s
  </ul>
  <p class="disclaimer">Figures are quoted as published. Where this page derives
  something from them &mdash; the 253ms median and the 34ms spread &mdash; the
  arithmetic is shown above rather than presented as a measurement.</p>

%(related)s"""

AUDIO_FAQ = [
    (
        "Is auditory reaction time really faster than visual?",
        "Yes, consistently, by a modest amount. Measured in the same people on the "
        "same equipment, the gap is around twenty milliseconds &mdash; 247.60ms visual "
        "against 228.01ms auditory in the study cited below. It is a real effect with "
        "a real physiological cause, and it is much smaller than the forty-plus "
        "millisecond figures that circulate online, which come from comparing "
        "separate studies run on different rigs.",
    ),
    (
        "I hear nothing when I press Draw.",
        "Browsers refuse to make sound until you have interacted with the page, so "
        "the first click on Draw is also what unlocks audio &mdash; that is normal and "
        "the test accounts for it. Beyond that: check the mute button in the header "
        "(the speaker icon), check your system volume, and check that the tab is not "
        "muted. The cue tone deliberately ignores the site's sound-effects mute, "
        "because it is the thing being measured rather than a sound effect.",
    ),
    (
        "Should I use headphones?",
        "Wired headphones, yes &mdash; they give the cleanest reading. Bluetooth "
        "headphones, no: wireless audio adds buffering that can exceed a hundred "
        "milliseconds and no browser API can measure it away, so your score will be "
        "your headphones' latency plus your reaction time with no way to separate "
        "them.",
    ),
    (
        "Why does the screen stay dark?",
        "Because any visual change at the moment of the cue would be a second, faster "
        "stimulus, and you would end up reacting to the screen instead of the sound. "
        "The stage is deliberately inert from the start of the wait until after you "
        "respond.",
    ),
]

CHOICE_BODY = """  <h1>Go / No-Go Reaction Test</h1>

  <p>Simple reaction time asks one question: how fast can you respond? A go/no-go
  task asks a harder one: how fast can you respond <em>when you also have to be
  ready not to</em>. Eight trials run here, five of them green and three of them
  red, shuffled so the order is not learnable. Green means click. Red means hold.
  You get two numbers at the end, and the second one is the interesting one.</p>

%(caveat)s

  <h2 id="two-numbers">The two numbers</h2>
  <p><strong>Mean go latency</strong> is your average response time across the five
  green trials &mdash; comparable in kind to the number the
  <a href="/">visual reaction time test</a> gives you, but slower, because a decision
  now sits between the stimulus and the movement. You are no longer reacting; you are
  classifying and then reacting.</p>

  <p><strong>False starts</strong> is a count of how many red trials you responded to
  anyway. In the research literature these are called <em>commission errors</em>, and
  they are the whole point of the paradigm: they measure response inhibition, which
  is a different faculty from speed. The two trade against each other. Push your
  latency down far enough and you will start clicking on red, because you are no
  longer waiting to find out what colour it is. That trade-off is visible in your own
  results across a few sessions, and it is the reason this test reports both numbers
  instead of averaging them into one score.</p>

  <p>A red trial you correctly held is scored as a win, contributes nothing to your
  latency, and lights your pip &mdash; nothing happening is the correct outcome, so it
  is rewarded like one.</p>

  <h2 id="slower">Why go/no-go is slower than simple reaction time</h2>
  <p>The extra time is a decision stage. On a simple reaction test the stimulus and
  the required response are known in advance, so the only work is detection. Here the
  stimulus has to be identified before the response can be selected or withheld, and
  that identification costs real milliseconds &mdash; typically the difference between
  a figure in the two-hundreds and one in the three- to four-hundreds.</p>

  <p>Schulz and colleagues measured the non-emotional version of this task &mdash;
  green square for go, red square for no-go, the same rule used here &mdash; in 85
  participants. Their mean go reaction time was <strong>362ms</strong> (SD 57).
  That is a laboratory figure, so putting a browser score next to it needs a
  correction, and this site applies one explicitly: <strong>362 + 78.81 =
  441ms</strong>, using Anwyl-Irvine's robot-measured mean Chrome response lag. The
  spread combines the study's between-subject SD of 57ms with the between-machine SD
  of that browser lag, 18.51ms, in quadrature: <strong>60ms</strong>. Those two
  numbers, both published, are the entire model. The derivation lives in
  <code>assets/js/percentile.js</code> and on the
  <a href="/reaction-time-percentiles/">percentile reference page</a>.</p>

  <h2 id="errors">About that error rate &mdash; and why yours is not comparable</h2>
  <p>The same study reports a commission error rate of <strong>8.23%%</strong>
  (SD 7.61) and an omission rate of 0.81%% (SD 3.91). It is tempting to hand you those
  as a benchmark. They are not one, and this page will not use them as one.</p>

  <p>Commission rate is not a property of a person. It is a property of a person
  <em>and</em> a task, and it moves sharply with two parameters in particular: how
  often a no-go trial occurs, and how fast the task is paced. Schulz's figures were
  measured with each stimulus shown for 500ms and 1250&ndash;1750ms between trials
  &mdash; brisk, unrelenting, and designed to build up a habitual go response that the
  no-go trial then has to interrupt. This test runs three no-go trials in eight, which
  is a far higher proportion than a research task uses, and it waits a random two to
  five seconds before each cue. Both differences make holding easier here. Your false
  start count and their 8.23%% are measurements of different things that happen to
  share a name.</p>

  <p>So: the go latency gets a percentile, because the model behind it is built on a
  published mean for this task with a stated correction. The false start count gets a
  raw number and no percentile, because there is no honest way to produce one. That
  asymmetry is deliberate. A percentile invented to fill a gap in a table is worse
  than an empty cell.</p>

%(faq)s

  <h2 id="sources">Sources</h2>
  <ul class="source-list">
    <li>Schulz KP, Fan J, Magidina O, Marks DJ, Hahn B, Halperin JM (2007). Does the
    emotional go/no-go task really measure behavioral inhibition? Convergence with
    measures on a non-emotional analog. Archives of Clinical Neuropsychology
    22(2):151-160.<span class="src-kind">peer-reviewed</span><br>
    <a href="https://doi.org/10.1016/j.acn.2006.12.001" rel="nofollow noopener" target="_blank">https://doi.org/10.1016/j.acn.2006.12.001</a><br>
    Non-emotional go/no-go, N = 85, green = go and red = no-go, stimulus 500 ms with a
    1250-1750 ms inter-stimulus interval. Mean go reaction time 362 ms (SD 57);
    commission errors 8.23%% (SD 7.61); omission errors 0.81%% (SD 3.91).</li>
%(anwyl)s
  </ul>
  <p class="disclaimer">Figures are quoted as published, with the task parameters they
  belong to. Where this page derives something from them &mdash; the 441ms centre and
  the 60ms spread &mdash; the arithmetic is shown above rather than presented as a
  measurement.</p>

%(related)s"""

CHOICE_FAQ = [
    (
        "What is a good go/no-go reaction time?",
        "Slower than a good simple reaction time, and that is expected rather than a "
        "problem &mdash; the extra time is the decision. The model this site uses puts "
        "the middle of the distribution around 437ms for a browser measurement, "
        "against 273ms for simple visual reaction. A go latency in the high three "
        "hundreds with no false starts is a genuinely good result.",
    ),
    (
        "Is it better to be fast or to make no mistakes?",
        "They are two different skills and the test reports them separately for that "
        "reason. Speed with false starts is not the same achievement as speed without "
        "them, and a very low latency accompanied by a couple of commission errors "
        "usually means you stopped waiting to find out what colour the cue was.",
    ),
    (
        "How many red trials are there?",
        "Three of the eight, shuffled each session so the pattern cannot be learned, "
        "and never on the first trial &mdash; the opening trial teaches the rule. That "
        "is a higher no-go proportion than a research task would use, which is one of "
        "the reasons your error count is not comparable to published error rates.",
    ),
    (
        "Is this the same as a choice reaction time test?",
        "It is the closest common relative. A true choice reaction task gives you two "
        "or more responses to pick between; go/no-go gives you one response and the "
        "option of withholding it. Both add a decision stage on top of simple reaction "
        "time, which is why both are slower, and go/no-go is the version that yields a "
        "clean inhibition measure.",
    ),
]

F1_BODY = """  <h1>F1 Reaction Test: Lights Out and Away We Go</h1>

  <p>Five red lights come on, one per second. They hold. Then they all go out at once,
  and that is the signal. This test runs the Formula 1 start procedure and measures
  the gap between lights-out and your click, tap or <kbd>Space</kbd> &mdash; five
  starts, then an average. What it will not do is repeat the three things about F1
  reaction times that the rest of the internet has confidently wrong.</p>

%(caveat)s

  <h2 id="procedure">The real procedure</h2>
  <p>At a Grand Prix start the five red lights illuminate in sequence at one-second
  intervals. Then comes the part that makes the whole thing a reaction test rather
  than a rhythm test: the lights are held for a period the drivers cannot predict
  &mdash; a randomly chosen interval of roughly <strong>0.2 to 3 seconds</strong>
  &mdash; before being extinguished together. The race begins when they go out, not
  when they come on. This test uses exactly that: one-second light steps, then a
  random hold in that range, then darkness.</p>

  <p>The unpredictable hold is the entire design. If the delay were fixed, a driver
  could count it out and leave on the count, and the start would measure timing rather
  than reaction. The same is true here: five lights on a one-second cadence are easy
  to anticipate, and then the ground moves.</p>

  <h2 id="jump-start">What actually counts as a jump start</h2>
  <p>Here is the correction worth making. There is a widely repeated claim that
  Formula 1 penalises any start reaction faster than some threshold &mdash; usually
  quoted as 0.2 seconds, sometimes 0.1. <strong>There is no reaction time threshold
  anywhere in the Formula 1 regulations.</strong></p>

  <p>The FIA Formula 1 Sporting Regulations define a false start in terms of
  <em>movement</em>: a car that moves before the signal is given has jumped the start,
  and that is judged by the transponder-based detection system, not by a stopwatch on
  the driver's nervous system (2025 Sporting Regulations, Articles 44.10(b) and
  48.1(a)). A car that stays still until lights-out has not jumped the start no matter
  how quickly it then goes. The rule is about position, not latency, and the two get
  conflated constantly.</p>

  <p>The related myth is the &ldquo;record&rdquo; F1 start reaction time. Various
  figures circulate, attached to various drivers. No primary source publishes one:
  the FIA does not release per-driver start reaction times as a ratified statistic,
  and there is no official record to hold. This page therefore does not quote one, and
  you should be suspicious of pages that do.</p>

  <h2 id="anticipation">The 100ms rule this test does use</h2>
  <p>A response under a tenth of a second after the cue was already on its way before
  the cue arrived &mdash; the signal has not finished crossing your nervous system in
  that time, let alone reached your hand. So a reading below <strong>100ms</strong>
  here is treated as an anticipated getaway rather than a reaction, and the round
  restarts instead of scoring.</p>

  <p>That threshold is borrowed, and the source matters because it is the only
  governing body that publishes one. World Athletics rules a sprint start reaction
  faster than 0.100 seconds an anticipation rather than a reaction (Technical Rules,
  Book C &ndash; C2.1), and disqualifies on that basis. It is a sprinter's number, not
  a driver's, and it is applied here for the same reason it exists there: a start test
  that rewards guessing is not measuring reaction. This is the only test on this site
  that enforces it, because it is the only one where the cue is preceded by a
  countdown worth guessing against.</p>

  <h2 id="percentile">What your percentile is actually against</h2>
  <p>Plainly: the general simple visual reaction time distribution, the same one
  behind the <a href="/">visual reaction time test</a> &mdash; a median of
  <strong>273ms</strong> and a spread of <strong>38ms</strong>, derived from a
  published 81-million-click browser dataset and from Woods and colleagues, with the
  full derivation on the <a href="/reaction-time-percentiles/">percentile reference
  page</a>.</p>

  <p>It is not an F1-specific distribution, because none exists. No governing body,
  team or journal publishes a population of start reaction times, and inventing
  parameters to fill that gap would be fabricating statistics rather than reporting
  them. What this test measures &mdash; a response to a screen going dark &mdash; is
  simple visual reaction time, so simple visual reaction time is what it is scored
  against, and the label says so.</p>

  <p>Two things that model does not capture, stated rather than hidden. The five-light
  countdown is a warning signal, and warned responses tend to be faster than unwarned
  ones; the visual test's unannounced two-to-five-second wait has no such warning. And
  the hold here is short, 0.2 to 3 seconds against that test's 2 to 5. Both differences
  push in directions that no figure traceable to this exact procedure can quantify, so
  read your F1 percentile as &ldquo;where this reading would sit on the general
  simple-reaction curve&rdquo;, which is literally what it is.</p>

%(faq)s

  <h2 id="sources">Sources and rules</h2>
  <ul class="source-list">
    <li>F&eacute;d&eacute;ration Internationale de l'Automobile &mdash; 2025 Formula 1
    Sporting Regulations, Articles 44.10(b) and 48.1(a).<span class="src-kind">governing body</span><br>
    <a href="https://www.fia.com/regulation/category/110" rel="nofollow noopener" target="_blank">https://www.fia.com/regulation/category/110</a><br>
    Define a false start by movement of the car before the starting signal, detected
    by the transponder system. They specify no reaction time threshold.</li>
    <li>World Athletics &mdash; Technical Rules, Book C, C2.1.<span class="src-kind">governing body</span><br>
    <a href="https://worldathletics.org/about-iaaf/documents/book-of-rules" rel="nofollow noopener" target="_blank">https://worldathletics.org/about-iaaf/documents/book-of-rules</a><br>
    A start reaction faster than 0.100 s is ruled an anticipation rather than a
    reaction. This is the source of the 100ms cutoff this test applies.</li>
    <li>Formula 1 &mdash; race start procedure explainer, formula1.com, 2 March 2024.<span class="src-kind">official publisher</span><br>
    States that the five red lights are extinguished after a randomly chosen hold of
    between 0.2 and 3 seconds. This is the specification the test's hold is built to.</li>
%(hb)s
%(woods)s
%(anwyl)s
  </ul>
  <p class="disclaimer">No reaction time figure is attributed to any driver or to any
  race on this page, because no primary source publishes one.</p>

%(related)s"""

F1_FAQ = [
    (
        "What is a good F1 reaction time?",
        "Anything under about 250ms on a browser is a quick getaway, and under 200ms "
        "is at the edge of what a screen and a mouse allow. Bear in mind that a real "
        "start also involves releasing a clutch paddle and managing wheelspin, so a "
        "click here is the reaction component alone, without any of the car control "
        "that decides whether the reaction turns into a good start.",
    ),
    (
        "Does F1 disqualify you for reacting too fast?",
        "No. The regulations define a false start as the car moving before the signal, "
        "detected by transponder &mdash; there is no reaction time threshold in them at "
        "all. The commonly quoted 0.2-second rule does not exist in Formula 1. It is "
        "sprinting, under World Athletics rules, that uses a 0.100-second anticipation "
        "threshold, and this test borrows that number for its own jump-start rule.",
    ),
    (
        "What is the record F1 start reaction time?",
        "There isn't a published one. The FIA does not release per-driver start "
        "reaction times as a ratified record, so any specific figure you see attached "
        "to a driver's name is unsourced. This page deliberately does not quote one.",
    ),
    (
        "Why did my round restart when I was really fast?",
        "Because it was too fast to be a reaction. Anything under 100ms after "
        "lights-out was already in motion before the lights went out, so the test "
        "treats it as an anticipated start and runs the round again rather than "
        "scoring a physically impossible number.",
    ),
    (
        "How long is the hold?",
        "Randomly between 0.2 and 3 seconds after the fifth light, which is the range "
        "used at a real start. It is re-rolled every round, so counting will not help "
        "you.",
    ),
]


TESTS = [
    {
        "slug": "audio-reaction-time-test",
        "mode": "audio",
        "title": "Audio Reaction Time Test - How Fast Do You React to Sound?",
        "description": (
            "Free audio reaction time test. The screen never changes - click the instant you "
            "hear the tone. 5 rounds in milliseconds, scored against a cited distribution, "
            "entirely in your browser."
        ),
        "og_title": "Audio Reaction Time Test - React to Sound, Not Sight",
        "og_description": (
            "No visual cue at all. A tone fires after a random delay and the clock runs to "
            "your click. 5 rounds, milliseconds, free and instant."
        ),
        "jsonld_name": "Audio Reaction Time Test",
        "jsonld_desc": (
            "Free browser-based audio reaction time test: the screen stays dark and a "
            "synthesized tone fires after a random delay, measured in milliseconds over 5 rounds."
        ),
        "mq2": "Sound",
        "marquee_sub": "Ears Only &middot; reflexzap.com",
        "stage_title": "Ears only",
        "stage_sub": "Turn the volume up, hit Draw, then click the instant you hear the tone.",
        "rounds_label": "Round 1 of 5",
        "dist_blurb": (
            "Modelled from simple auditory reaction times reported in published studies "
            "&mdash; <strong>not</strong> from results recorded on this site, which stores "
            "nothing off your device. "
            '<a href="/reaction-time-percentiles/">See the full table and sources</a>.'
        ),
        "rounds_title": "Your 5 rounds",
        "false_alarms": False,
        "lights": False,
        "body": AUDIO_BODY
        % {
            "caveat": BROWSER_CAVEAT,
            "faq": faq(AUDIO_FAQ),
            "hb": SRC_HB,
            "anwyl": SRC_ANWYL,
            "related": related(
                [
                    ("/", "Visual Reaction Time Test", "The same measurement with the eye back in the loop. Compare the two &mdash; the gap should be around twenty milliseconds."),
                    ("/choice-reaction-time-test/", "Go / No-Go Reaction Test", "Green means click, red means hold. Adds a decision to the reaction, and reports your false starts as a second number."),
                    ("/reaction-time-percentiles/", "Reaction Time Percentiles", "The full distribution, the age bands, and where every figure on this site comes from."),
                ]
            ),
        },
    },
    {
        "slug": "choice-reaction-time-test",
        "mode": "choice",
        "title": "Go / No-Go Reaction Test - Choice Reaction Time and False Starts",
        "description": (
            "Free go/no-go reaction test. Green means click, red means hold. Eight trials "
            "give you a mean go-latency and a false-start count - two numbers, measured in "
            "your browser, nothing uploaded."
        ),
        "og_title": "Go / No-Go Reaction Test - Speed and Self-Control",
        "og_description": (
            "Green means click. Red means don't. Get your mean go-latency and your "
            "false-start count in one 8-trial session."
        ),
        "jsonld_name": "Go / No-Go Reaction Test",
        "jsonld_desc": (
            "Free browser-based go/no-go reaction test: respond to green cues and withhold "
            "on red ones, reporting mean go-trial latency in milliseconds and a count of "
            "false starts."
        ),
        "mq2": "Hold",
        "marquee_sub": "Green Go &middot; Red No &middot; reflexzap.com",
        "stage_title": "Green go, red no",
        "stage_sub": "Hit Draw. Click on green, hold on red — eight rounds, five of them green.",
        "rounds_label": "Round 1 of 8",
        "dist_blurb": (
            "Modelled from go/no-go go-trial reaction times reported in published research "
            "&mdash; <strong>not</strong> from results recorded on this site, which stores "
            "nothing off your device. "
            '<a href="/reaction-time-percentiles/">See the full table and sources</a>.'
        ),
        "rounds_title": "Your green rounds",
        "false_alarms": True,
        "lights": False,
        "body": CHOICE_BODY
        % {
            "caveat": BROWSER_CAVEAT,
            "faq": faq(CHOICE_FAQ),
            "anwyl": SRC_ANWYL,
            "related": related(
                [
                    ("/", "Visual Reaction Time Test", "The same green cue with nothing to withhold. The gap between your two scores is the cost of the decision."),
                    ("/f1-reaction-test/", "F1 Reaction Test", "Five red lights, an unannounced hold, then lights out &mdash; and a jump-start rule with a real citation behind it."),
                    ("/reaction-time-percentiles/", "Reaction Time Percentiles", "The full distribution, the age bands, and where every figure on this site comes from."),
                ]
            ),
        },
    },
    {
        "slug": "f1-reaction-test",
        "mode": "f1",
        "title": "F1 Reaction Test - Five Lights Out, How Fast Is Your Start?",
        "description": (
            "Free F1 start reaction test. Five red lights, a random hold, then lights out - "
            "measure your getaway in milliseconds over 5 starts. Uses the real start "
            "procedure, runs entirely in your browser."
        ),
        "og_title": "F1 Reaction Test - Lights Out and Away We Go",
        "og_description": (
            "Five red lights, an unannounced hold of 0.2 to 3 seconds, then darkness. "
            "Measure your start reaction over 5 attempts."
        ),
        "jsonld_name": "F1 Reaction Test",
        "jsonld_desc": (
            "Free browser-based Formula 1 start reaction test: five red lights illuminate in "
            "sequence and are extinguished after a random hold, measuring reaction from "
            "lights-out in milliseconds over 5 starts."
        ),
        "mq2": "Grid",
        "marquee_sub": "Lights Out &middot; reflexzap.com",
        "stage_title": "On the grid",
        "stage_sub": "Hit Draw. Five red lights come on one by one — react the instant they all go out.",
        "rounds_label": "Round 1 of 5",
        "dist_blurb": (
            "Modelled from simple visual reaction times in published studies and one large "
            "public web dataset &mdash; no F1-specific distribution is published anywhere, "
            "and this is <strong>not</strong> built from results recorded on this site. "
            '<a href="/reaction-time-percentiles/">See the full table and sources</a>.'
        ),
        "rounds_title": "Your 5 starts",
        "false_alarms": False,
        "lights": True,
        "body": F1_BODY
        % {
            "caveat": BROWSER_CAVEAT,
            "faq": faq(F1_FAQ),
            "hb": SRC_HB,
            "woods": SRC_WOODS,
            "anwyl": SRC_ANWYL,
            "related": related(
                [
                    ("/", "Visual Reaction Time Test", "The same stimulus without the countdown &mdash; an unannounced wait of two to five seconds instead of five lights."),
                    ("/audio-reaction-time-test/", "Audio Reaction Time Test", "No lights at all. A tone fires instead, and hearing reaches the motor system about twenty milliseconds sooner."),
                    ("/reaction-time-percentiles/", "Reaction Time Percentiles", "The distribution this test scores you against, the age bands, and every source behind it."),
                ]
            ),
        },
    },
]


# --------------------------------------------------------------------------
# The shell
# --------------------------------------------------------------------------

def render(t):
    url = "https://reflexzap.com/%s/" % t["slug"]

    lights = ""
    if t["lights"]:
        lights = (
            '\n        <div class="f1-lights" id="f1-lights" aria-hidden="true">'
            + "".join('<span class="f1-light"></span>' for _ in range(5))
            + "</div>"
        )

    switch = ['<nav class="test-switch" aria-labelledby="test-switch-label">',
              '  <span class="test-switch-label" id="test-switch-label">The four tests</span>',
              "  <ul>"]
    for href, label in SWITCH:
        current = ' aria-current="page"' if href == "/%s/" % t["slug"] else ""
        switch.append('    <li><a href="%s"%s>%s</a></li>' % (href, current, label))
    switch += ["  </ul>", "</nav>"]
    switch = "\n".join("    " + ln for ln in switch)

    false_alarm_tile = ""
    if t["false_alarms"]:
        false_alarm_tile = (
            '\n      <div class="stat-tile">\n'
            '        <div class="stat-label">False starts</div>\n'
            '        <div class="stat-value" id="result-false-alarms">&mdash;</div>\n'
            "      </div>"
        )

    return TEMPLATE % {
        "title": esc(t["title"]),
        "description": esc(t["description"]),
        "url": url,
        "og_title": esc(t["og_title"]),
        "og_description": esc(t["og_description"]),
        "jsonld_name": t["jsonld_name"],
        "jsonld_desc": t["jsonld_desc"],
        "mode": t["mode"],
        "mq2": t["mq2"],
        "marquee_sub": t["marquee_sub"],
        "stage_title": t["stage_title"],
        "stage_sub": t["stage_sub"],
        "rounds_label": t["rounds_label"],
        "rounds_title": t["rounds_title"],
        "dist_blurb": t["dist_blurb"],
        "lights": lights,
        "switch": switch,
        "false_alarm_tile": false_alarm_tile,
        "body": t["body"],
        "ad": AD_TAG,
        "erabbit": ERABBIT,
        "v": V,
    }


TEMPLATE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>%(title)s</title>
<meta name="description" content="%(description)s">
<link rel="canonical" href="%(url)s">
<meta name="theme-color" content="#05070b">

<meta property="og:type" content="website">
<meta property="og:title" content="%(og_title)s">
<meta property="og:description" content="%(og_description)s">
<meta property="og:url" content="%(url)s">
<meta property="og:image" content="https://reflexzap.com/assets/og-image.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="%(og_title)s">
<meta name="twitter:description" content="%(og_description)s">
<meta name="twitter:image" content="https://reflexzap.com/assets/og-image.png">

<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/assets/css/styles.css?v=%(v)s">
<script>try{var t=localStorage.getItem("reflexzap_theme");if(t)document.documentElement.setAttribute("data-theme",t);}catch(e){}</script>

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "WebApplication",
  "name": "%(jsonld_name)s",
  "url": "%(url)s",
  "applicationCategory": "GameApplication",
  "operatingSystem": "Any",
  "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
  "description": "%(jsonld_desc)s"
}
</script>

%(ad)s
</head>
<body data-mode="%(mode)s">
<a class="skip-link" href="#main">Skip to content</a>

<header class="site-header">
  <div class="header-inner">
    <a class="brand" href="/" aria-label="reflexzap.com home">
      <span class="brand-mark"><span class="bolt" aria-hidden="true"></span>ReflexZap</span>
      <span class="brand-tag">reaction time test</span>
    </a>
    <div class="header-actions">
      <button id="sound-toggle" class="icon-btn" type="button" aria-label="Toggle sound effects" title="Toggle sound">&#128266;</button>
      <button id="theme-toggle" class="icon-btn" type="button" aria-label="Toggle dark/light theme" title="Toggle theme">&#9680;</button>
    </div>
  </div>
</header>

<!-- nav:start -->
<!-- nav:end -->

<main id="main">
  <div class="cabinet">
    <div class="marquee">
      <div class="marquee-logo"><span class="mq-1">Reflex</span><span class="mq-2">%(mq2)s</span></div>
      <div class="marquee-sub">%(marquee_sub)s</div>
    </div>

    <div class="crt">
      <div class="crt-screen">
        <div class="duel-hud">
          <div class="duelist duelist--you">
            <span class="duelist-name">You</span>
            <span class="pips" id="pips-you"></span>
          </div>
          <div class="duel-center">
            <span class="dc-round" id="round-label">%(rounds_label)s</span>
            <span class="dc-best">Best <b id="best-chip-value">&mdash;</b></span>
          </div>
          <div class="duelist duelist--rival">
            <span class="pips" id="pips-rival"></span>
            <span class="duelist-name">Rival</span>
          </div>
        </div>

        <div class="credit-line"><span class="blink" id="score-credit">Free Play</span></div>
        <div class="challenge-banner" id="challenge-banner" hidden>
          <span class="cb-kicker">Challenge</span>
          <span class="cb-text" id="challenge-text"></span>
        </div>
%(lights)s
        <div class="test-stage state-idle" id="test-stage" role="button" tabindex="0" aria-live="polite" aria-label="Reaction time test area">
          <div class="stage-round-pill" id="stage-round-pill" aria-hidden="true">%(rounds_label)s</div>
          <button type="button" id="stage-cancel-btn" class="stage-cancel" aria-label="Cancel test">&#10005;</button>
          <div id="stage-content">
            <p class="stage-title">%(stage_title)s</p>
            <p class="stage-sub">%(stage_sub)s</p>
          </div>
        </div>
      </div>
      <div class="crt-glare" aria-hidden="true"></div>
    </div>

    <div class="deck deck--solo">
      <div class="deck-center" id="stage-controls">
        <button type="button" id="start-btn" class="start-btn"><span class="start-ring"></span><span class="start-text">Draw!</span></button>
        <div class="coin-door" aria-hidden="true"><span class="coin-slot"></span>Insert Coin &middot; Free Play</div>
      </div>
    </div>
%(switch)s
  </div>

  <section class="panel panel-narrow" id="results-panel" hidden>
    <h2>Your results</h2>
    <div class="rating-banner">
      <div class="grade-stamp" id="result-grade" aria-hidden="true"></div>
      <div class="rating-label" id="rating-label"></div>
      <div class="rating-note" id="rating-note"></div>
      <div class="rating-percentile" id="rating-percentile"></div>
    </div>
    <div class="challenge-verdict" id="challenge-verdict" hidden></div>

    <div class="dist-card" id="dist-card" hidden>
      <div class="chart-card-title">Where that lands in the published distribution</div>
      <div id="dist-chart"></div>
      <p class="dist-source">%(dist_blurb)s</p>
    </div>

    <div class="chart-card">
      <div class="chart-card-title">%(rounds_title)s</div>
      <div id="rounds-chart"></div>
    </div>

    <div class="results-grid">
      <div class="stat-tile highlight">
        <div class="stat-label">Average</div>
        <div class="stat-value" id="result-avg">&mdash;</div>
      </div>
      <div class="stat-tile">
        <div class="stat-label">Best round</div>
        <div class="stat-value" id="result-best">&mdash;</div>
      </div>
      <div class="stat-tile">
        <div class="stat-label">All-time best</div>
        <div class="stat-value" id="result-alltime-best">&mdash;</div>
      </div>%(false_alarm_tile)s
    </div>

    <table class="rounds-table visually-hidden">
      <caption class="visually-hidden">Exact time for each round</caption>
      <thead><tr><th>Round</th><th class="num">Time</th></tr></thead>
      <tbody id="rounds-tbody"></tbody>
    </table>

    <div class="btn-row">
      <button type="button" id="retry-btn" class="primary">Test again</button>
      <button type="button" id="copy-btn" class="icon-btn">Copy challenge link</button>
    </div>
    <p class="disclaimer">This is a fun, approximate browser-based test &mdash; not a scientific or medical instrument. Your measured time includes your device's screen refresh rate, input latency, and browser/OS rendering delay. The percentile above compares you against a model built from published research, all cited below &mdash; it is not a ranking against other people who have used this site, because no results are ever collected here.</p>
  </section>

  <section class="panel panel-narrow" id="history-panel">
    <h2>Your history</h2>
    <div id="history-empty" class="disclaimer" style="margin-top:0;">No sessions yet &mdash; run the test above to start tracking your history.</div>
    <div id="history-sparkline" class="sparkline-wrap" hidden></div>
    <table class="rounds-table" id="history-table" hidden>
      <thead><tr><th>Date</th><th class="num">Average</th></tr></thead>
      <tbody id="history-tbody"></tbody>
    </table>
  </section>

  <section class="container-narrow" style="padding-top:0;">
%(body)s
  </section>
</main>

<footer class="site-footer">
  <div class="footer-inner">
    <div>&copy; <span id="year"></span> reflexzap.com</div>
    <div class="footer-links">
      <a href="/reaction-time-percentiles/">Percentiles</a>
      <a href="/privacy.html">Privacy</a>
      <a href="/terms.html">Terms</a>
    </div>
  </div>
</footer>

<script src="/assets/js/nav.js?v=%(v)s"></script>
%(erabbit)s

<div class="announce" id="announce" aria-hidden="true"></div>
<div class="toast" id="toast">Copied!</div>
<div class="unlock-stack" id="unlock-stack" aria-live="polite"></div>

<script src="/assets/js/percentile.js?v=%(v)s"></script>
<script src="/assets/js/app.js?v=%(v)s"></script>
</body>
</html>
"""


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--check", action="store_true", help="exit 1 if any output is stale")
    args = ap.parse_args()

    stale = []
    for t in TESTS:
        rendered = render(t)
        targets = [ROOT / ("%s.html" % t["slug"]), ROOT / t["slug"] / "index.html"]
        for target in targets:
            existing = target.read_text(encoding="utf-8") if target.exists() else None
            html = rendered
            if existing:
                nav = NAV_RE.search(existing)
                if nav:
                    html = NAV_RE.sub(
                        lambda m, body=nav.group(2): m.group(1) + body + m.group(3),
                        rendered,
                        count=1,
                    )
            if args.check:
                if existing != html:
                    stale.append(target.relative_to(ROOT))
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            if existing != html:
                target.write_text(html, encoding="utf-8")
                print("wrote %s" % target.relative_to(ROOT))

    if args.check:
        if stale:
            for path in stale:
                print("stale: %s" % path, file=sys.stderr)
            print(
                "\nRun `python3 tools/build_tests.py` (then tools/sync_nav.py).",
                file=sys.stderr,
            )
            return 1
        print("all test pages up to date")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
