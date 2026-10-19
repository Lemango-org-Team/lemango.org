/**
 * server/routes/paid.js
 * Serves paid products from the Paided repo (single source of truth) behind
 * auth + allowlist. Files are fetched from GitHub raw and cached in memory.
 */
import { Router } from "express";
import { verifyIdToken } from "./ai.js";

export const paidRouter = Router();

const ALLOWED_PAID_EMAILS = ["kcrespo102512@gmail.com", "incmoney37@gmail.com"];
const REPO_RAW = "https://raw.githubusercontent.com/kcrespo1025/Paided/main";
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map(); // path -> { body: Buffer, type: string, ts: number }

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

async function fetchFile(relPath) {
  const cached = cache.get(relPath);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached;
  const url = REPO_RAW + "/" + relPath.split("/").map(encodeURIComponent).join("/");
  const res = await fetch(url);
  if (!res.ok) throw new Error("not found");
  const buf = Buffer.from(await res.arrayBuffer());
  const entry = { body: buf, type: contentType(relPath), ts: Date.now() };
  cache.set(relPath, entry);
  return entry;
}

async function isAllowed(req) {
  const token = req.query?.idToken || req.body?.idToken || req.headers["x-id-token"] || req.cookies?.lm_sid && null;
  // Prefer idToken (Google) for allowlist check.
  const idt = req.query?.idToken || req.headers["x-id-token"];
  const verified = idt ? await verifyIdToken(idt) : null;
  if (verified && ALLOWED_PAID_EMAILS.includes(String(verified.email).toLowerCase())) return true;
  // Fallback: session cookie user (if backend auth is used)
  return false;
}

paidRouter.get("/", async (req, res) => {
  if (!(await isAllowed(req))) return res.status(403).send("Access denied. Paid product — sign in with an authorized account.");
  try {
    const entry = await fetchFile("index.html");
    let html = entry.body.toString("utf8");
    // Inject right-click disable + a back link before </body>
    const inject = `<script>document.addEventListener('contextmenu',function(e){e.preventDefault();});document.addEventListener('keydown',function(e){if((e.ctrlKey||e.metaKey)&&['c','u','s'].includes(e.key.toLowerCase()))e.preventDefault();});</script><div style="position:fixed;bottom:8px;left:8px;z-index:9999;"><a href="https://lemango.org/payments" style="color:#94a3b8;font-size:11px;text-decoration:none;">← Lemango</a></div>`;
    html = html.replace("</body>", inject + "</body>");
    res.type("text/html; charset=utf-8").send(html);
  } catch (e) {
    res.status(404).send("Not found.");
  }
});

paidRouter.get("/*", async (req, res) => {
  if (!(await isAllowed(req))) return res.status(403).send("Access denied.");
  const rel = req.params[0] || "";
  if (!rel || rel.endsWith("/")) {
    // redirect to index
    return res.redirect("/paid/");
  }
  try {
    const entry = await fetchFile(rel);
    res.type(entry.type).send(entry.body);
  } catch (e) {
    res.status(404).send("Not found.");
  }
});