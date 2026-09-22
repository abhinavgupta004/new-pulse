const express = require("express");
const { v4: uuidv4 } = require("uuid");
const path = require("path");
const { spawn } = require("child_process");
const db = require("../db");

const router = express.Router();

const PYTHON_BIN_RAW = process.env.PYTHON_BIN || "python3";
// If PYTHON_BIN looks like a path (e.g. pointing at a venv's own interpreter
// so the subprocess actually has the scraper's installed packages available,
// rather than whatever "python3"/"py" resolves to globally), resolve it
// relative to this backend package's root (two levels up from src/routes/)
// the same way SCRAPER_CWD is resolved below. A bare command name (no
// slash) is left as-is and resolved via PATH.
const PYTHON_BIN = /[/\\]/.test(PYTHON_BIN_RAW)
  ? path.resolve(__dirname, "..", "..", PYTHON_BIN_RAW)
  : PYTHON_BIN_RAW;
const SCRAPER_ENTRYPOINT = process.env.SCRAPER_ENTRYPOINT || "../scraper/main.py";
const SCRAPER_CWD = path.resolve(__dirname, "..", "..", process.env.SCRAPER_CWD || "../scraper");

function runJob(jobId) {
  const entrypoint = path.resolve(__dirname, "..", "..", SCRAPER_ENTRYPOINT);
  const child = spawn(PYTHON_BIN, [entrypoint], { cwd: SCRAPER_CWD });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => (stdout += chunk));
  child.stderr.on("data", (chunk) => (stderr += chunk));

  child.on("close", (code) => {
    const finishedAt = new Date().toISOString();
    let result;
    if (code === 0) {
      // main.py prints exactly one JSON line as its last line of stdout.
      try {
        const lastLine = stdout.trim().split("\n").pop();
        result = JSON.parse(lastLine);
      } catch {
        result = { status: "ok", raw_stdout: stdout.slice(-2000) };
      }
      db.prepare("UPDATE ingest_jobs SET status = 'completed', finished_at = ?, result = ? WHERE id = ?").run(
        finishedAt,
        JSON.stringify(result),
        jobId
      );
    } else {
      console.error(`[ingest] job ${jobId} failed (exit ${code}):`, stderr.slice(-2000));
      db.prepare("UPDATE ingest_jobs SET status = 'failed', finished_at = ?, result = ? WHERE id = ?").run(
        finishedAt,
        JSON.stringify({ status: "error", exit_code: code, stderr: stderr.slice(-2000) }),
        jobId
      );
    }
  });

  child.on("error", (err) => {
    // e.g. python3 binary not found on PATH
    console.error(`[ingest] job ${jobId} failed to start:`, err.message);
    db.prepare("UPDATE ingest_jobs SET status = 'failed', finished_at = ?, result = ? WHERE id = ?").run(
      new Date().toISOString(),
      JSON.stringify({ status: "error", message: err.message }),
      jobId
    );
  });
}

// POST /ingest/trigger — kicks off the Python pipeline as a background
// subprocess and returns immediately with a job ID to poll.
router.post("/trigger", (req, res, next) => {
  try {
    // Guard against overlapping runs: the scraper does a full DELETE+INSERT
    // rewrite of the clusters tables per run, so two instances writing to
    // the same SQLite file at once can race and leave clusters half-written.
    // Report the already-running job instead of starting a second one.
    const existing = db
      .prepare("SELECT id FROM ingest_jobs WHERE status = 'running' ORDER BY created_at DESC LIMIT 1")
      .get();
    if (existing) {
      return res.status(409).json({ error: "an ingest job is already running", jobId: existing.id });
    }

    const jobId = uuidv4();
    db.prepare("INSERT INTO ingest_jobs (id, status, created_at) VALUES (?, 'running', ?)").run(
      jobId,
      new Date().toISOString()
    );
    runJob(jobId);
    res.status(202).json({ jobId, status: "running" });
  } catch (err) {
    next(err);
  }
});

// GET /ingest/status/:jobId — lets the frontend poll.
router.get("/status/:jobId", (req, res, next) => {
  try {
    const job = db.prepare("SELECT * FROM ingest_jobs WHERE id = ?").get(req.params.jobId);
    if (!job) {
      return res.status(404).json({ error: "job not found" });
    }
    res.json({
      jobId: job.id,
      status: job.status,
      createdAt: job.created_at,
      finishedAt: job.finished_at,
      result: job.result ? JSON.parse(job.result) : null,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
