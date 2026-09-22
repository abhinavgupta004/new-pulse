require("dotenv").config();
const express = require("express");
const cors = require("cors");

const clustersRouter = require("./routes/clusters");
const timelineRouter = require("./routes/timeline");
const ingestRouter = require("./routes/ingest");

const app = express();

app.use(cors({ origin: (process.env.CORS_ORIGIN || "*").split(",") }));
app.use(express.json());

app.get("/health", (req, res) => res.json({ status: "ok" }));

app.use("/clusters", clustersRouter);
app.use("/timeline", timelineRouter);
app.use("/ingest", ingestRouter);

// 404 for anything else
app.use((req, res) => {
  res.status(404).json({ error: `no route for ${req.method} ${req.path}` });
});

// Central error handler — anything a route's next(err) passes along lands here.
// Full error is always logged server-side; the client only gets the raw
// message in dev, so a stack/internal detail never leaks in production.
app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status || 500;
  const message =
    process.env.NODE_ENV === "production" && status === 500
      ? "internal server error"
      : err.message || "internal server error";
  res.status(status).json({ error: message });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`News Pulse API listening on :${PORT}`));
