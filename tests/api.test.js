import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";


process.env.DATA_DIR = path.join(os.tmpdir(), `lemango-test-${Date.now()}`);

process.env.AI_DISABLE_LIVE = "1";
process.env.SESSION_SECRET = "test-session-secret-with-sufficient-length";
process.env.GOOGLE_CLIENT_ID = "test-google-client-id";
process.env.ALLOWED_ORIGINS = "https://lemango.org";
process.env.ADMIN_EMAILS = "configured-admin@example.test";

const originalFetch = globalThis.fetch;
const testGoogleUsers = {
  "court-test-token-a": {
    sub: "court-test-user-a",
    email: "court-user-a@example.test",
    email_verified: true,
    aud: process.env.GOOGLE_CLIENT_ID,
  },
  "court-test-token-b": {
    sub: "court-test-user-b",
    email: "court-user-b@example.test",
    email_verified: true,
    aud: process.env.GOOGLE_CLIENT_ID,
  },
  "admin-test-token": {
    sub: "configured-admin",
    email: "configured-admin@example.test",
    email_verified: true,
    aud: process.env.GOOGLE_CLIENT_ID,
  },
};
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.origin === "https://oauth2.googleapis.com" && url.pathname === "/tokeninfo") {
    const user = testGoogleUsers[url.searchParams.get("id_token")];
    return new Response(JSON.stringify(user || {}), {
      status: user ? 200 : 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  return originalFetch(input, init);
};

let server;
let base;
let nextTestIp = 1;

before(async () => {
  await mkdir(process.env.DATA_DIR, { recursive: true });
  await writeFile(path.join(process.env.DATA_DIR, "admins.json"), JSON.stringify([
    { email: "court-user-a@example.test", rank: "superadmin" },
  ]));
  const { app } = await import("../server/index.js");
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server?.close();
  globalThis.fetch = originalFetch;
});

async function json(pathname, options) {
  const res = await fetch(`${base}${pathname}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Forwarded-For": `192.0.2.${nextTestIp++}`,
      ...(options?.headers || {}),
    },
  });
  return { res, body: await res.json().catch(() => ({})) };
}

async function signIn(token) {
  const { res, body } = await json("/api/auth/session", {
    method: "POST",
    headers: { Origin: base },
    body: JSON.stringify({ credential: token }),
  });
  assert.equal(res.status, 200);
  assert.equal("idToken" in body.user, false);
  const cookie = res.headers.get("set-cookie");
  assert.ok(cookie && /;\s*httponly/i.test(cookie));
  return cookie.split(";")[0];
}

test("health reports service status", async () => {
  const { res, body } = await json("/api/health");
  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
  assert.equal(Object.prototype.hasOwnProperty.call(body.services, "newsletterInbox"), false);
  const config = await json("/api/config");
  assert.equal(Object.prototype.hasOwnProperty.call(config.body, "newsletterInbox"), false);
});

test("CORS only reflects explicitly allowlisted origins", async () => {
  const allowed = await fetch(`${base}/api/health`, {
    headers: { Origin: "https://lemango.org" },
  });
  assert.equal(allowed.headers.get("access-control-allow-origin"), "https://lemango.org");
  assert.equal(allowed.headers.get("access-control-allow-credentials"), "true");

  const attacker = await fetch(`${base}/api/health`, {
    headers: { Origin: "https://attacker.example" },
  });
  assert.equal(attacker.headers.get("access-control-allow-origin"), null);

  const preflight = await fetch(`${base}/api/health`, {
    method: "OPTIONS",
    headers: {
      Origin: "https://attacker.example",
      "Access-Control-Request-Method": "GET",
    },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), null);
});

test("server rejects wildcard credentialed CORS configuration", () => {
  const result = spawnSync(process.execPath, [
    "--input-type=module",
    "-e",
    "await import('./server/index.js')",
  ], {
    cwd: process.cwd(),
    env: { ...process.env, ALLOWED_ORIGINS: "*" },
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /ALLOWED_ORIGINS must list explicit origins/);
});

test("newsletter rejects invalid email", async () => {
  const { res, body } = await json("/api/newsletter", {
    method: "POST",
    body: JSON.stringify({ email: "not-an-email" }),
  });
  assert.equal(res.status, 400);
  assert.equal(body.ok, false);
});

test("newsletter accepts valid email without revealing subscription status", async () => {
  const { res, body } = await json("/api/newsletter", {
    method: "POST",
    body: JSON.stringify({ email: "subscriber@example.com", name: "Sam" }),
  });
  assert.equal(res.status, 202);
  assert.deepEqual(body, { ok: true });

  const dup = await json("/api/newsletter", {
    method: "POST",
    body: JSON.stringify({ email: "subscriber@example.com" }),
  });
  assert.equal(dup.res.status, 202);
  assert.deepEqual(dup.body, body);
});

test("ai chat returns preview response when unconfigured", async () => {
  const { res, body } = await json("/api/ai/chat", {
    method: "POST",
    body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
  });
  assert.equal(res.status, 200);
  assert.equal(body.configured, false);
  assert.ok(body.reply.length > 0);
});

test("owner identifiers are absent from browser-delivered files", async () => {
  const { readFile } = await import("node:fs/promises");
  const browserFiles = [
    "../lemango-ai.js",
    "../index.html",
    "../admin-button.js",
    "../admin/index.html",
    "../ai.js",
    "../api-base.js",
    "../court/index.html",
    "../court.js",
    "../fastpay/index.html",
    "../auth/index.html",
    "../lemango-auth.js",
    "../paid/app.js",
    "../paid/index.html",
    "../payments/index.html",
    "../invite/index.html",
    "../workspace/index.html",
  ];
  const personalData = /known online as|founded and primarily developed by|OneDrive\\\\Desktop\\\\/i;
  const tokenQuery = /[?&]idToken=/i;
  const tokenExposure = /\buser\.idToken\b|idToken\s*:|x-id-token/i;

  for (const file of browserFiles) {
    const content = await readFile(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(content, personalData, file);
    assert.doesNotMatch(content, tokenQuery, file);
    assert.doesNotMatch(content, tokenExposure, file);
  }
});

test("GitHub Pages is configured to exclude private source files", async () => {
  const { readFile, access } = await import("node:fs/promises");
  const config = await readFile(new URL("../_config.yml", import.meta.url), "utf8");
  assert.match(config, /-\s+server\//);
  assert.match(config, /-\s+Debug\//);
  assert.match(config, /-\s+paid\//);
  assert.match(config, /-\s+\.env\.\*/);
  await assert.rejects(access(new URL("../.nojekyll", import.meta.url)));
});

test("private source, environment templates, and debug files are not served", async () => {
  for (const pathname of [
    "/Debug/server.js",
    "/server/routes/court.js",
    "/tests/api.test.js",
    "/package.json",
    "/.env.example",
    "/_config.yml",
  ]) {
    const { res } = await json(pathname);
    assert.equal(res.status, 404, pathname);
  }
});

test("paid access endpoint denies requests without verified identity", async () => {
  const { res, body } = await json("/paid/access", {
    method: "POST",
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 403);
  assert.equal(body.ok, false);
});

test("Google credentials exchange for HttpOnly sessions", async () => {
  const invalid = await json("/api/auth/session", {
    method: "POST",
    body: JSON.stringify({ credential: "invalid-token" }),
  });
  assert.equal(invalid.res.status, 401);

  const cookie = await signIn("court-test-token-a");
  const { res, body } = await json("/api/auth/me", {
    headers: { Cookie: cookie },
  });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "private, no-store");
  assert.equal(body.user.email, "court-user-a@example.test");
  assert.equal("idToken" in body.user, false);
});

test("logout revokes the HttpOnly session", async () => {
  const cookie = await signIn("court-test-token-a");
  const logout = await json("/api/auth/logout", {
    method: "POST",
    headers: { Cookie: cookie },
    body: JSON.stringify({}),
  });
  assert.equal(logout.res.status, 200);
  const current = await json("/api/auth/me", {
    headers: { Cookie: cookie },
  });
  assert.equal(current.res.status, 401);
});

test("state-changing API requests reject untrusted browser origins", async () => {
  const { res } = await json("/api/auth/session", {
    method: "POST",
    headers: { Origin: "https://attacker.example" },
    body: JSON.stringify({ credential: "court-test-token-a" }),
  });
  assert.equal(res.status, 403);
});

test("admin endpoints require a session cookie, not bearer or query tokens", async () => {
  const queryToken = await json("/api/admin/check?idToken=court-test-token-a");
  assert.equal(queryToken.res.status, 401);

  const bearerToken = await json("/api/admin/check", {
    headers: { Authorization: "Bearer court-test-token-a" },
  });
  assert.equal(bearerToken.res.status, 401);

  const cookie = await signIn("court-test-token-a");
  const sessionUser = await json("/api/admin/check", {
    headers: { Cookie: cookie },
  });
  assert.equal(sessionUser.res.status, 200);
  assert.equal(sessionUser.body.isAdmin, false);

  const configuredAdminCookie = await signIn("admin-test-token");
  const configuredAdmin = await json("/api/admin/check", {
    headers: { Cookie: configuredAdminCookie },
  });
  assert.equal(configuredAdmin.res.status, 200);
  assert.equal(configuredAdmin.body.isAdmin, true);
  assert.equal(configuredAdmin.body.rank, "superadmin");
});

test("ai chat does not reuse responses across different contexts", async () => {
  const originalFetch = globalThis.fetch;
  const originalDisableLive = process.env.AI_DISABLE_LIVE;
  const providerKeys = [
    "GROQ_API_KEY",
    "OPENROUTER_API_KEY",
    "GEMINI_API_KEY",
    "HUGGINGFACE_API_KEY",
    "DEEPSEEK_API_KEY",
    "OPENAI_API_KEY",
  ];
  const originalProviderKeys = new Map(providerKeys.map((key) => [key, process.env[key]]));
  process.env.AI_DISABLE_LIVE = "0";
  for (const key of providerKeys) delete process.env[key];
  globalThis.fetch = async (input, init) => {
    if (String(input).startsWith("https://text.pollinations.ai/")) {
      const { messages } = JSON.parse(init.body);
      const systemPrompt = messages.find((message) => message.role === "system").content;
      const context = systemPrompt.includes("PRIVATE_CONTEXT_ALPHA")
        ? "PRIVATE_CONTEXT_ALPHA"
        : "PRIVATE_CONTEXT_BETA";
      return new Response(JSON.stringify({
        choices: [{ message: { content: `response for ${context}` } }],
      }), { headers: { "Content-Type": "application/json" } });
    }
    return originalFetch(input, init);
  };

  try {
    const first = await json("/api/ai/chat", {
      method: "POST",
      body: JSON.stringify({ message: "same question", context: "PRIVATE_CONTEXT_ALPHA" }),
    });
    const second = await json("/api/ai/chat", {
      method: "POST",
      body: JSON.stringify({ message: "same question", context: "PRIVATE_CONTEXT_BETA" }),
    });

    assert.equal(first.body.reply, "response for PRIVATE_CONTEXT_ALPHA");
    assert.equal(second.body.reply, "response for PRIVATE_CONTEXT_BETA");
    assert.notEqual(second.body.cached, true);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalDisableLive === undefined) delete process.env.AI_DISABLE_LIVE;
    else process.env.AI_DISABLE_LIVE = originalDisableLive;
    for (const [key, value] of originalProviderKeys) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("ai exposes a branded model catalog", async () => {
  const { res, body } = await json("/api/ai/models");
  assert.equal(res.status, 200);
  assert.equal(body.provider, "Lemango AI");
  assert.ok(Array.isArray(body.models) && body.models.length > 0);
  assert.ok(body.models.every((m) => m.name && !/openai|groq|gemini|llama|mistral/i.test(m.name)));
});

test("court API requires a session and isolates records by account", async () => {
  const anonymous = await json("/api/court/cases");
  assert.equal(anonymous.res.status, 401);
  assert.equal(anonymous.res.headers.get("cache-control"), "private, no-store");

  const authA = { Cookie: await signIn("court-test-token-a") };
  const authB = { Cookie: await signIn("court-test-token-b") };
  const legacyBearer = await json("/api/court/cases", {
    headers: { Authorization: "Bearer court-test-token-a" },
  });
  assert.equal(legacyBearer.res.status, 401);
  const created = await json("/api/court/cases", {
    method: "POST",
    headers: authA,
    body: JSON.stringify({ title: "Private account A case" }),
  });
  assert.equal(created.res.status, 201);
  const caseId = created.body.case.id;

  const ownCases = await json("/api/court/cases", { headers: authA });
  assert.equal(ownCases.body.cases.length, 1);
  assert.equal(ownCases.body.cases[0].id, caseId);
  assert.equal(ownCases.res.headers.get("cache-control"), "private, no-store");

  const otherCases = await json("/api/court/cases", { headers: authB });
  assert.deepEqual(otherCases.body.cases, []);
  const otherSummary = await json("/api/court/summary", { headers: authB });
  assert.equal(otherSummary.body.total, 0);
  const otherRead = await json(`/api/court/cases/${caseId}`, { headers: authB });
  assert.equal(otherRead.res.status, 404);
  const otherNotice = await json(`/api/court/cases/${caseId}/notices`, {
    method: "POST",
    headers: authB,
    body: JSON.stringify({ title: "Unauthorized notice" }),
  });
  assert.equal(otherNotice.res.status, 404);
  const otherDocument = await json(`/api/court/cases/${caseId}/documents`, {
    method: "POST",
    headers: authB,
    body: JSON.stringify({ title: "Unauthorized document" }),
  });
  assert.equal(otherDocument.res.status, 404);
  const otherSession = await json("/api/court/sessions", {
    method: "POST",
    headers: authB,
    body: JSON.stringify({ caseId, roomId: "private-case-room" }),
  });
  assert.equal(otherSession.res.status, 404);
  const otherSessions = await json("/api/court/sessions", { headers: authB });
  assert.deepEqual(otherSessions.body.sessions, []);
  const otherUpdate = await json(`/api/court/cases/${caseId}`, {
    method: "PATCH",
    headers: authB,
    body: JSON.stringify({ title: "Unauthorized update" }),
  });
  assert.equal(otherUpdate.res.status, 404);
  const otherDelete = await json(`/api/court/cases/${caseId}`, {
    method: "DELETE",
    headers: authB,
  });
  assert.equal(otherDelete.res.status, 404);

  const ownerDelete = await json(`/api/court/cases/${caseId}`, {
    method: "DELETE",
    headers: authA,
  });
  assert.equal(ownerDelete.body.ok, true);
});

test("court cases support the full lifecycle", async () => {
  const auth = { Cookie: await signIn("court-test-token-a") };
  const created = await json("/api/court/cases", {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      title: "Test v. Case",
      caseNumber: "T-1",
      parties: "A, B",
      priority: "high",
    }),
  });
  assert.equal(created.res.status, 201);
  const id = created.body.case.id;
  assert.deepEqual(created.body.case.parties, ["A", "B"]);

  const notice = await json(`/api/court/cases/${id}/notices`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ title: "Hearing notice" }),
  });
  assert.equal(notice.res.status, 201);

  const doc = await json(`/api/court/cases/${id}/documents`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ title: "Complaint", kind: "filing" }),
  });
  assert.equal(doc.res.status, 201);

  const patched = await json(`/api/court/cases/${id}`, {
    method: "PATCH",
    headers: auth,
    body: JSON.stringify({ status: "closed" }),
  });
  assert.equal(patched.body.case.status, "closed");

  const list = await json("/api/court/cases", { headers: auth });
  const found = list.body.cases.find((c) => c.id === id);
  assert.equal(found.notices.length, 1);
  assert.equal(found.documents.length, 1);

  const summary = await json("/api/court/summary", { headers: auth });
  assert.equal(summary.body.total, 1);
  assert.equal(summary.body.byStatus.closed, 1);

  const removed = await json(`/api/court/cases/${id}`, { method: "DELETE", headers: auth });
  assert.equal(removed.body.ok, true);

  const after = await json(`/api/court/cases/${id}`, { headers: auth });
  assert.equal(after.res.status, 404);
});

test("unknown api route returns 404 json", async () => {
  const { res, body } = await json("/api/does-not-exist");
  assert.equal(res.status, 404);
  assert.equal(body.ok, false);
});
