/**
 * server/routes/auth.js
 * Google OAuth 2.0 sign-in / sign-up flow.
 *
 * Flow:
 *   1. GET /api/auth/google          → redirect to Google consent screen
 *   2. GET /api/auth/google/callback → exchange code, fetch profile, create session
 *   3. GET /api/auth/me              → return current user (or 401)
 *   4. POST /api/auth/logout         → destroy session
 */

import crypto from "node:crypto";
import { Router } from "express";
import { JsonStore, makeId } from "../store.js";
import { createSession, destroySessionFromReq } from "../sessions.js";

export const authRouter = Router();

const CLIENT_ID     = process.env.GOOGLE_CLIENT_ID     || "";
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const BASE_URL      = process.env.BASE_URL             || "https://lemango.org";
const REDIRECT_URI  = `${BASE_URL}/api/auth/google/callback`;

const users = new JsonStore("users", []);

/* ── Helpers ────────────────────────────────────────────────── */

function googleAuthUrl(state) {
  const params = new URLSearchParams({
    client_id:     CLIENT_ID,
    redirect_uri:  REDIRECT_URI,
    response_type: "code",
    scope:         "openid email profile",
    state,
    access_type:   "online",
    prompt:        "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function exchangeCode(code) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri:  REDIRECT_URI,
      grant_type:    "authorization_code",
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token exchange failed: ${err}`);
  }
  return res.json();
}

async function fetchGoogleProfile(accessToken) {
  const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error("Failed to fetch Google profile");
  return res.json();
}

async function upsertUser(profile, ip) {
  let user = null;
  let isNew = false;
  await users.update((list) => {
    const existing = list.find((u) => u.googleId === profile.sub);
    if (existing) {
      existing.name      = profile.name;
      existing.firstName = profile.given_name || "";
      existing.avatar    = profile.picture || "";
      existing.lastLogin = new Date().toISOString();
      user = existing;
    } else {
      user = {
        id:        makeId("usr"),
        googleId:  profile.sub,
        email:     profile.email,
        name:      profile.name,
        firstName: profile.given_name || "",
        avatar:    profile.picture || "",
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString(),
      };
      list.push(user);
      isNew = true;
    }
    return user;
  });
  // Log sign-up / login
  try {
    const { appendFileSync, mkdirSync } = await import("node:fs");
    const pathMod = await import("node:path");
    const dir = pathMod.resolve(process.cwd(), "data");
    mkdirSync(dir, { recursive: true });
    const entry = { t: new Date().toISOString(), type: isNew ? "signup" : "login", email: profile.email, name: profile.name, ip: ip || null };
    appendFileSync(pathMod.join(dir, "users-log.jsonl"), JSON.stringify(entry) + "\n");
  } catch (e) { /* ignore */ }
  return user;
}

/* ── Routes ─────────────────────────────────────────────────── */

// GET /api/auth/google
// Kicks off the OAuth flow. Stores a CSRF state token in the session cookie
// via a short-lived signed state param.
authRouter.get("/google", (req, res) => {
  if (!CLIENT_ID) {
    return res.status(503).json({ ok: false, error: "Google auth is not configured on this server." });
  }

  const state = crypto.randomBytes(16).toString("hex");
  // Store state in a short-lived cookie so we can verify it on callback
  const crossOrigin = Boolean(process.env.ALLOWED_ORIGINS);
  res.cookie("lm_oauth_state", state, {
    httpOnly: true,
    secure: crossOrigin || process.env.NODE_ENV === "production",
    sameSite: crossOrigin ? "none" : "lax",
    maxAge: 10 * 60 * 1000, // 10 minutes
    path: "/",
  });

  // Optional: where to redirect after login (passed as ?next=/ai etc.).
  // Only allow relative paths to prevent open redirects.
  const rawNext = String(req.query.next || "/");
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";
  res.cookie("lm_oauth_next", next, {
    httpOnly: true,
    secure: crossOrigin || process.env.NODE_ENV === "production",
    sameSite: crossOrigin ? "none" : "lax",
    maxAge: 10 * 60 * 1000,
    path: "/",
  });

  res.redirect(googleAuthUrl(state));
});

// GET /api/auth/google/callback
authRouter.get("/google/callback", async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    console.warn("[auth] Google returned error:", error);
    return res.redirect("/auth.html?error=access_denied");
  }

  // Verify CSRF state
  const storedState = req.cookies?.lm_oauth_state;
  res.clearCookie("lm_oauth_state", { path: "/" });

  if (!storedState || storedState !== state) {
    return res.redirect("/auth.html?error=invalid_state");
  }

  if (!code) {
    return res.redirect("/auth.html?error=no_code");
  }

  try {
    const tokens  = await exchangeCode(code);
    const profile = await fetchGoogleProfile(tokens.access_token);
    const user    = await upsertUser(profile, req.ip);

    await createSession(res, {
      userId:    user.id,
      email:     user.email,
      name:      user.name,
      firstName: user.firstName,
      avatar:    user.avatar,
    });

    const next = req.cookies?.lm_oauth_next || "/";
    res.clearCookie("lm_oauth_next", { path: "/" });
    res.redirect(next);
  } catch (err) {
    console.error("[auth] callback error:", err);
    res.redirect("/auth.html?error=server_error");
  }
});

// GET /api/auth/me — returns current user or 401
authRouter.get("/me", (req, res) => {
  if (!req.user) return res.status(401).json({ ok: false, error: "Not authenticated" });
  res.json({ ok: true, user: req.user });
});

// POST /api/auth/logout
authRouter.post("/logout", async (req, res) => {
  await destroySessionFromReq(req, res);
  res.json({ ok: true });
});
