import { promises as fs } from "node:fs";
import path from "node:path";
import nodemailer from "nodemailer";
import { DATA_DIR } from "./store.js";

const OUTBOX = path.join(DATA_DIR, "outbox");

export function isSmtpConfigured() {
  return Boolean(
    process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS
  );
}

function createTransport() {
  if (isSmtpConfigured()) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE || "false") === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  // No SMTP configured: build a real RFC822 message but do not send it.
  return nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "unix" });
}

/**
 * Sends an email when SMTP is configured. Otherwise the fully composed message
 * is written to data/outbox as a .eml draft so nothing is ever lost.
 */
export async function sendMail({ to, subject, text, html, replyTo }) {
  const from = process.env.MAIL_FROM || "Lemango <no-reply@lemango.org>";
  const transport = createTransport();
  const info = await transport.sendMail({
    from,
    to,
    subject,
    text,
    html,
    replyTo,
  });

  if (isSmtpConfigured()) {
    return { delivered: true, messageId: info.messageId };
  }

  await fs.mkdir(OUTBOX, { recursive: true });
  const safe = String(info.messageId || Date.now()).replace(/[^a-z0-9]/gi, "_");
  const file = path.join(OUTBOX, `${safe}.eml`);
  await fs.writeFile(file, info.message, "utf8");
  return { delivered: false, draft: path.relative(process.cwd(), file) };
}
