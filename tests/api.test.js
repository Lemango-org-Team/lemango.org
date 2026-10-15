import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";

// Use an isolated data directory before the server modules load.
process.env.DATA_DIR = path.join(os.tmpdir(), `lemango-test-${Date.now()}`);
// Keep AI tests deterministic and offline.
process.env.AI_DISABLE_LIVE = "1";

let server;
let base;

before(async () => {
  const { app } = await import("../server/index.js");
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server?.close();
});

async function json(pathname, options) {
  const res = await fetch(`${base}${pathname}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  return { res, body: await res.json().catch(() => ({})) };
}

test("health reports service status", async () => {
  const { res, body } = await json("/api/health");
  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.services.newsletterInbox, "lemangonewsletter@gmail.com");
});

test("newsletter rejects invalid email", async () => {
  const { res, body } = await json("/api/newsletter", {
    method: "POST",
    body: JSON.stringify({ email: "not-an-email" }),
  });
  assert.equal(res.status, 400);
  assert.equal(body.ok, false);
});

test("newsletter accepts a valid email and drafts a notification", async () => {
  const { res, body } = await json("/api/newsletter", {
    method: "POST",
    body: JSON.stringify({ email: "subscriber@example.com", name: "Sam" }),
  });
  assert.equal(res.status, 201);
  assert.equal(body.ok, true);
  assert.equal(body.notification.delivered, false);
  assert.match(body.notification.draft, /outbox[\\/].*\.eml$/);

  const dup = await json("/api/newsletter", {
    method: "POST",
    body: JSON.stringify({ email: "subscriber@example.com" }),
  });
  assert.equal(dup.body.alreadySubscribed, true);
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

test("ai exposes a branded model catalog", async () => {
  const { res, body } = await json("/api/ai/models");
  assert.equal(res.status, 200);
  assert.equal(body.provider, "Lemango AI");
  assert.ok(Array.isArray(body.models) && body.models.length > 0);
  assert.ok(body.models.every((m) => m.name && !/openai|groq|gemini|llama|mistral/i.test(m.name)));
});

test("court cases support the full lifecycle", async () => {
  const created = await json("/api/court/cases", {
    method: "POST",
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
    body: JSON.stringify({ title: "Hearing notice" }),
  });
  assert.equal(notice.res.status, 201);

  const doc = await json(`/api/court/cases/${id}/documents`, {
    method: "POST",
    body: JSON.stringify({ title: "Complaint", kind: "filing" }),
  });
  assert.equal(doc.res.status, 201);

  const patched = await json(`/api/court/cases/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "closed" }),
  });
  assert.equal(patched.body.case.status, "closed");

  const list = await json("/api/court/cases");
  const found = list.body.cases.find((c) => c.id === id);
  assert.equal(found.notices.length, 1);
  assert.equal(found.documents.length, 1);

  const summary = await json("/api/court/summary");
  assert.equal(summary.body.total, 1);
  assert.equal(summary.body.byStatus.closed, 1);

  const removed = await json(`/api/court/cases/${id}`, { method: "DELETE" });
  assert.equal(removed.body.ok, true);

  const after = await json(`/api/court/cases/${id}`);
  assert.equal(after.res.status, 404);
});

test("unknown api route returns 404 json", async () => {
  const { res, body } = await json("/api/does-not-exist");
  assert.equal(res.status, 404);
  assert.equal(body.ok, false);
});
