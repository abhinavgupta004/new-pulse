"""
Groups articles into topic clusters using keyword overlap (Option A from the
brief) rather than TF-IDF. Rationale is in the README; short version: with a
few hundred articles per run, a threshold-based overlap on headline+summary
keywords is easy to reason about, easy to debug by eye, and good enough —
TF-IDF/embeddings would be the natural next step if volume or precision
requirements grew.
"""
import re
from collections import Counter
from uuid import uuid4

from config import CLUSTER_OVERLAP_THRESHOLD, KEYWORDS_PER_ARTICLE

# A small, hand-picked stopword list covering common English function words
# plus a few terms so generic in news headlines they're useless as signals
# ("says", "new", "report"). Kept inline (rather than an external corpus/NLTK
# download) so the scraper has no extra runtime dependency to fail on.
STOPWORDS = set(
    """
    a an the and or but if is are was were be been being to of in on for with
    as at by from into over under after before during than then so that this
    these those it its it's their his her they he she we you your our not no
    do does did doing have has had having will would can could should may
    might must shall about above across against along among around because
    between both each few further here how just like more most much own
    same some such too very while who whom which what when where why all any
    said say says new report reports according amid amid's news update
    """.split()
)

_WORD_RE = re.compile(r"[a-z0-9']+")


def _keywords(text: str, limit: int) -> set[str]:
    words = [w for w in _WORD_RE.findall(text.lower()) if w not in STOPWORDS and len(w) > 2]
    if not words:
        return set()
    # Most frequent unique words in this article's own text, capped at `limit`.
    counts = Counter(words)
    return {w for w, _ in counts.most_common(limit)}


def _label_for(article_texts: list[str]) -> str:
    counts = Counter()
    for text in article_texts:
        counts.update(_keywords(text, KEYWORDS_PER_ARTICLE))
    top = [w for w, _ in counts.most_common(3)]
    return " / ".join(w.capitalize() for w in top) if top else "Uncategorized"


def cluster_articles(articles: list[dict]) -> list[dict]:
    """
    Greedy single-pass clustering:
    for each article (oldest first), compare its keyword set against every
    existing cluster's *union* keyword set. Join the first cluster that
    shares >= CLUSTER_OVERLAP_THRESHOLD words; otherwise start a new one.

    This is O(n * clusters) rather than O(n^2) against every other article,
    which keeps a few hundred articles per run fast, at the cost of being
    order-sensitive (a known limitation, noted in the README).
    """
    clusters: list[dict] = []  # each: {id, keyword_union, article_ids, texts}

    for article in articles:
        text = f"{article['title']} {article.get('summary') or ''}"
        kws = _keywords(text, KEYWORDS_PER_ARTICLE)
        if not kws:
            continue

        best = None
        best_overlap = 0
        for c in clusters:
            overlap = len(kws & c["keyword_union"])
            if overlap > best_overlap:
                best, best_overlap = c, overlap

        if best is not None and best_overlap >= CLUSTER_OVERLAP_THRESHOLD:
            best["keyword_union"] |= kws
            best["article_ids"].append(article["id"])
            best["texts"].append(text)
        else:
            clusters.append(
                {
                    "id": str(uuid4()),
                    "keyword_union": kws,
                    "article_ids": [article["id"]],
                    "texts": [text],
                }
            )

    # Drop singleton clusters from the label-worthy output? No — a lone
    # breaking story is still a valid timeline entry, so we keep them, single
    # articles included.
    result = []
    for c in clusters:
        result.append(
            {
                "id": c["id"],
                "label": _label_for(c["texts"]),
                "article_ids": c["article_ids"],
            }
        )
    return result
