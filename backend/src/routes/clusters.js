const express = require("express");
const db = require("../db");

const router = express.Router();

// GET /clusters — label, article count, and time range for every cluster.
router.get("/", (req, res, next) => {
  try {
    const rows = db
      .prepare(
        `SELECT c.id, c.label,
                COUNT(ca.article_id)      AS article_count,
                MIN(a.published_at)       AS start_time,
                MAX(a.published_at)       AS end_time
         FROM clusters c
         JOIN cluster_articles ca ON ca.cluster_id = c.id
         JOIN articles a ON a.id = ca.article_id
         GROUP BY c.id
         ORDER BY end_time DESC`
      )
      .all();
    res.json({ clusters: rows });
  } catch (err) {
    next(err);
  }
});

// GET /clusters/:id — full detail, articles sorted chronologically.
router.get("/:id", (req, res, next) => {
  try {
    const cluster = db.prepare("SELECT id, label FROM clusters WHERE id = ?").get(req.params.id);
    if (!cluster) {
      return res.status(404).json({ error: "cluster not found" });
    }
    const articles = db
      .prepare(
        `SELECT a.id, a.source, a.title, a.summary, a.link, a.published_at
         FROM articles a
         JOIN cluster_articles ca ON ca.article_id = a.id
         WHERE ca.cluster_id = ?
         ORDER BY a.published_at ASC`
      )
      .all(req.params.id);
    res.json({ ...cluster, articles });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
