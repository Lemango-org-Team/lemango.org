import { Router } from "express";
import { JsonStore, makeId } from "../store.js";

const cases = new JsonStore("cases", []);
const sessions = new JsonStore("court-sessions", []);

export const courtRouter = Router();

const STATUSES = ["open", "pending", "active", "closed"];
const PRIORITIES = ["low", "normal", "high"];

function cleanCaseInput(body = {}) {
  const out = {};
  const text = (v, max = 2000) => String(v ?? "").trim().slice(0, max);
  if (body.title !== undefined) out.title = text(body.title, 200);
  if (body.type !== undefined) out.type = text(body.type, 80);
  if (body.plaintiff !== undefined) out.plaintiff = text(body.plaintiff, 200);
  if (body.defendant !== undefined) out.defendant = text(body.defendant, 200);
  if (body.courtDate !== undefined) out.courtDate = text(body.courtDate, 60);
  if (body.courtTime !== undefined) out.courtTime = text(body.courtTime, 40);
  if (body.courtroom !== undefined) out.courtroom = text(body.courtroom, 120);
  if (body.caseNumber !== undefined) out.caseNumber = text(body.caseNumber, 80);
  if (body.court !== undefined) out.court = text(body.court, 200);
  if (body.judge !== undefined) out.judge = text(body.judge, 120);
  if (body.description !== undefined) out.description = text(body.description, 4000);
  if (body.summary !== undefined) out.summary = text(body.summary, 4000);
  if (body.nextHearing !== undefined) out.nextHearing = body.nextHearing ? text(body.nextHearing, 40) : null;
  if (body.status !== undefined) {
    const status = String(body.status).trim().toLowerCase();
    out.status = STATUSES.includes(status) ? status : "open";
  }
  if (body.priority !== undefined) out.priority = PRIORITIES.includes(body.priority) ? body.priority : "normal";
  if (body.parties !== undefined) {
    out.parties = Array.isArray(body.parties)
      ? body.parties.map((p) => text(p, 120)).filter(Boolean).slice(0, 20)
      : text(body.parties, 500).split(",").map((p) => p.trim()).filter(Boolean).slice(0, 20);
  }
  return out;
}

courtRouter.get("/summary", async (_req, res, next) => {
  try {
    const list = await cases.read();
    res.json({
      total: list.length,
      byStatus: STATUSES.reduce((acc, s) => ({ ...acc, [s]: list.filter((c) => c.status === s).length }), {}),
      upcomingHearings: list
        .filter((c) => c.nextHearing)
        .sort((a, b) => String(a.nextHearing).localeCompare(String(b.nextHearing)))
        .slice(0, 5)
        .map((c) => ({ id: c.id, title: c.title, nextHearing: c.nextHearing })),
    });
  } catch (err) {
    next(err);
  }
});

courtRouter.get("/cases", async (req, res, next) => {
  try {
    let list = await cases.read();
    const { status, q } = req.query;
    if (status) list = list.filter((c) => c.status === status);
    if (q) {
      const needle = String(q).toLowerCase();
      list = list.filter((c) =>
        [c.title, c.caseNumber, c.court, c.summary, ...(c.parties || [])]
          .join(" ")
          .toLowerCase()
          .includes(needle)
      );
    }
    list = [...list].sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
    res.json({ cases: list });
  } catch (err) {
    next(err);
  }
});

courtRouter.post("/cases", async (req, res, next) => {
  try {
    const input = cleanCaseInput(req.body);
    if (!input.title) {
      return res.status(400).json({ ok: false, error: "A case title is required." });
    }
    const now = new Date().toISOString();
    const record = {
      id: makeId("case"),
      title: input.title,
      type: input.type || "",
      plaintiff: input.plaintiff || "",
      defendant: input.defendant || "",
      courtDate: input.courtDate || "",
      courtTime: input.courtTime || "",
      courtroom: input.courtroom || "",
      caseNumber: input.caseNumber || "",
      court: input.court || "",
      judge: input.judge || "",
      description: input.description || "",
      summary: input.summary || "",
      parties: input.parties || [],
      status: input.status || "pending",
      priority: input.priority || "normal",
      nextHearing: input.nextHearing || null,
      notices: [],
      documents: [],
      createdAt: now,
      updatedAt: now,
    };
    await cases.update((list) => {
      list.push(record);
      return record;
    });
    res.status(201).json({ ok: true, case: record });
  } catch (err) {
    next(err);
  }
});

courtRouter.get("/cases/:id", async (req, res, next) => {
  try {
    const list = await cases.read();
    const found = list.find((c) => c.id === req.params.id);
    if (!found) return res.status(404).json({ ok: false, error: "Case not found." });
    res.json({ case: found });
  } catch (err) {
    next(err);
  }
});

courtRouter.patch("/cases/:id", async (req, res, next) => {
  try {
    const input = cleanCaseInput(req.body);
    let updated = null;
    await cases.update((list) => {
      const idx = list.findIndex((c) => c.id === req.params.id);
      if (idx === -1) return null;
      list[idx] = { ...list[idx], ...input, updatedAt: new Date().toISOString() };
      updated = list[idx];
      return updated;
    });
    if (!updated) return res.status(404).json({ ok: false, error: "Case not found." });
    res.json({ ok: true, case: updated });
  } catch (err) {
    next(err);
  }
});

