#!/usr/bin/env python3
"""Write the structured data and the cross-property footer into hand-written pages.

    python3 tools/build_seo.py            # rewrite every hand-written page
    python3 tools/build_seo.py --check    # exit 1 if any page is stale

WHY THIS EXISTS. Six of this site's pages come out of tools/build_tests.py and
carry their JSON-LD from its template. The other twelve are hand-written, and
hand-written structured data drifts: a question gets reworded on the page and
the FAQPage block keeps the old text, which is a lie to the crawler.

This script owns two regions of every page it touches and nothing else:

    <!-- seo:start -->  ... </head>      JSON-LD, plus the Open Graph tags
    <!-- seo:end -->                     the articles were missing

    <!-- peers:start --> ... </footer>   the related-tools block
    <!-- peers:end -->

Everything inside those markers is output. Everything outside them is yours.
The FAQ questions and answers are READ OFF the page, never retyped here, so the
schema cannot disagree with the copy a visitor sees.

Run order: build_tests.py, then sync_nav.py, then this, then build_sitemap.py.
The sitemap reads the modification times the rest of us leave behind.
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import seo  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent

# The six files tools/build_tests.py writes. This script must never touch them,
# or the two generators would overwrite each other on every run.
GENERATED = {
    "audio-reaction-time-test.html",
    "audio-reaction-time-test/index.html",
    "choice-reaction-time-test.html",
    "choice-reaction-time-test/index.html",
    "f1-reaction-test.html",
    "f1-reaction-test/index.html",
}

# datePublished and dateModified are the article's first and latest commit dates,
# read once from git history and pinned here. They are pinned rather than
# recomputed because a rebase moves a commit date and a published date must not
# move with it.
ARTICLES = {
    "articles/history-of-reaction-time.html": ("2026-07-12", "2026-08-26"),
    "articles/how-this-test-works.html": ("2026-07-12", "2026-08-26"),
    "articles/reaction-time-in-gaming.html": ("2026-07-12", "2026-08-26"),
    "articles/what-affects-reaction-time.html": ("2026-07-12", "2026-08-26"),
}

# Pages that get no BreadcrumbList. The home page is the root of the trail, and
# 404.html is not a destination - it has no canonical URL to point a crumb at.
NO_BREADCRUMB = {"index.html", "404.html"}


def pages():
    for path in sorted(ROOT.rglob("*.html")):
        rel = path.relative_to(ROOT).as_posix()
        if rel.startswith(".") or "/.git/" in rel or rel in GENERATED:
            continue
        yield rel, path


def head_block(rel, page):
    """The JSON-LD and Open Graph lines this page should carry."""
    parts = []
    url = seo.canonical_of(page)
    heading = seo.heading_of(page)

    if rel in ARTICLES:
        published, modified = ARTICLES[rel]
        # Both of these come out of the page already escaped for an attribute,
        # so they go into the meta tags exactly as they are. text_of() unescapes
        # them for the JSON-LD, where JSON quoting is the only escaping wanted.
        title = seo.TITLE_RE.search(page).group(1).strip()
        desc = seo.DESC_RE.search(page).group(1)
        # The four Open Graph tags these pages never had. og:image and the
        # twitter:* tags are already in the hand-written head above.
        parts.append(
            "\n".join(
                [
                    '<meta property="og:type" content="article">',
                    '<meta property="og:title" content="%s">' % title,
                    '<meta property="og:description" content="%s">' % desc,
                    '<meta property="og:url" content="%s">' % url,
                ]
            )
        )
        parts.append(
            seo.script(
                seo.article(heading, seo.text_of(desc), url, published, modified)
            )
        )

    faq = seo.extract_faq(page)
    if faq:
        parts.append(seo.script(seo.faq_page(faq)))

    if rel not in NO_BREADCRUMB and url and heading:
        parts.append(seo.script(seo.breadcrumb(heading, url)))

    if not parts:
        return None
    return "\n".join([seo.SEO_START] + parts + [seo.SEO_END])


def render(rel, page):
    block = head_block(rel, page)

    if block and seo.SEO_RE.search(page):
        page = seo.SEO_RE.sub(lambda m: block, page, count=1)
    elif block:
        page = page.replace("</head>", block + "\n</head>", 1)

    peers = seo.peers_html()
    if seo.PEERS_RE.search(page):
        page = seo.PEERS_RE.sub(lambda m: peers, page, count=1)
    elif "</footer>" in page:
        page = page.replace("</footer>", peers + "\n</footer>", 1)

    return page


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--check", action="store_true", help="exit 1 if any page is stale")
    args = ap.parse_args()

    stale = []
    for rel, path in pages():
        current = path.read_text(encoding="utf-8")
        wanted = render(rel, current)
        if wanted == current:
            continue
        if args.check:
            stale.append(rel)
            continue
        path.write_text(wanted, encoding="utf-8")
        print("wrote %s" % rel)

    if args.check:
        if stale:
            for rel in stale:
                print("stale: %s" % rel, file=sys.stderr)
            print("\nRun `python3 tools/build_seo.py`.", file=sys.stderr)
            return 1
        print("all hand-written pages up to date")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
