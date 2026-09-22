"""
Unit tests for fetch_rss.py's date handling — this is the part of the
scraper most exposed to malformed/inconsistent feed data. Run with:
pytest scraper/tests
"""
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fetch_rss import _extract_published, _is_plausible  # noqa: E402


class FakeEntry(dict):
    """feedparser entries support both attribute and dict access; a dict
    with .get() is enough for _extract_published's needs."""


def test_plausible_recent_date_is_accepted():
    now = datetime.now(timezone.utc)
    assert _is_plausible(now - timedelta(hours=2))


def test_implausible_future_date_is_rejected():
    now = datetime.now(timezone.utc)
    assert not _is_plausible(now + timedelta(days=10))


def test_implausible_old_date_is_rejected():
    now = datetime.now(timezone.utc)
    assert not _is_plausible(now - timedelta(days=365))


def test_published_parsed_used_when_plausible():
    now = datetime.now(timezone.utc)
    struct = now.timetuple()
    entry = FakeEntry(published_parsed=struct)
    iso, guessed = _extract_published(entry)
    assert guessed is False
    assert iso.startswith(str(now.year))


def test_falls_back_to_now_when_no_date_fields_present():
    # No published_parsed/updated_parsed/published/updated/pubDate at all —
    # must not raise, and must flag the value as guessed.
    entry = FakeEntry()
    iso, guessed = _extract_published(entry)
    assert guessed is True
    parsed = datetime.fromisoformat(iso)
    assert _is_plausible(parsed)


def test_implausible_parsed_date_falls_through_to_guess():
    # A wildly-wrong but "successfully" parsed date (e.g. dateutil fuzzy
    # matching garbage) must not be trusted — should fall back to "now".
    bogus = (datetime.now(timezone.utc) - timedelta(days=9999)).timetuple()
    entry = FakeEntry(published_parsed=bogus)
    iso, guessed = _extract_published(entry)
    assert guessed is True
