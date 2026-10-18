/**
 * server/routes/admin.js
 * Gmail zero-trust admin system.
 */
import crypto from "node:crypto";
import { Router } from "express";
import { JsonStore } from "../store.js";
import { verifyIdToken } from "./ai.js";

export const adminRouter = Router();

const ADMINS_FILE = "admins";
const INVITES_FILE = "invites";
const QUEUE_FILE = "admin-queue";

const adminsStore = new JsonStore(ADMINS_FILE, []);
const invitesStore = new JsonStore(INVITES_FILE, {});
const queueStore = new JsonStore(QUEUE_FILE, []);

async function seedAdmins() {
  const list = await adminsStore.read();
  const seeds = [
    { email: "kcrespo102512@gmail.com", rank: "superadmin" },
    { email: "incmoney37@gmail.com", rank: "superadmin" },
  ];
  let changed = false;
  for (const s of seeds) {
    if (!list.find((a) => a.email.toLowerCase() === s.email.toLowerCase())) {
      list.push({ email: s.email, rank: s.rank, addedAt: new Date().toISOString() });
      changed = true;
    }
  }
  if (changed) await adminsStore.write(list);
}
seedAdmins().catch(() => {});

async function isAdminEmail(email) {
  if (!email) return null;
  const list = await adminsStore.read();
  return list.find((a) => a.email.toLowerCase() === String(email).toLowerCase()) || null;
}

async function currentUser(req) {
  const token = req.body?.idToken || req.query?.idToken || req.headers["x-id-token"];
  const verified = await verifyIdToken(token);
  if (!verified) return null;
  const admin = await isAdminEmail(verified.email);
  return { email: verified.email, name: verified.name, admin };
}

async function safetyScore(email) {
  try {
    const r = await fetch("https://emailrep.io/" + encodeURIComponent(email), {
      headers: { "User-Agent": "Lemango-Admin/1.0" },
    });
    if (!r.ok) return { score: 50, source: "unavailable" };
    const data = await r.json();
    let score = 50;
    if (data.reputation === "high") score = 95;
    else if (data.reputation === "medium") score = 70;
    else if (data.reputation === "low") score = 30;
    if (data.details && typeof data.details.spam === "boolean" && data.details.spam) score = Math.min(score, 40);
    return { score, reputation: data.reputation, details: data.details || {}, source: "emailrep.io" };
  } catch {
    return { score: 50, source: "error" };
  }
}

adminRouter.get("/check", async (req, res) => {
  const u = await currentUser(req);
  if (!u) return res.status(401).json({ ok: false, error: "Not authenticated" });
  res.json({ ok: true, email: u.email, name: u.name, isAdmin: !!u.admin, rank: u.admin ? u.admin.rank : null });
});

adminRouter.get("/safety", async (req, res) => {
  const email = String(req.query.email || "").trim();
  if (!email) return res.status(400).json({ ok: false, error: "email required" });
  const result = await safetyScore(email);
  res.json({ ok: true, email, ...result });
});

adminRouter.post("/invite", async (req, res) => {
  const u = await currentUser(req);
  if (!u || !u.admin) return res.status(403).json({ ok: false, error: "Admin only" });
  const targetEmail = String(req.body?.email || "").trim().toLowerCase();
  if (!targetEmail || !targetEmail.includes("@")) return res.status(400).json({ ok: false, error: "valid email required" });
  const token = crypto.randomBytes(24).toString("hex");
  const invites = await invitesStore.read();
  invites[token] = { email: targetEmail, createdBy: u.email, createdAt: new Date().toISOString(), used: false };
  await invitesStore.write(invites);
  const base = process.env.BASE_URL || "https://lemango.org";
  res.json({ ok: true, token, inviteUrl: `${base}/invite?token=${token}` });
});

adminRouter.get("/invites", async (req, res) => {
  const u = await currentUser(req);
  if (!u || !u.admin) return res.status(403).json({ ok: false, error: "Admin only" });
  const invites = await invitesStore.read();
  res.json({ ok: true, invites: Object.entries(invites).map(([token, v]) => ({ token, ...v })) });
});

adminRouter.get("/queue", async (req, res) => {
  const u = await currentUser(req);
  if (!u || !u.admin) return res.status(403).json({ ok: false, error: "Admin only" });
  const queue = await queueStore.read();
  res.json({ ok: true, queue });
});

adminRouter.post("/verify-invite", async (req, res) => {
  const token = String(req.body?.token || "").trim();
  const u = await currentUser(req);
  if (!token) return res.status(400).json({ ok: false, error: "token required" });
  if (!u) return res.status(401).json({ ok: false, error: "Not authenticated", needLogin: true });
  const invites = await invitesStore.read();
  const inv = invites[token];
  if (!inv) return res.status(404).json({ ok: false, error: "Invalid invite" });
  if (inv.used) return res.status(410).json({ ok: false, error: "Invite already used" });
  if (inv.email.toLowerCase() !== u.email.toLowerCase()) {
    return res.status(403).json({ ok: false, error: "This invite is for a different account", wrongUser: true });
  }
  const safety = await safetyScore(u.email);
  const queue = await queueStore.read();
  const existing = queue.find((q) => q.token === token);
  if (!existing) {
    queue.push({
      token, email: u.email, name: u.name, safetyScore: safety.score, safety,
      status: "pending", createdAt: new Date().toISOString(), tosAccepted: false,
    });
    await queueStore.write(queue);
  }
  res.json({ ok: true, status: "queued", safety });
});

