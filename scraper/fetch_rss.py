"""
Pulls entries from each configured RSS feed and normalizes them into one
internal schema, regardless of how each outlet structures its feed.

Feed inconsistencies handled here:
  - content:encoded vs description vs summary  -> normalized into `summary`
  - missing / malformed pubDate                -> falls back to "now" (UTC),
                                                    flagged via `published_guessed`
  - inconsistent date formats                  -> feedparser already parses most
                                                    RSS/Atom date formats into a
                                                    struct_time; we defend against
                                                    the cases it can't with dateutil
  - relative or missing links                  -> skipped (can't dedupe reliably)
"""
import hashlib
from datetime import datetime, timedelta, timezone

import feedparser
from dateutil import parser as dateparser

from config import FEEDS, USER_AGENT

# A parsed date outside this window is treated as a parsing failure rather
# than trusted. This matters because dateutil's parser is deliberately
# lenient/fuzzy — a malformed or unexpected field (some feeds put odd text in
# a date field) can "successfully" parse into a wildly wrong date instead of
# raising an error. A single such article can otherwise silently stretch the
# whole timeline's time scale across months and push every real, current
# article off the visible chart.
#
# The window is intentionally tight (weeks, not years): RSS feeds only ever
# carry recently published items, so anything claiming to be from months ago
# or from the future is far more likely to be a parsing artifact than a
# genuinely old story being republished.
_MAX_PAST = timedelta(days=30)
_MAX_FUTURE = timedelta(days=1)


def _is_plausible(dt: datetime) -> bool:
    now = datetime.now(timezone.utc)
    return (now - _MAX_PAST) <= dt <= (now + _MAX_FUTURE)


def _canonical_id(link: str) -> str:
    return hashlib.sha1(link.strip().encode("utf-8")).hexdigest()


def _extract_summary(entry) -> str:
    # Different feeds put the body in different fields. Prefer the fullest one.
    if "content" in entry and entry.content:
        return entry.content[0].get("value", "").strip()
    for field in ("summary", "description"):
        if entry.get(field):
            return entry.get(field).strip()
    return ""


def _extract_published(entry) -> tuple[str, bool]:
    """Returns (iso_string_utc, was_guessed)."""
    # feedparser normalizes most valid dates into *_parsed (a time.struct_time).
    for field in ("published_parsed", "updated_parsed"):
        if entry.get(field):
            dt = datetime(*entry[field][:6], tzinfo=timezone.utc)
            if _is_plausible(dt):
                return dt.isoformat(), False
            # Implausible even though feedparser "successfully" parsed it —
            # fall through and try the other fields/fallbacks instead of
            # trusting it.

    # Fall back to raw string fields with a looser parser for anything
    # feedparser couldn't normalize itself.
    for field in ("published", "updated", "pubDate"):
        raw = entry.get(field)
        if raw:
            try:
                dt = dateparser.parse(raw)
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                dt = dt.astimezone(timezone.utc)
                if not _is_plausible(dt):
                    continue  # e.g. dateutil fuzzy-matched garbage into some unrelated date
                return dt.isoformat(), False
            except (ValueError, OverflowError):
                continue

    # No usable date anywhere in the entry — better to timestamp it "now"
    # than to drop it or crash the run.
    return datetime.now(timezone.utc).isoformat(), True


def fetch_all() -> list[dict]:
    """Fetch every configured feed and return normalized article dicts.
    A single feed failing (network error, malformed XML) never aborts the run —
    it's logged and skipped."""
    normalized = []
    for feed in FEEDS:
        try:
            # Explicit UA — a few outlets' CDNs 403 feedparser's default
            # ("python-feedparser/x.y") user agent string.
            parsed = feedparser.parse(feed["url"], request_headers={"User-Agent": USER_AGENT})
            if parsed.bozo and not parsed.entries:
                print(f"[fetch_rss] '{feed['source']}' failed to parse: {parsed.bozo_exception}")
                continue
        except Exception as exc:  # noqa: BLE001 - any single feed failure must not kill the run
            print(f"[fetch_rss] '{feed['source']}' raised {exc!r}, skipping")
            continue

        for entry in parsed.entries:
            link = entry.get("link")
            title = entry.get("title")
            if not link or not title:
                continue  # can't dedupe or display without these

            published_at, guessed = _extract_published(entry)
            normalized.append(
                {
                    "id": _canonical_id(link),
                    "source": feed["source"],
                    "title": title.strip(),
                    "summary": _extract_summary(entry),
                    "body": None,  # filled in later by extract_article.py
                    "link": link,
                    "published_at": published_at,
                    "published_guessed": guessed,
                    "fetched_at": datetime.now(timezone.utc).isoformat(),
                }
            )
        print(f"[fetch_rss] '{feed['source']}': {len(parsed.entries)} entries")
    return normalized
