import { Router } from "express";
import { JsonStore, makeId } from "../store.js";
import { sendMail } from "../mailer.js";

const subscribers = new JsonStore("subscribers", []);
const NEWSLETTER_INBOX = process.env.NEWSLETTER_INBOX || "lemangonewsletter@gmail.com";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const newsletterRouter = Router();

newsletterRouter.get("/count", async (_req, res, next) => {
  try {
    const list = await subscribers.read();
    res.json({ count: list.length });
  } catch (err) {
    next(err);
  }
});

newsletterRouter.post("/", async (req, res, next) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const name = String(req.body?.name || "").trim().slice(0, 80);
    const source = String(req.body?.source || "landing").slice(0, 60);

    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ ok: false, error: "Please enter a valid email address." });
    }

    const existing = await subscribers.read();
    if (existing.some((s) => s.email === email)) {
      return res.json({ ok: true, alreadySubscribed: true });
    }

    const subscriber = {
      id: makeId("sub"),
      email,
      name,
      source,
      createdAt: new Date().toISOString(),
      ip: req.ip,
    };

    await subscribers.update((list) => {
      list.push(subscriber);
      return subscriber;
    });

    // Auto-draft a notification email to the Lemango newsletter inbox.
    const notification = await sendMail({
      to: NEWSLETTER_INBOX,
      replyTo: email,
      subject: `New Lemango newsletter signup: ${email}`,
      text: [
        "A new subscriber joined the Lemango newsletter.",
        "",
        `Email:  ${email}`,
        `Name:   ${name || "(not provided)"}`,
        `Source: ${source}`,
        `When:   ${subscriber.createdAt}`,
        "",
        "Reply directly to this message to contact the subscriber.",
      ].join("\n"),
      html: `<h2>New Lemango newsletter signup</h2>
<p>A new subscriber joined the Lemango newsletter.</p>
<ul>
  <li><strong>Email:</strong> ${escapeHtml(email)}</li>
  <li><strong>Name:</strong> ${escapeHtml(name || "(not provided)")}</li>
  <li><strong>Source:</strong> ${escapeHtml(source)}</li>
  <li><strong>When:</strong> ${escapeHtml(subscriber.createdAt)}</li>
</ul>
<p>Reply directly to this message to contact the subscriber.</p>`,
    });

    const welcome = await sendMail({
      to: email,
      subject: "Welcome to the Lemango newsletter",
      text: [
        "Thanks for signing up for the Lemango newsletter!",
        "",
        "We'll email you when Lemango AI and Court & Notice Management are ready, along with occasional product updates.",
        "",
        "- The Lemango team",
      ].join("\n"),
      html: `<p>Thanks for signing up for the <strong>Lemango newsletter</strong>!</p>
<p>We'll email you when Lemango AI and Court &amp; Notice Management are ready, along with occasional product updates.</p>
<p>- The Lemango team</p>`,
    });

    res.status(201).json({
      ok: true,
      subscriber: { id: subscriber.id, email: subscriber.email },
      notification,
      welcome,
    });
  } catch (err) {
    next(err);
  }
});

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}