adminRouter.get("/status", async (req, res) => {
  const token = String(req.query.token || "").trim();
  const u = await currentUser(req);
  if (!token) return res.status(400).json({ ok: false, error: "token required" });
  const queue = await queueStore.read();
  const entry = queue.find((q) => q.token === token);
  if (!entry) return res.status(404).json({ ok: false, error: "Not in queue" });
  res.json({ ok: true, entry, isAdmin: !!(u && u.admin) });
});

adminRouter.post("/accept-tos", async (req, res) => {
  const token = String(req.body?.token || "").trim();
  const u = await currentUser(req);
  if (!token || !u) return res.status(401).json({ ok: false, error: "Not authenticated" });
  const queue = await queueStore.read();
  const entry = queue.find((q) => q.token === token);
  if (!entry) return res.status(404).json({ ok: false, error: "Not in queue" });
  if (entry.email.toLowerCase() !== u.email.toLowerCase()) return res.status(403).json({ ok: false, error: "Forbidden" });
  entry.tosAccepted = true;
  await queueStore.write(queue);
  res.json({ ok: true });
});

adminRouter.post("/approve", async (req, res) => {
  const u = await currentUser(req);
  if (!u || !u.admin) return res.status(403).json({ ok: false, error: "Admin only" });
  const token = String(req.body?.token || "").trim();
  const force = !!req.body?.force;
  const queue = await queueStore.read();
  const entry = queue.find((q) => q.token === token);
  if (!entry) return res.status(404).json({ ok: false, error: "Not in queue" });
  if (entry.safetyScore < 90 && !force) {
    return res.status(400).json({ ok: false, error: "Safety score below 90; confirm with force=true", score: entry.safetyScore });
  }
  if (!entry.tosAccepted) {
    return res.status(400).json({ ok: false, error: "User has not accepted TOS" });
  }
  entry.status = "approved";
  entry.approvedBy = u.email;
  entry.approvedAt = new Date().toISOString();
  const invites = await invitesStore.read();
  if (invites[token]) invites[token].used = true;
  await invitesStore.write(invites);
  await queueStore.write(queue);
  res.json({ ok: true, entry });
});

adminRouter.post("/reject", async (req, res) => {
  const u = await currentUser(req);
  if (!u || !u.admin) return res.status(403).json({ ok: false, error: "Admin only" });
  const token = String(req.body?.token || "").trim();
  const queue = await queueStore.read();
  const entry = queue.find((q) => q.token === token);
  if (!entry) return res.status(404).json({ ok: false, error: "Not in queue" });
  entry.status = "rejected";
  entry.rejectedBy = u.email;
  entry.rejectedAt = new Date().toISOString();
  await queueStore.write(queue);
  res.json({ ok: true, entry });
});

// Abuse detection: same IP, multiple users, direct-to-AI patterns.
adminRouter.get("/abuse-report", async (req, res) => {
  const u = await currentUser(req);
  if (!u || !u.admin) return res.status(403).json({ ok: false, error: "Admin only" });
  try {
    const { readFileSync } = await import("node:fs");
    const pathMod = await import("node:path");
    const dir = pathMod.resolve(process.cwd(), "data");
    const readLines = (file) => {
      try { return readFileSync(pathMod.join(dir, file), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)); }
      catch { return []; }
    };
    const usage = readLines("ai-usage.jsonl");
    const users = readLines("users-log.jsonl");
    const security = readLines("security-log.jsonl");

    // Group AI usage by IP
    const byIp = {};
    for (const e of usage) {
      const ip = e.ip || "unknown";
      if (!byIp[ip]) byIp[ip] = [];
      byIp[ip].push(e);
    }
    const suspiciousIps = Object.entries(byIp)
      .filter(([ip, arr]) => {
        const uniqueEmails = new Set(arr.map((e) => e.email).filter(Boolean));
        return uniqueEmails.size >= 3 || arr.length >= 20;
      })
      .map(([ip, arr]) => ({
        ip,
        requestCount: arr.length,
        uniqueUsers: new Set(arr.map((e) => e.email).filter(Boolean)).size,
        emails: [...new Set(arr.map((e) => e.email).filter(Boolean))],
      }));

    res.json({
      ok: true,
      totalAiRequests: usage.length,
      totalSignups: users.filter((u) => u.type === "signup").length,
      totalLogins: users.filter((u) => u.type === "login").length,
      securityEvents: security.length,
      suspiciousIps,
      codeLeakAttempts: security.filter((s) => s.type === "code-leak-attempt").length,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /api/admin/ai-logs
adminRouter.get("/ai-logs", async (req, res) => {
  const u = await currentUser(req);
  if (!u || !u.admin) return res.status(403).json({ ok: false, error: "Admin only" });
  try {
    const { readFileSync } = await import("node:fs");
    const pathMod = await import("node:path");
    const dir = pathMod.resolve(process.cwd(), "data");
    const lines = readFileSync(pathMod.join(dir, "ai-usage.jsonl"), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
    res.json({ ok: true, logs: lines.slice(-200).reverse() });
  } catch {
    res.json({ ok: true, logs: [] });
  }
});

// GET /api/admin/users-log
adminRouter.get("/users-log", async (req, res) => {
  const u = await currentUser(req);
  if (!u || !u.admin) return res.status(403).json({ ok: false, error: "Admin only" });
  try {
    const { readFileSync } = await import("node:fs");
    const pathMod = await import("node:path");
    const dir = pathMod.resolve(process.cwd(), "data");
    const lines = readFileSync(pathMod.join(dir, "users-log.jsonl"), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
    res.json({ ok: true, logs: lines.slice(-200).reverse() });
  } catch {
    res.json({ ok: true, logs: [] });
  }
});