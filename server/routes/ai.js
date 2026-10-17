import { Router } from "express";
import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { BRAND, aiConfigured, catalogForClient, generateReply } from "../providers.js";

export { aiConfigured };

export const aiRouter = Router();

const FOUNDERS =
  `I was founded and primarily developed by Logan, known online as LoganNeedsFries, ` +
  `who created the Lemangoes project, provided funding, and configured my core ` +
  `infrastructure—including domain acquisition and Cloudflare security certification. ` +
  `Kevin, known online as Kmoon, also contributed as a co-creator to the project.`;

const CHAT_SYSTEM =
  process.env.AI_SYSTEM_PROMPT ||
  `You are ${BRAND}, a helpful assistant created by Lemango. ` +
    `Always identify yourself as ${BRAND}. Never mention, name, or hint at any underlying ` +
    `model, company, or provider that powers you. If asked what model or system you are, ` +
    `say that you are ${BRAND}. If asked who made, created, founded, built, or owns you, ` +
    `reply exactly: "${FOUNDERS}" Be accurate, friendly, and concise.`;

const LEGAL_SYSTEM =
  `You are the ${BRAND} document assistant for NUCA (National Universal Court) case and ` +
  `notice management, provided by Lemango. Draft professional, formal legal documents. ` +
  `Always refer to yourself as ${BRAND} and never mention any underlying model or provider. ` +
  `If asked who made, created, founded, or built you, reply: "${FOUNDERS}" ` +
  `Return plain text only: write section headings in UPPERCASE on their own line, body ` +
  `paragraphs below them, and finish with a signature block (a blank line, then a ` +
    `signature line and a printed-name line).`;

function normalizeMessages(body = {}) {
  const out = [];
  const push = (role, content) => {
    const text = String(content ?? "").slice(0, 4000);
    if (text.trim()) out.push({ role, content: text });
  };

  if (Array.isArray(body.history)) {
    for (const m of body.history) {
      if (!m) continue;
      if (m.role === "user" || m.role === "assistant") push(m.role, m.content);
      else if (m.r === "user" || m.r === "assistant") push(m.r, m.t);
    }
  } else if (Array.isArray(body.messages)) {
    for (const m of body.messages) {
      if (m && (m.role === "user" || m.role === "assistant")) push(m.role, m.content);
    }
  }

  const message = String(body.message ?? "").trim();
  if (message) {
    const last = messages_last(out);
    if (!last || last.role !== "user" || last.content.trim() !== message) {
      out.push({ role: "user", content: message.slice(0, 4000) });
    }
  }

  return out.slice(-20);
}

function messages_last(list) {
  return list.length ? list[list.length - 1] : null;
}

aiRouter.get("/status", (_req, res) => {
  res.json({ ok: true, configured: aiConfigured(), provider: BRAND, models: catalogForClient() });
});

// Matches the chat frontend's model picker.
aiRouter.get("/models", (_req, res) => {
  res.json({ ok: true, provider: BRAND, models: catalogForClient() });
});

aiRouter.post("/switch_model", (req, res) => {
  const model = String(req.body?.model || "").slice(0, 60);
  res.json({ ok: true, model, provider: BRAND });
});

aiRouter.post("/rate", (_req, res) => {
  res.json({ ok: true });
});

aiRouter.post("/clear", (_req, res) => {
  res.json({ ok: true });
});

// Best-effort chat logging for model training. Never blocks the response.
aiRouter.post("/log", (req, res) => {
  try {
    const entry = {
      t: new Date().toISOString(),
      role: String(req.body?.role || "").slice(0, 20),
      text: String(req.body?.text || "").slice(0, 8000),
      session: String(req.body?.session || "").slice(0, 60),
      model: String(req.body?.model || "").slice(0, 60),
      ip: req.ip,
    };
    const dir = path.resolve(process.cwd(), "data");
    mkdirSync(dir, { recursive: true });
    appendFileSync(path.join(dir, "chatlog.jsonl"), JSON.stringify(entry) + "\n");
  } catch (e) {
    // ignore logging failures
  }
  res.json({ ok: true });
});

