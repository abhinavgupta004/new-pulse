# News Pulse — Topic-Clustered News Timeline

A small system that pulls live articles from public news RSS feeds, groups related
articles into topic clusters, and shows those clusters on a timeline.

```
/scraper   Python — RSS ingestion, full-text extraction, keyword clustering
/backend   Node.js/Express — REST API over a shared SQLite database
/frontend  Next.js/React — timeline visualization and cluster explorer
```

## How it works

1. **`scraper/main.py`** pulls three RSS feeds (BBC News, NPR, Al Jazeera — see
   `scraper/config.py`), normalizes each entry into one schema, fetches full article
   bodies for a capped batch of new articles, then re-clusters every stored article by
   topic and writes the result to SQLite.
2. **The Node API** reads that same SQLite file and serves `/clusters`, `/clusters/:id`,
   and `/timeline`. `POST /ingest/trigger` runs the Python pipeline as a subprocess and
   returns a job ID; `GET /ingest/status/:jobId` reports progress.
3. **The Next.js frontend** renders the clusters as a custom SVG timeline (each cluster
   is a bar spanning its earliest→latest article, sized/shaded by article count),
   lets you filter by source, click a cluster to see its articles, and trigger +
   poll a refresh.

## Decisions worth knowing about

- **Clustering approach — keyword overlap, not TF-IDF.** With a few hundred articles per
  run, comparing each article's top keywords (title + summary, stopwords stripped)
  against existing clusters and joining when overlap ≥ 3 shared words (`CLUSTER_OVERLAP_THRESHOLD`
  in `scraper/config.py`) is simple to reason about and debug by eye, and produced coherent
  clusters in testing (see `scraper/cluster.py`'s docstring). TF-IDF/embeddings would be
  the natural upgrade if volume or precision needs grew — it's a drop-in replacement for
  `cluster_articles()` since the rest of the pipeline only cares about the
  `{id, label, article_ids}` shape it returns.
- **Threshold picked by trial, not a formula.** 3 shared significant words reliably
  separated the synthetic test cases (two election-reform headlines clustered; an
  unrelated wildfire and bakery story stayed separate) without over-merging distinct
  stories that happen to share one common word like "government" or "police."
- **One known limitation:** clustering is a single greedy pass in start-time order, so
  it's order-sensitive — an article that would bridge two topics can lock in with
  whichever one it's compared against first, occasionally leaving two clusters
  that a human would merge. A second "merge overlapping clusters" pass would fix this
  and is a natural next step.
- **SQLite, shared by file path**, not a network database — it's free, needs no
  provisioning, and is one of the datastores the brief explicitly allows. The schema in
  `scraper/db.py` is plain SQL, so swapping in a hosted Postgres URL later only touches
  the connection string in the scraper and `backend/src/db.js`, not the queries.
- **Full-text extraction is capped per run** (`MAX_FULL_TEXT_PER_RUN`, default 40) —
  intentional, to keep each run fast and polite to source sites, especially inside a
  free-tier scheduler's time limit. Every article still gets its RSS summary regardless.

## Running locally

**Scraper**
```bash
cd scraper
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python3 main.py
```
This creates `scraper/news_pulse.db`. Re-run it any time — it only processes new
articles and fully rebuilds clusters over everything stored so far.

**Backend**
```bash
cd backend
cp .env.example .env   # adjust SQLITE_PATH if you moved the db
npm install
npm run dev             # http://localhost:4000
```

**Frontend**
```bash
cd frontend
cp .env.local.example .env.local
npm install
npm run dev             # http://localhost:3000
```

Open `http://localhost:3000`, then click **Refresh data** to trigger the scraper from
the UI (it calls the same `POST /ingest/trigger` endpoint used in production).

## Deployment (free tiers)

| Component      | Suggested platform         | Notes |
|-----------------|-----------------------------|-------|
| Frontend        | Vercel                      | Set `NEXT_PUBLIC_API_URL` to the deployed backend URL. |
| Backend API     | Render (free web service)   | Set `SQLITE_PATH`, `CORS_ORIGIN` (your Vercel URL), `PYTHON_BIN=python3`. **Correction:** Render's persistent disk add-on is a paid-plan feature, not available on the free instance type — a free web service's filesystem is ephemeral and is wiped on every restart/spin-down (free services also spin down after 15 min idle). So a local SQLite file will *not* survive on a free Render service. Use a hosted SQLite service like [Turso](https://turso.tech) (free tier) instead of a local file, or move to Render's free Postgres instance. |
| Python pipeline | Runs on the same Render service as the backend (simplest — the API just needs `python3` and `pip install -r scraper/requirements.txt` in the build step). Avoid a separate Render service/cron job for this unless the database is already hosted (Turso/Postgres) — two separate free Render services do **not** share a filesystem, so a local SQLite file written by one is invisible to the other. |
| Database        | Turso (free tier) — works across services with no shared-disk assumption, and is what makes the "separate scraper job" deployment option above viable. A same-service deploy with SQLite on a *paid* Render disk also works, if the free tier isn't a constraint. |

**Safety net against concurrent runs:** `POST /ingest/trigger` now checks for an already-running job first and returns `409` with the existing `jobId` instead of spawning a second subprocess — two scraper runs writing to the same SQLite file at once could otherwise race during the clusters-table rewrite. The frontend's refresh button transparently attaches to the existing job in that case.

**Retention:** the scraper prunes articles older than `ARTICLE_RETENTION_DAYS` (default 14) at the start of every run, before reclustering — otherwise the articles table (and the full reclustering pass over it) grows unbounded across repeated runs.

Environment variables are set in each platform's dashboard — nothing is committed to
the repo. See each package's `.env.example` for the full list.

**Cold starts:** Render's free tier spins down an idle service; the first request after
idling can take ~30–50 seconds. That's expected and fine for review purposes.

## Sources used

BBC News, NPR, Al Jazeera — all public RSS feeds, configured in `scraper/config.py`.

## What I'd improve with more time

- A second clustering pass that merges clusters whose keyword sets overlap enough after
  the first greedy pass, to fix the order-sensitivity limitation above.
- Cross-source story merging (the brief's stretch goal) — same real-world event covered
  by two outlets currently stays as two clusters.
- Auto-refresh polling on the frontend instead of manual-only refresh.
- A single shared schema definition instead of the current duplication between
  `scraper/db.py` (source of truth) and `backend/src/db.js` (defensive fallback for a
  fresh checkout before the scraper's first run) — fine at this size, but would drift if
  the project grew.
- Auth/rate-limiting on `POST /ingest/trigger` — currently open, protected only by the
  single-in-flight-job guard described above.

## Testing

`scraper/tests/` has unit tests for the two most failure-prone parts of the pipeline —
keyword-overlap clustering (`test_cluster.py`) and RSS date normalization/plausibility
(`test_fetch_rss.py`). Run with:
```bash
cd scraper
pip install -r requirements.txt
pytest tests
```
