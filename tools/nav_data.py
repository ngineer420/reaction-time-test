"""reflexzap.com navigation data — the single source of truth for the toolbar.

This is the ONLY file that differs between sites. `sync_nav.py` is generic and
copies verbatim. Nothing here is computed at runtime by the browser: sync_nav
renders it into the static HTML of every page.

Tier rule (portfolio spec, ngineer420.github.io#13): a page is tier 1 only if it
answers a *different question*. reflexzap has no tier-2 family at all — the test
takes no parameters, so there are no "same tool, value baked in" landing pages
here and no hub/sibling-chip machinery is needed.

Home is the brand, per the spec, so index.html takes no rail chip and no slot in
the sheet's list. It is not absent from the chrome, though: the test is what a
reader of any of these pages came for, and the brand mark is a made-up word that
does not say so at phone widths (the "reaction time test" tagline is hidden below
640px). So it takes the sheet's hub row instead — the one slot the pattern
reserves for a destination that is not a peer of the list above it. That keeps
the rail a clean set of things to read, and it gives index.html an
`aria-current="page"` target, which it would otherwise lack on the site's most
important page.
"""

# Noun used in the menu trigger: "All 5 guides".
#
# Not "pages": the site has ten of those, so "All 5 pages" would be a false
# count. Not "articles" either — one of the five is a reference table with a
# cited distribution rather than a written piece. "Guides" is the honest scope
# for "the five things here that explain your score", which is what the whole
# set does.
NOUN = "guides"

# Tier-1 destinations, in rail order (the rail cap is 8; this site has 5).
#   label -> rail chip text, <= 18 chars
#   long  -> anchor text in the sheet
#   group -> sheet grouping key, unused at <= 8 destinations (the sheet renders
#            flat) but kept so the arrangement is already decided at the ninth
TOOLS = [
    # First, because it is the question a visitor has the second the test ends
    # — "is 250 ms good?" — and the only one of the five that answers it with a
    # number rather than an explanation.
    {"href": "/reaction-time-percentiles/",              "label": "Percentiles",     "long": "Reaction Time Percentiles",        "group": "score",  "tier": 1},
    {"href": "/articles/reaction-time-in-gaming.html",   "label": "Gaming",          "long": "Reaction Time in Gaming",          "group": "score",  "tier": 1},
    {"href": "/articles/what-affects-reaction-time.html", "label": "What Affects It", "long": "What Affects Your Reaction Time", "group": "score",  "tier": 1},
    {"href": "/articles/how-this-test-works.html",       "label": "How It Works",    "long": "How This Test Works",              "group": "method", "tier": 1},
    {"href": "/articles/history-of-reaction-time.html",  "label": "History",         "long": "History of Reaction Time",         "group": "method", "tier": 1},
]

# Sheet groups, in order. Unused at <= 8 destinations — the spec says group
# headings are noise at that size and the renderer emits a flat list.
GROUPS = [
    ("score",  "Your score"),
    ("method", "How it is measured"),
]

# The hub row: on this site it is the route back to the tool, not to a tier-2
# family (there isn't one). It renders below a rule at the foot of the sheet, so
# it reads as the call to action it is rather than as a sixth thing to read.
HUBS = [("/", "Take the reaction time test")]

# No footer tool list here today, and the spec says not to add one where none
# exists — the rail carries all five tier-1 destinations visibly.
FOOTER = []

# One-time --migrate: this site ships no <nav> element at all, so there is
# nothing to strip. The only op is dropping the marker pair in the one place the
# spec allows — a direct child of <body>, immediately after </header> and above
# <main>.
MIGRATE = [
    {"op": "insert_after", "region": "nav", "pattern": r"</header>", "indent": ""},
]
