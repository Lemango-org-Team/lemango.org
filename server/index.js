import "dotenv/config";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import express from "express";
import { newsletterRouter } from "./routes/newsletter.js";
import { aiRouter, aiConfigured } from "./routes/ai.js";
import { courtRouter } from "./routes/court.js";
import { isSmtpConfigured } from "./mailer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, "..", "public");
const PORT = Number(process.env.PORT || 3000);
const NEWSLETTER_INBOX = process.env.NEWSLETTER_INBOX || "lemangonewsletter@gmail.com";

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", true);
app.use(express.json({ limit: "256kb" }));

// --- Tiny in-memory rate limiter (per IP) for write endpoints ---
const hits = new Map();
function rateLimit({ windowMs = 60_000, max = 20 } = {}) {
  return (req, res, next) => {
    const key = req.ip || "unknown";
    const now = Date.now();
    const entry = hits.get(key) || { count: 0, reset: now + windowMs };
    if (now > entry.reset) {
      entry.count = 0;
      entry.reset = now + windowMs;
    }
    entry.count += 1;
    hits.set(key, entry);
    if (entry.count > max) {
      return res.status(429).json({ ok: false, error: "Too many requests. Please try again shortly." });
    }
    next();
  };
}

// --- API ---
app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    services: {
      ai: aiConfigured(),
      email: isSmtpConfigured() ? "smtp" : "draft",
      newsletterInbox: NEWSLETTER_INBOX,
    },
    time: new Date().toISOString(),
  });
});

app.get("/api/config", (_req, res) => {
  res.json({
    adsenseClient: process.env.ADSENSE_CLIENT || null,
    newsletterInbox: NEWSLETTER_INBOX,
    aiConfigured: aiConfigured(),
  });
});

app.use("/api/newsletter", rateLimit({ windowMs: 60_000, max: 10 }), newsletterRouter);
app.use("/api/ai", rateLimit({ windowMs: 60_000, max: 60 }), aiRouter);
app.use("/api/court", courtRouter);

// --- Static frontend ---
app.use(express.static(PUBLIC_DIR, { extensions: ["html"], index: "index.html" }));

app.use("/api", (_req, res) => res.status(404).json({ ok: false, error: "Not found." }));

// Fallback to the landing page for unknown non-API routes.
app.get("*", (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error("[error]", err);
  res.status(500).json({ ok: false, error: "Something went wrong on our end." });
});

export { app };

export function start(port = PORT) {
  const server = app.listen(port, () => {
    console.log(`Lemango server listening on http://localhost:${port}`);
    console.log(`  AI provider:    ${aiConfigured() ? "configured" : "not configured (demo mode)"}`);
    console.log(`  Email delivery: ${isSmtpConfigured() ? "SMTP" : "draft to data/outbox"}`);
    console.log(`  Newsletter to:  ${NEWSLETTER_INBOX}`);
  });
  return server;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) start();
