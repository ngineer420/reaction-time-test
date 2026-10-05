#!/usr/bin/env python3
"""Structured data and the cross-property footer, in one place.

Two generators import this module: `build_tests.py`, which owns the six
generated test pages, and `build_seo.py`, which owns every hand-written page.
Both must emit the SAME cross-property footer and the SAME shape of JSON-LD, so
the strings live here once instead of twice.

WHY THE FAQ TEXT IS EXTRACTED, NOT RETYPED. `FAQPage` markup that does not
match the visible copy is a lie to the crawler and a manual action waiting to
happen. `extract_faq()` reads the questions and answers out of the rendered
HTML, so the schema cannot drift from the page. Nothing here invents copy.
"""

import html as htmllib
import json
import re

SITE = "https://reflexzap.com"

# ---------------------------------------------------------------------------
# Cross-property footer
# ---------------------------------------------------------------------------
# Three peers, not nineteen. A short, categorised list reads as a workshop index;
# the full portfolio in every footer reads as a link farm. The erabb.it mark is
# NOT in this list - it stays last in <body>, where it has always been.
PEERS = [
    ("https://flicktrainer.com", "Flick Trainer", "aim training"),
    ("https://cpsboost.com", "cpsboost", "click speed"),
    ("https://chimpmemory.com", "Chimp Memory", "memory tests"),
]

PEERS_START = "<!-- peers:start -->"
PEERS_END = "<!-- peers:end -->"
PEERS_RE = re.compile(
    re.escape(PEERS_START) + r".*?" + re.escape(PEERS_END), re.S
)

SEO_START = "<!-- seo:start -->"
SEO_END = "<!-- seo:end -->"
SEO_RE = re.compile(re.escape(SEO_START) + r".*?" + re.escape(SEO_END), re.S)


def peers_html(indent="  "):
    """The related-tools block that every page carries in its footer."""
    lines = [
        PEERS_START,
        '%s<div class="footer-peers">' % indent,
        '%s  <span class="fp-label">More free browser tools</span>' % indent,
        "%s  <ul>" % indent,
    ]
    for url, name, kind in PEERS:
        lines.append(
            '%s    <li><a href="%s" rel="noopener">%s <span class="fp-kind">%s</span></a></li>'
            % (indent, url, name, kind)
        )
    lines += ["%s  </ul>" % indent, "%s</div>" % indent, PEERS_END]
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# JSON-LD
# ---------------------------------------------------------------------------

def script(obj):
    """One <script type="application/ld+json"> block, pretty-printed."""
    body = json.dumps(obj, indent=2, ensure_ascii=False)
    return '<script type="application/ld+json">\n%s\n</script>' % body


def breadcrumb(name, url):
    """Home > this page. Two levels, because no middle page exists to link."""
    return {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Home", "item": SITE + "/"},
            {"@type": "ListItem", "position": 2, "name": name, "item": url},
        ],
    }


def faq_page(pairs):
    """A FAQPage built from (question, answer) pairs taken off the page itself."""
    return {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [
            {
                "@type": "Question",
                "name": q,
                "acceptedAnswer": {"@type": "Answer", "text": a},
            }
            for q, a in pairs
        ],
    }


def article(headline, description, url, published, modified):
    return {
        "@context": "https://schema.org",
        "@type": "Article",
        "headline": headline,
        "description": description,
        "datePublished": published,
        "dateModified": modified,
        "url": url,
        "publisher": {"@type": "Organization", "name": "reflexzap.com"},
        "author": {"@type": "Organization", "name": "reflexzap.com"},
    }


# ---------------------------------------------------------------------------
# Reading the page
# ---------------------------------------------------------------------------

# A block tag ends a run of text, so it becomes a space. An inline tag such as
# <strong> or <a> sits INSIDE a word or a phrase, so it becomes nothing - turning
# it into a space would put a gap in the schema text that the page does not have.
BLOCK_TAG_RE = re.compile(r"</?(?:p|div|br|li|ul|ol|h[1-6]|table|tr|td|th)\b[^>]*>", re.I)
TAG_RE = re.compile(r"<[^>]+>")
FAQ_ITEM_RE = re.compile(
    r'<div class="faq-item">\s*<h3>(?P<q>.*?)</h3>\s*(?P<a>.*?)\s*</div>', re.S
)
H1_RE = re.compile(r"<h1[^>]*>(.*?)</h1>", re.S)
CANONICAL_RE = re.compile(r'<link rel="canonical" href="([^"]+)"')
TITLE_RE = re.compile(r"<title>(.*?)</title>", re.S)
DESC_RE = re.compile(r'<meta name="description" content="([^"]*)"')


def text_of(fragment):
    """Visible text of an HTML fragment: tags out, entities resolved, one space."""
    plain = htmllib.unescape(TAG_RE.sub("", BLOCK_TAG_RE.sub(" ", fragment)))
    return re.sub(r"\s+", " ", plain.replace(" ", " ")).strip()


def extract_faq(page):
    """Every question and answer under the page's FAQ heading, in page order.

    Returns [] when the page has no FAQ heading. A `.faq-item` under a "Related"
    or "Read next" heading is a link card, NOT a question, so the search is
    bounded to the FAQ section and stops at the next <h2>.
    """
    start = re.search(r"<h2[^>]*>\s*Frequently asked questions\s*</h2>", page)
    if not start:
        return []
    rest = page[start.end():]
    stop = re.search(r"<h2", rest)
    section = rest[: stop.start()] if stop else rest
    return [
        (text_of(m.group("q")), text_of(m.group("a")))
        for m in FAQ_ITEM_RE.finditer(section)
    ]


def heading_of(page):
    """The page's <h1> as plain text, or None."""
    m = H1_RE.search(page)
    return text_of(m.group(1)) if m else None


def canonical_of(page):
    m = CANONICAL_RE.search(page)
    return m.group(1) if m else None
