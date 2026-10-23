/**
 * server/routes/paid.js
 * Serves paid products behind auth + allowlist. Files are loaded from the
 * bundled local product directory first, then fall back to the Paided repo.
 */
import { Router } from "express";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import crypto from "node:crypto";
import { verifyIdToken } from "./ai.js";

export const paidRouter = Router();

const ALLOWED_PAID_EMAILS = ["kcrespo102512@gmail.com", "incmoney37@gmail.com"];
const REPO_RAW = "https://raw.githubusercontent.com/kcrespo1025/Paided/main";
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map(); // path -> { body: Buffer, type: string, ts: number }

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_DIR = path.resolve(__dirname, "..", "paid-content", "launchpad");

// Sign the paid cookie so its value can't be forged by simply setting the email.
const PAID_SECRET = process.env.PAID_COOKIE_SECRET || crypto.randomBytes(32).toString("hex");

function signEmail(email) {
  return crypto.createHmac("sha256", PAID_SECRET).update(email).digest("hex");
}

function makeCookieValue(email) {
  return email + "." + signEmail(email);
}

function readCookieEmail(value) {
  const raw = String(value || "");
  const i = raw.lastIndexOf(".");
  if (i < 0) return null;
  const email = raw.slice(0, i).toLowerCase();
  const sig = raw.slice(i + 1);
  const expected = signEmail(email);
  if (sig.length !== expected.length) return null;
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  return email;
}

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

async function isAllowed(req, res) {
  // Cookie-based paid session (set after a successful idToken check), so that
  // sub-resource requests (css/js/images) are authenticated automatically.
  const cookieEmail = readCookieEmail(req.cookies?.lm_paid);
  if (cookieEmail && ALLOWED_PAID_EMAILS.includes(cookieEmail)) return true;
  const idt = req.query?.idToken || req.body?.idToken || req.headers["x-id-token"];
  const verified = idt ? await verifyIdToken(idt) : null;
  if (verified && ALLOWED_PAID_EMAILS.includes(String(verified.email).toLowerCase())) {
    if (res) {
      res.cookie("lm_paid", makeCookieValue(String(verified.email).toLowerCase()), {
        httpOnly: true,
        secure: true,
        sameSite: "none",
        maxAge: 24 * 60 * 60 * 1000,
      });
    }
    return true;
  }
  return false;
}

paidRouter.get("/", async (req, res) => {
  if (!(await isAllowed(req, res))) return res.status(403).send("Access denied. Paid product — sign in with an authorized account.");
   try {
     const entry = await fetchFile("index.html");
     let html = entry.body.toString("utf8");
     const inject = `<script>document.addEventListener('contextmenu',function(e){e.preventDefault();});document.addEventListener('keydown',function(e){if((e.ctrlKey||e.metaKey)&&['c','u','s'].includes(e.key.toLowerCase()))e.preventDefault();});</script><div style="position:fixed;bottom:8px;left:8px;z-index:9999;"><a href="https://lemango.org/payments" style="color:#94a3b8;font-size:11px;text-decoration:none;">← Lemango</a></div>`;
     html = html.replace("</body>", inject + "</body>");
     res.type("text/html; charset=utf-8").send(html);
   } catch (e) {
     // Remote paid product unavailable — serve a local placeholder so owners aren't 404'd.
     const fallback = `<!doctype html><html><head><meta charset="utf-8"><title>Lamda LaunchPad</title></head><body style="font-family:sans-serif;background:#0f172a;color:#e2e8f0;display:grid;place-items:center;min-height:100vh;"><div style="text-align:center;max-width:480px;padding:24px;"><h1>Lamda LaunchPad</h1><p>Paid product is being prepared. You have access as an owner.</p><a href="https://lemango.org/payments" style="color:#94a3b8;">← Back to Lemango</a></div></body></html>`;
     res.type("text/html; charset=utf-8").send(fallback);
   }
});

paidRouter.get("/*", async (req, res) => {
  if (!(await isAllowed(req, res))) return res.status(403).send("Access denied.");
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