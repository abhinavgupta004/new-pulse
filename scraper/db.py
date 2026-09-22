"""
Thin SQLite wrapper. SQLite is used because it is free, needs no server,
and is one of the databases the assessment explicitly allows. For a
production deploy where the backend and scraper run on different hosts, swap
this file's connection string for a hosted Postgres URL (see README) — the
schema below is intentionally plain SQL, not SQLite-specific syntax, so that
swap is small.
"""
import sqlite3
from contextlib import contextmanager

from config import DB_PATH

SCHEMA = """
CREATE TABLE IF NOT EXISTS articles (
    id            TEXT PRIMARY KEY,   -- sha1 of the canonical link, used for de-dup
    source        TEXT NOT NULL,
    title         TEXT NOT NULL,
    summary       TEXT,
    body          TEXT,               -- full extracted text, NULL if extraction failed/skipped
    link          TEXT NOT NULL,
    published_at  TEXT,               -- ISO 8601, UTC
    fetched_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS clusters (
    id         TEXT PRIMARY KEY,
    label      TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cluster_articles (
    cluster_id TEXT NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
    article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    PRIMARY KEY (cluster_id, article_id)
);

CREATE INDEX IF NOT EXISTS idx_articles_published_at ON articles(published_at);
"""


@contextmanager
def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    with get_conn() as conn:
        conn.executescript(SCHEMA)


def upsert_article(conn, article: dict) -> bool:
    """Insert an article if it's new. Returns True if it was newly inserted."""
    cur = conn.execute(
        "INSERT OR IGNORE INTO articles (id, source, title, summary, body, link, published_at, fetched_at) "
        "VALUES (:id, :source, :title, :summary, :body, :link, :published_at, :fetched_at)",
        article,
    )
    return cur.rowcount > 0


def update_body(conn, article_id: str, body: str):
    conn.execute("UPDATE articles SET body = ? WHERE id = ?", (body, article_id))


def articles_missing_body(conn, limit: int):
    rows = conn.execute(
        "SELECT id, link FROM articles WHERE body IS NULL ORDER BY published_at DESC LIMIT ?",
        (limit,),
    ).fetchall()
    return [dict(r) for r in rows]


def prune_old_articles(conn, retention_days: int) -> int:
    """Delete articles older than `retention_days`. Returns the number removed.

    Runs before reclustering so the timeline stays a rolling recent window
    instead of growing unbounded — every run otherwise reclusters *every*
    article ever fetched (see cluster_articles), which gets slower and
    increasingly stale-looking over time. cluster_articles/clusters rows for
    the deleted articles cascade automatically (ON DELETE CASCADE), and
    replace_clusters() rewrites the clusters table from scratch each run
    anyway.
    """
    cur = conn.execute(
        "DELETE FROM articles WHERE published_at < datetime('now', ?)",
        (f"-{retention_days} days",),
    )
    return cur.rowcount


def all_articles(conn):
    rows = conn.execute(
        "SELECT id, source, title, summary, body, link, published_at FROM articles "
        "WHERE published_at IS NOT NULL ORDER BY published_at ASC"
    ).fetchall()
    return [dict(r) for r in rows]


def replace_clusters(conn, clusters: list, now_iso: str):
    """Full reclustering each run keeps the logic simple (see README limitations).
    We drop and rewrite the cluster tables; the articles table itself is untouched."""
    conn.execute("DELETE FROM cluster_articles")
    conn.execute("DELETE FROM clusters")
    for c in clusters:
        conn.execute(
            "INSERT INTO clusters (id, label, updated_at) VALUES (?, ?, ?)",
            (c["id"], c["label"], now_iso),
        )
        conn.executemany(
            "INSERT INTO cluster_articles (cluster_id, article_id) VALUES (?, ?)",
            [(c["id"], aid) for aid in c["article_ids"]],
        )
