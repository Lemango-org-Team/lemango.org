






import crypto from "node:crypto";
import { JsonStore } from "./store.js";

const SESSION_COOKIE = "lm_sid";
const configuredSecret = process.env.SESSION_SECRET;
if (process.env.NODE_ENV === "production" &&
    (!configuredSecret || Buffer.byteLength(configuredSecret) < 32)) {
  throw new Error("SESSION_SECRET must be configured with at least 32 bytes in production.");
}
const SESSION_SECRET = configuredSecret || crypto.randomBytes(32).toString("base64url");
const CROSS_ORIGIN = Boolean(process.env.ALLOWED_ORIGINS);
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14;

const store = new JsonStore("sessions", {});


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
  const mac = signed.slice(dot + 1);
  const expected = sign(value);
  const expectedDot = expected.lastIndexOf(".");
  const expectedMac = expected.slice(expectedDot + 1);
  if (mac.length !== expectedMac.length) return null;
  try {
    if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expectedMac))) return null;
  } catch {
    return null;
  }
  return value;
}




export async function createSession(res, data) {
  const id = crypto.randomBytes(24).toString("base64url");
  const session = { id, data, createdAt: Date.now(), expiresAt: Date.now() + SESSION_TTL_MS };

  await store.update((sessions) => {
    sessions[id] = session;
    return session;
  });

  res.cookie(SESSION_COOKIE, sign(id), {
    httpOnly: true,
    secure: CROSS_ORIGIN || process.env.NODE_ENV === "production",
    sameSite: CROSS_ORIGIN ? "none" : "lax",
    maxAge: SESSION_TTL_MS,
    path: "/",
  });

  return id;
}


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


export async function destroySessionFromReq(req, res) {
  const raw = req.cookies?.[SESSION_COOKIE];
  if (!raw) return;
  const id = unsign(raw);
  if (id) await destroySession(res, id);
  else if (res) res.clearCookie(SESSION_COOKIE, { path: "/" });
}


export async function sessionMiddleware(req, res, next) {
  req.user = await getSession(req);
  next();
}
