/**
 * server/routes/paid.js
 * Serves paid products behind auth + allowlist. Files are loaded from the
 * bundled local product directory first, then fall back to the Paided repo.
 */
import { Router } from "express";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const paidRouter = Router();

const ALLOWED_PAID_EMAILS = new Set(
  (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);
const REPO_RAW = String(process.env.PAID_REPO_RAW || "").replace(/\/+$/, "");
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map(); // path -> { body: Buffer, type: string, ts: number }

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_DIR = path.resolve(__dirname, "..", "..", "paid");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};

function contentType(p) {
  const i = p.lastIndexOf(".");
  return (i >= 0 && TYPES[p.slice(i).toLowerCase()]) || "application/octet-stream";
}

async function fetchLocal(relPath) {
  const rel = path.normalize(relPath).replace(/^(\.\.[/\\])+/, "").replace(/^[/\\]+/, "");
  const full = path.join(LOCAL_DIR, rel);
  if (full !== LOCAL_DIR && !full.startsWith(LOCAL_DIR + path.sep)) throw new Error("not found");
  const buf = await readFile(full);
  return { body: buf, type: contentType(relPath), ts: Date.now() };
}

async function fetchFile(relPath) {
  const cached = cache.get(relPath);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached;
  try {
    const local = await fetchLocal(relPath);
    cache.set(relPath, local);
    return local;
  } catch {
    // fall through to the remote repo
  }
  if (!REPO_RAW) throw new Error("PAID_REPO_RAW is not configured.");
  const url = REPO_RAW + "/" + relPath.split("/").map(encodeURIComponent).join("/");
  const headers = {};
  const token = process.env.GITHUB_TOKEN || process.env.PAID_REPO_TOKEN;
  if (token) headers.Authorization = "Bearer " + token;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error("not found");
  const buf = Buffer.from(await res.arrayBuffer());
  const entry = { body: buf, type: contentType(relPath), ts: Date.now() };
  cache.set(relPath, entry);
  return entry;
}

function isAllowed(req) {
  const email = String(req.user?.email || "").toLowerCase();
  return Boolean(email && ALLOWED_PAID_EMAILS.has(email));
}

paidRouter.post("/access", async (req, res) => {
  if (!isAllowed(req)) {
    return res.status(403).json({ ok: false, error: "Access denied." });
  }
  res.json({ ok: true });
});

paidRouter.get("/", async (req, res) => {
  if (!isAllowed(req)) return res.status(403).send("Access denied. Paid product — sign in with an authorized account.");
  try {
    const entry = await fetchFile("index.html");
    let html = entry.body.toString("utf8");
    const inject = "";
    if (html.includes("</body>")) {
      html = html.replace("</body>", inject + "</body>");
    } else {
      html += inject;
    }
    res.type("text/html; charset=utf-8").send(html);
  } catch (e) {
    try {
      const local = await fetchLocal("index.html");
      let html = local.body.toString("utf8");
      const inject = "";
      if (html.includes("</body>")) {
        html = html.replace("</body>", inject + "</body>");
      } else {
        html += inject;
      }
      return res.type("text/html; charset=utf-8").send(html);
    } catch {
      const fallback = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=/paid"><title>Lamda LaunchPad</title></head><body style="font-family:sans-serif;background:#0f172a;color:#e2e8f0;display:grid;place-items:center;min-height:100vh;"><div style="text-align:center;max-width:480px;padding:24px;"><p>Loading Lambda LaunchPad...</p></div><script>location.replace('/paid');</script></body></html>`;
      res.type("text/html; charset=utf-8").send(fallback);
    }
  }
});

paidRouter.get("/*", async (req, res) => {
  if (!isAllowed(req)) return res.status(403).send("Access denied.");
  const rel = req.params[0] || "";
  if (!rel || rel.endsWith("/")) {
    return res.redirect("/paid/");
  }
  try {
    const entry = await fetchFile(rel);
    res.type(entry.type).send(entry.body);
  } catch (e) {
    try {
      const local = await fetchLocal(rel);
      return res.type(local.type).send(local.body);
    } catch {
      res.status(404).send("Not found.");
    }
  }
});