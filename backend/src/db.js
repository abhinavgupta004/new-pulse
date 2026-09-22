const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const dbPath = path.resolve(__dirname, "..", process.env.SQLITE_PATH || "../scraper/news_pulse.db");

const db = new DatabaseSync(dbPath);
db.exec("PRAGMA journal_mode = WAL;");
// Match sqlite3's default busy behaviour on the Python side: wait instead of
// failing immediately if the scraper process holds a write lock at the same
// moment the API tries to read.
db.exec("PRAGMA busy_timeout = 5000;");

// `articles` and `clusters` are owned by scraper/db.py (that's the process
// that actually writes them) — these CREATE TABLE IF NOT EXISTS statements
// exist only so the API doesn't crash on a totally fresh checkout before the
// scraper has ever run once. Keep this schema in sync with scraper/db.py's
// SCHEMA constant if either changes; `ingest_jobs` is backend-only and has
// no Python-side equivalent.
db.exec(`
  CREATE TABLE IF NOT EXISTS articles (
    id            TEXT PRIMARY KEY,
    source        TEXT NOT NULL,
    title         TEXT NOT NULL,
    summary       TEXT,
    body          TEXT,
    link          TEXT NOT NULL,
    published_at  TEXT,
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

  CREATE TABLE IF NOT EXISTS ingest_jobs (
    id          TEXT PRIMARY KEY,
    status      TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    finished_at TEXT,
    result      TEXT
  );
`);

module.exports = db;
