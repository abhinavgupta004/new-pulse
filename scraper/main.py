"""
Entrypoint: fetch feeds -> dedupe/store -> extract full text for a batch of
articles that don't have it yet -> recluster everything -> report a summary.

Designed to be re-run on a schedule (cron, GitHub Actions, or triggered
on-demand by the Node API's POST /ingest/trigger) without reprocessing
articles it has already seen. Prints a single JSON summary line at the end
so a caller (like the Node backend) can capture and parse stdout.
"""
import json
import sys
from datetime import datetime, timezone

from cluster import cluster_articles
from config import ARTICLE_RETENTION_DAYS, MAX_FULL_TEXT_PER_RUN
from db import (
    all_articles,
    articles_missing_body,
    get_conn,
    init_db,
    prune_old_articles,
    replace_clusters,
    update_body,
    upsert_article,
)
from extract_article import extract_body
from fetch_rss import fetch_all


def run() -> dict:
    init_db()
    summary = {"new_articles": 0, "bodies_extracted": 0, "bodies_failed": 0, "clusters": 0, "pruned": 0}

    fetched = fetch_all()
    with get_conn() as conn:
        for article in fetched:
            article.pop("published_guessed", None)  # not a stored column, just a run-time flag
            if upsert_article(conn, article):
                summary["new_articles"] += 1

        summary["pruned"] = prune_old_articles(conn, ARTICLE_RETENTION_DAYS)

        # Only backfill full bodies for a capped batch per run — keeps each
        # run fast and polite to source sites, especially on a free-tier
        # scheduler with a runtime limit.
        pending = articles_missing_body(conn, MAX_FULL_TEXT_PER_RUN)
        for row in pending:
            body = extract_body(row["link"])
            if body:
                update_body(conn, row["id"], body)
                summary["bodies_extracted"] += 1
            else:
                summary["bodies_failed"] += 1

        articles = all_articles(conn)
        clusters = cluster_articles(articles)
        replace_clusters(conn, clusters, datetime.now(timezone.utc).isoformat())
        summary["clusters"] = len(clusters)
        summary["total_articles"] = len(articles)

    return summary


if __name__ == "__main__":
    try:
        result = run()
        print(json.dumps({"status": "ok", **result}))
    except Exception as exc:  # noqa: BLE001 - surface any crash as a clean JSON error for the caller
        print(json.dumps({"status": "error", "message": str(exc)}))
        sys.exit(1)