courtRouter.delete("/cases/:id", async (req, res, next) => {
  try {
    let removed = false;
    await cases.update((list) => {
      const idx = list.findIndex((c) => c.id === req.params.id);
      if (idx !== -1) {
        list.splice(idx, 1);
        removed = true;
      }
      return removed;
    });
    if (!removed) return res.status(404).json({ ok: false, error: "Case not found." });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

courtRouter.post("/cases/:id/notices", async (req, res, next) => {
  try {
    const text = (v, max = 4000) => String(v ?? "").trim().slice(0, max);
    const notice = {
      id: makeId("notice"),
      title: text(req.body?.title, 200),
      body: text(req.body?.body),
      receivedAt: req.body?.receivedAt ? text(req.body.receivedAt, 40) : new Date().toISOString(),
      dueAt: req.body?.dueAt ? text(req.body.dueAt, 40) : null,
      status: ["new", "in-review", "done"].includes(req.body?.status) ? req.body.status : "new",
      createdAt: new Date().toISOString(),
    };
    if (!notice.title) return res.status(400).json({ ok: false, error: "A notice title is required." });

    let updated = null;
    await cases.update((list) => {
      const c = list.find((x) => x.id === req.params.id);
      if (!c) return null;
      c.notices.push(notice);
      c.updatedAt = new Date().toISOString();
      updated = c;
      return updated;
    });
    if (!updated) return res.status(404).json({ ok: false, error: "Case not found." });
    res.status(201).json({ ok: true, notice, case: updated });
  } catch (err) {
    next(err);
  }
});

courtRouter.patch("/cases/:id/notices/:noticeId", async (req, res, next) => {
  try {
    let updated = null;
    await cases.update((list) => {
      const c = list.find((x) => x.id === req.params.id);
      if (!c) return null;
      const n = c.notices.find((x) => x.id === req.params.noticeId);
      if (!n) return null;
      if (req.body?.status && ["new", "in-review", "done"].includes(req.body.status)) n.status = req.body.status;
      if (req.body?.title !== undefined) n.title = String(req.body.title).trim().slice(0, 200);
      if (req.body?.body !== undefined) n.body = String(req.body.body).slice(0, 4000);
      c.updatedAt = new Date().toISOString();
      updated = c;
      return updated;
    });
    if (!updated) return res.status(404).json({ ok: false, error: "Case or notice not found." });
    res.json({ ok: true, case: updated });
  } catch (err) {
    next(err);
  }
});

courtRouter.post("/cases/:id/documents", async (req, res, next) => {
  try {
    const text = (v, max = 500) => String(v ?? "").trim().slice(0, max);
    const doc = {
      id: makeId("doc"),
      title: text(req.body?.title, 200),
      kind: text(req.body?.kind, 60) || "filing",
      url: text(req.body?.url, 1000),
      addedAt: new Date().toISOString(),
    };
    if (!doc.title) return res.status(400).json({ ok: false, error: "A document title is required." });

    let updated = null;
    await cases.update((list) => {
      const c = list.find((x) => x.id === req.params.id);
      if (!c) return null;
      c.documents.push(doc);
      c.updatedAt = new Date().toISOString();
      updated = c;
      return updated;
    });
    if (!updated) return res.status(404).json({ ok: false, error: "Case not found." });
    res.status(201).json({ ok: true, document: doc, case: updated });
  } catch (err) {
    next(err);
  }
});

courtRouter.delete("/cases/:id/documents/:docId", async (req, res, next) => {
  try {
    let updated = null;
    await cases.update((list) => {
      const c = list.find((x) => x.id === req.params.id);
      if (!c) return null;
      const before = c.documents.length;
      c.documents = c.documents.filter((d) => d.id !== req.params.docId);
      if (c.documents.length === before) return null;
      c.updatedAt = new Date().toISOString();
      updated = c;
      return updated;
    });
    if (!updated) return res.status(404).json({ ok: false, error: "Case or document not found." });
    res.json({ ok: true, case: updated });
  } catch (err) {
    next(err);
  }
});

courtRouter.get("/sessions", async (req, res, next) => {
  try {
    let list = await sessions.read();
    if (req.query.caseId) list = list.filter((s) => s.caseId === req.query.caseId);
    res.json({ sessions: [...list].sort((a, b) => (b.startTime || "").localeCompare(a.startTime || "")) });
  } catch (err) {
    next(err);
  }
});

courtRouter.post("/sessions", async (req, res, next) => {
  try {
    const session = {
      id: makeId("session"),
      caseId: String(req.body?.caseId ?? "").trim().slice(0, 80),
      roomId: String(req.body?.roomId ?? "").trim().slice(0, 120),
      startTime: new Date().toISOString(),
      status: "active",
      participants: [],
    };
    if (!session.caseId) return res.status(400).json({ ok: false, error: "A case id is required." });
    await sessions.update((list) => {
      list.push(session);
      return session;
    });
    res.status(201).json({ ok: true, session });
  } catch (err) {
    next(err);
  }
});
