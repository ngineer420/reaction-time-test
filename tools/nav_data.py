"""reflexzap.com navigation data — the single source of truth for the toolbar.

This is the ONLY file that differs between sites. `sync_nav.py` is generic and
copies verbatim. Nothing here is computed at runtime by the browser: sync_nav
renders it into the static HTML of every page.

Tier rule (portfolio spec, ngineer420.github.io#13): a page is tier 1 only if it
answers a *different question*. reflexzap has no tier-2 family: the four tests
measure four different stimuli against four different published distributions —
a tone is not a green box with a parameter changed — and the five guides each
answer something the others do not. So every destination here is tier 1.

Home used to take the sheet's hub row rather than a rail chip, on the grounds
that it was the brand and not a peer of the list. That reasoning expired the day
the site gained three more tests: index.html is now one of four siblings, and
leaving it as the only test without a chip would have been the odd one out in
its own group. It takes the first chip, which also gives it the
`aria-current="page"` target the hub row was there to provide, so HUBS is empty.

Nine tier-1 destinations against a rail capped at 8. That is deliberate, not an
oversight: the renderer puts the first eight in the rail and every one of the
nine in the sheet, so the order below is what decides which single destination
is sheet-only. History is last because it is the one page nobody arrives
mid-session wanting. Nine is also what turns the sheet's group headings on —
below nine the renderer emits one flat list, which is why the "tests" group
would have been invisible had the count landed on eight.
"""

# Noun used in the menu trigger: "All 9 tests & guides".
#
# It was "guides" while every destination was something to read. It cannot stay
# that now that four of the nine are the tests themselves, and it cannot become
# "tests" for the same reason in reverse. Not "pages" either: the site has
# sixteen of those, so any count attached to it would be false. The set is
# genuinely two kinds of thing, so the noun says two kinds of thing.
NOUN = "tests & guides"

# Tier-1 destinations, in rail order (the rail cap is 8; this site has 5).
#   label -> rail chip text, <= 18 chars
#   long  -> anchor text in the sheet
#   group -> sheet grouping key, unused at <= 8 destinations (the sheet renders
#            flat) but kept so the arrangement is already decided at the ninth
TOOLS = [
    # The four tests, in the order they were built. Each measures a different
    # stimulus against its own cited distribution.
    {"href": "/",                                 "label": "Visual",    "long": "Visual Reaction Time Test",    "group": "tests",  "tier": 1},
    {"href": "/audio-reaction-time-test/",        "label": "Audio",     "long": "Audio Reaction Time Test",     "group": "tests",  "tier": 1},
    {"href": "/choice-reaction-time-test/",       "label": "Go / No-Go", "long": "Go / No-Go Reaction Test",    "group": "tests",  "tier": 1},
    {"href": "/f1-reaction-test/",                "label": "F1 Lights", "long": "F1 Lights-Out Reaction Test",  "group": "tests",  "tier": 1},
    # First of the guides, because it is the question a visitor has the second
    # a test ends — "is 250 ms good?" — and the only one that answers it with a
    # number rather than an explanation.
    {"href": "/reaction-time-percentiles/",              "label": "Percentiles",     "long": "Reaction Time Percentiles",        "group": "score",  "tier": 1},
    {"href": "/articles/reaction-time-in-gaming.html",   "label": "Gaming",          "long": "Reaction Time in Gaming",          "group": "score",  "tier": 1},
    {"href": "/articles/what-affects-reaction-time.html", "label": "What Affects It", "long": "What Affects Your Reaction Time", "group": "score",  "tier": 1},
    {"href": "/articles/how-this-test-works.html",       "label": "How It Works",    "long": "How This Test Works",              "group": "method", "tier": 1},
    # Sheet-only: nine destinations against a rail of eight, and this is the
    # one nobody arrives mid-session wanting.
    {"href": "/articles/history-of-reaction-time.html",  "label": "History",         "long": "History of Reaction Time",         "group": "method", "tier": 1},
]

# Sheet groups, in order. Live from the ninth destination onwards, which this
# site now has — below that the renderer emits one flat list because group
# headings are noise at that size.
GROUPS = [
    ("tests",  "Tests"),
    ("score",  "Your score"),
    ("method", "How it is measured"),
]

# No hub row. It existed only to give index.html a place in the chrome; the
# Visual chip in the "Tests" group is that place now, and a hub row pointing at
# a destination already listed above it would carry aria-current twice.
HUBS = []

# No footer tool list here today, and the spec says not to add one where none
# exists — the rail carries eight of the nine visibly and the sheet carries all
# nine, which is the crawl path.
FOOTER = []

# One-time --migrate: this site ships no <nav> element at all, so there is
# nothing to strip. The only op is dropping the marker pair in the one place the
# spec allows — a direct child of <body>, immediately after </header> and above
# <main>.
MIGRATE = [
    {"op": "insert_after", "region": "nav", "pattern": r"</header>", "indent": ""},
]
