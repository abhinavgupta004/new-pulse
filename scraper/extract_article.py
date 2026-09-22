"""
Fetches the full article page and pulls out the main body text.

trafilatura is tried first (it's built for exactly this and handles a wide
range of site layouts and boilerplate removal). If it comes back empty
(paywall, JS-rendered page, anti-bot block) we fall back to a plain
BeautifulSoup paragraph-join. If both fail, we return None rather than
raising — one unparseable page should never crash the whole run.
"""
import requests
import trafilatura
from bs4 import BeautifulSoup

from config import FETCH_TIMEOUT_SECONDS

HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; NewsPulseBot/1.0; +https://example.com/bot)"}


def _bs4_fallback(html: str) -> str | None:
    try:
        soup = BeautifulSoup(html, "html.parser")
        paragraphs = [p.get_text(" ", strip=True) for p in soup.find_all("p")]
        text = "\n".join(p for p in paragraphs if len(p) > 40)  # drop nav/caption noise
        return text or None
    except Exception:  # noqa: BLE001
        return None


def extract_body(url: str) -> str | None:
    try:
        downloaded = trafilatura.fetch_url(url)
        if downloaded:
            text = trafilatura.extract(downloaded, include_comments=False, include_tables=False)
            if text and len(text) > 200:
                return text
            # trafilatura ran but got too little — try the raw HTML with bs4
            fallback = _bs4_fallback(downloaded)
            if fallback:
                return fallback
    except Exception as exc:  # noqa: BLE001
        print(f"[extract_article] trafilatura failed for {url}: {exc!r}")

    # trafilatura's own fetch can fail on sites that need specific headers;
    # try a manual request + bs4 as a last resort.
    try:
        resp = requests.get(url, headers=HEADERS, timeout=FETCH_TIMEOUT_SECONDS)
        resp.raise_for_status()
        return _bs4_fallback(resp.text)
    except Exception as exc:  # noqa: BLE001
        print(f"[extract_article] full fetch failed for {url}: {exc!r}")
        return None
