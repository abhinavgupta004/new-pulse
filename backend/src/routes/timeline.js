const express = require("express");
const db = require("../db");

const router = express.Router();

// GET /timeline — shaped for a charting/timeline library: explicit start and
// end timestamps per cluster (not a flat article list), a count, and an
// `intensity` (0-1, article_count normalized against the busiest cluster in
// this result set) so the frontend can size/shade markers without having to
// recompute the max itself on every render.
router.get("/", (req, res, next) => {
  try {
    const rows = db
      .prepare(
        `SELECT c.id, c.label,
                COUNT(ca.article_id) AS article_count,
                MIN(a.published_at)  AS start_time,
                MAX(a.published_at)  AS end_time,
                GROUP_CONCAT(DISTINCT a.source) AS sources
         FROM clusters c
         JOIN cluster_articles ca ON ca.cluster_id = c.id
         JOIN articles a ON a.id = ca.article_id
         GROUP BY c.id
         ORDER BY start_time ASC`
      )
      .all();

    const maxCount = rows.reduce((m, r) => Math.max(m, r.article_count), 1);

    const timeline = rows.map((r) => ({
      id: r.id,
      label: r.label,
      article_count: r.article_count,
      start_time: r.start_time,
      end_time: r.end_time,
      sources: r.sources ? r.sources.split(",") : [],
      intensity: Number((r.article_count / maxCount).toFixed(3)),
    }));

    res.json({ timeline });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
