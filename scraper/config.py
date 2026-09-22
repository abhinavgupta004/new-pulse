"""
Central config for the News Pulse scraper.
Everything here can be overridden with environment variables so the same
code runs the same way locally and on a hosting platform's cron/scheduler.
"""
import os

# --- Feeds ----------------------------------------------------------------
# Three reputable, public RSS feeds. Each entry names the outlet explicitly
# because the field is used downstream for the "filter by source" UI feature.
FEEDS = [
    {"source": "BBC News", "url": "http://feeds.bbci.co.uk/news/rss.xml"},
    {"source": "NPR", "url": "https://feeds.npr.org/1001/rss.xml"},
    {"source": "Al Jazeera", "url": "https://www.aljazeera.com/xml/rss/all.xml"},
]

# --- Storage ----------------------------------------------------------------
DB_PATH = os.environ.get("SQLITE_PATH", os.path.join(os.path.dirname(__file__), "news_pulse.db"))

# --- Full-text extraction ---------------------------------------------------
# How many articles per run get a full-body fetch (politeness + free-tier
# runtime limits on hosted schedulers). Summaries are still stored for every
# article regardless of this cap.
MAX_FULL_TEXT_PER_RUN = int(os.environ.get("MAX_FULL_TEXT_PER_RUN", "40"))
FETCH_TIMEOUT_SECONDS = int(os.environ.get("FETCH_TIMEOUT_SECONDS", "10"))

# --- Clustering ---------------------------------------------------------
# Number of significant (non-stopword) terms two articles must share to be
# considered the same story. See README for how this was picked.
CLUSTER_OVERLAP_THRESHOLD = int(os.environ.get("CLUSTER_OVERLAP_THRESHOLD", "3"))

# How many of an article's top keywords are considered "significant" enough
# to compare against other articles.
KEYWORDS_PER_ARTICLE = int(os.environ.get("KEYWORDS_PER_ARTICLE", "12"))

# --- Retention ---------------------------------------------------------
# Articles older than this are pruned at the start of every run, before
# reclustering. Without this the articles table (and therefore the
# reclustering pass, which walks every stored article each run) grows
# forever and the timeline slowly fills with months-old stories instead of
# showing "what's active now".
ARTICLE_RETENTION_DAYS = int(os.environ.get("ARTICLE_RETENTION_DAYS", "14"))

# feedparser's default User-Agent gets blocked by a handful of CDNs; send an
# explicit one on every feed fetch (extract_article.py already does this for
# full-body requests).
USER_AGENT = "Mozilla/5.0 (compatible; NewsPulseBot/1.0; +https://example.com/bot)"
