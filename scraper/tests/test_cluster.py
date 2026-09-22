"""
Unit tests for cluster.py. Run with: pytest scraper/tests

Covers the two claims the README makes about clustering behaviour:
  - related headlines (shared significant words) end up in the same cluster
  - unrelated headlines that merely share a common/generic word do not
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from cluster import _keywords, cluster_articles  # noqa: E402


def _article(id_, title, summary=""):
    return {"id": id_, "title": title, "summary": summary}


def test_related_articles_cluster_together():
    articles = [
        _article("a1", "Senate passes election reform bill after long debate"),
        _article("a2", "House committee advances election reform bill to Senate"),
    ]
    clusters = cluster_articles(articles)
    assert len(clusters) == 1
    assert set(clusters[0]["article_ids"]) == {"a1", "a2"}


def test_unrelated_articles_with_one_shared_common_word_stay_separate():
    # Both mention "government" but share nothing else meaningful — should
    # NOT merge just because of one generic overlapping word.
    articles = [
        _article("a1", "Wildfire forces government evacuation order in coastal town"),
        _article("a2", "Local bakery wins government grant to expand storefront"),
    ]
    clusters = cluster_articles(articles)
    assert len(clusters) == 2


def test_singleton_articles_are_kept_not_dropped():
    articles = [_article("a1", "A completely unique one-off breaking story headline")]
    clusters = cluster_articles(articles)
    assert len(clusters) == 1
    assert clusters[0]["article_ids"] == ["a1"]


def test_stopwords_and_short_words_excluded_from_keywords():
    kws = _keywords("The and of it is a to for on at in", limit=12)
    assert kws == set()


def test_empty_article_text_produces_no_cluster():
    # An article whose title/summary is entirely stopwords contributes no
    # keywords and should be skipped rather than crashing or forming a junk
    # cluster.
    articles = [_article("a1", "The And Of It Is")]
    clusters = cluster_articles(articles)
    assert clusters == []
