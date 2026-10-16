/**
 * server/sessions.js
 * Server-side session store backed by JsonStore.
 * Sessions are identified by a signed token stored in an httpOnly cookie.
 * No external dependencies — just crypto from Node stdlib.
 */

import crypto from "node:crypto";
import { JsonStore } from "./store.js";

const SESSION_COOKIE = "lm_sid";
const SESSION_SECRET = process.env.SESSION_SECRET || "lemango-dev-secret-change-in-prod";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

const store = new JsonStore("sessions", {});

/* ── Signing ────────────────────────────────────────────────── */
function sign(value) {
  const mac = crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(value)
    .digest("base64url");
  return `${value}.${mac}`;
}

function unsign(signed) {
  const dot = signed.lastIndexOf(".");
  if (dot === -1) return null;
  const value = signed.slice(0, dot);
  const expected = sign(value);
  if (!crypto.timingSafeEqual(Buffer.from(signed), Buffer.from(expected))) return null;
  return value;
}

/* ── Public API ─────────────────────────────────────────────── */

/** Create a new session and set the cookie. Returns the session id. */
export async function createSession(res, data) {
  const id = crypto.randomBytes(24).toString("base64url");
  const session = { id, data, createdAt: Date.now(), expiresAt: Date.now() + SESSION_TTL_MS };

  await store.update((sessions) => {
    sessions[id] = session;
    return session;
  });

  res.cookie(SESSION_COOKIE, sign(id), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_TTL_MS,
    path: "/",
  });

  return id;
}

/** Read the current session from the request. Returns session data or null. */
export async function getSession(req) {
  const raw = req.cookies?.[SESSION_COOKIE];
  if (!raw) return null;

  const id = unsign(raw);
  if (!id) return null;

  const sessions = await store.read();
  const session = sessions[id];
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    await destroySession(null, id);
    return null;
  }

  return session.data;
}

/** Destroy the session cookie and remove it from the store. */
export async function destroySession(res, id) {
  if (id) {
    await store.update((sessions) => {
      delete sessions[id];
      return null;
    });
  }
  if (res) {
    res.clearCookie(SESSION_COOKIE, { path: "/" });
  }
}

/** Destroy session by reading the cookie from the request. */
export async function destroySessionFromReq(req, res) {
  const raw = req.cookies?.[SESSION_COOKIE];
  if (!raw) return;
  const id = unsign(raw);
  if (id) await destroySession(res, id);
  else if (res) res.clearCookie(SESSION_COOKIE, { path: "/" });
}

/** Express middleware: attaches req.user if a valid session exists. */
export async function sessionMiddleware(req, res, next) {
  req.user = await getSession(req);
  next();
}