// --- Per-IP daily cap to prevent abuse (resets at midnight UTC) ---
const aiDailyHits = new Map();
function aiDailyLimit(req, res, next) {
  const key = req.ip || "unknown";
  const day = new Date().toISOString().slice(0, 10);
  const entry = aiDailyHits.get(key);
  if (!entry || entry.day !== day) {
    aiDailyHits.set(key, { day, count: 0 });
  }
  const e = aiDailyHits.get(key);
  const MAX_PER_DAY = 60;
  if (e.count >= MAX_PER_DAY) {
    return res.status(429).json({ ok: false, error: "Daily AI limit reached. Please try again tomorrow." });
  }
  e.count += 1;
  next();
}

// Verify a Google ID token (best-effort). Returns the decoded payload or null.
const idTokenCache = new Map();
async function verifyIdToken(token) {
  if (!token || typeof token !== "string") return null;
  const cached = idTokenCache.get(token);
  if (cached && cached.exp > Date.now()) return cached.payload;
  try {
    const r = await fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(token));
    if (!r.ok) return null;
    const payload = await r.json();
    if (!payload || !payload.email || !payload.email_verified) return null;
    if (payload.aud !== process.env.GOOGLE_CLIENT_ID) return null;
    idTokenCache.set(token, { payload, exp: Date.now() + 5 * 60 * 1000 });
    return payload;
  } catch {
    return null;
  }
}

const NO_CODE_RULE =
  "IMPORTANT: The user is NOT signed in. You must NOT write, generate, or provide any " +
  "code, code snippets, scripts, or programming solutions. If the user asks you to code " +
  "or write code, politely decline and tell them to sign in with Google to unlock coding " +
  "help. You may still answer general questions, explain concepts, and help with writing.";

aiRouter.post("/chat", aiDailyLimit, async (req, res) => {
  try {
    const messages = normalizeMessages(req.body || {});
    if (!messages.length) {
      return res.status(400).json({ ok: false, error: "No message provided." });
    }

    const model = typeof req.body?.model === "string" ? req.body.model : "Mango-Light";

    // Determine if the caller is a verified signed-in user (unlocks coding help).
    let codeAllowed = false;
    const token = req.body && req.body.idToken;
    const verified = await verifyIdToken(token);
    if (verified) codeAllowed = true;

    const systemPrompt = codeAllowed ? CHAT_SYSTEM : (CHAT_SYSTEM + "\n" + NO_CODE_RULE);

    if (!aiConfigured()) {
      const reply = `Hi! I'm ${BRAND}. I'm in preview mode right now, so I can't give live answers yet. Please try again soon.`;
      return res.json({ ok: true, configured: false, response: reply, reply, model, provider: BRAND });
    }

    const { text, reasoning } = await generateReply(
      [{ role: "system", content: systemPrompt }, ...messages],
      model,
      { reasoning: { effort: "medium" } }
    );

    res.json({ ok: true, configured: true, response: text, reply: text, reasoning: reasoning || null, model, provider: BRAND });
  } catch (err) {
    console.error("[ai] chat failed:", err?.message || err);
    res.status(502).json({
      ok: false,
      error: `${BRAND} couldn't answer right now. Please try again in a moment.`,
    });
  }
});

// Used by the Court & Notice Management document builder.
aiRouter.post("/generate-document", async (req, res) => {
  try {
    const prompt = String(req.body?.prompt ?? "").trim().slice(0, 4000);
    if (!prompt) {
      return res.status(400).json({ ok: false, error: "Please describe the document you want." });
    }
    if (!aiConfigured()) {
      return res.status(503).json({ ok: false, error: `${BRAND} live generation is unavailable right now.` });
    }

    const messages = [
      { role: "system", content: `${BRAND} document assistant.\n${LEGAL_SYSTEM}` },
      { role: "user", content: `Create a legal document based on this request: ${prompt}` },
    ];
    const { text, reasoning } = await generateReply(messages, req.body?.model || "Mango-Core", { maxTokens: 2500, reasoning: { effort: "medium" } });
    res.json({ ok: true, text, response: text, reasoning: reasoning || null, provider: BRAND });
  } catch (err) {
    console.error("[ai] document generation failed:", err?.message || err);
    res.status(502).json({
      ok: false,
      error: `${BRAND} couldn't generate the document right now. Please try again in a moment.`,
    });
  }
});
