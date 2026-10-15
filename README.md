# lemango.org

Lemango builds practical digital tools. This repo contains the marketing site
plus the backend that powers two products:

- **Lemango AI** — an AI chat assistant (`/ai.html`)
- **Court & Notice Management** — a case/notice/document workspace (`/court.html`)

It also includes a **newsletter signup** that automatically drafts a notification
email to `lemangonewsletter@gmail.com`, and **ad slots** ready for Google AdSense.

## Stack

- Node.js + Express (no build step)
- Plain HTML/CSS/JS frontend served from the project root. The Lemango AI chat UI and
  the NUCA court workspace are self-contained pages (`ai.html`, `court.html`)
  wired to the backend API.
- File-based JSON storage in `data/` (swap for a real database as you grow)
- `nodemailer` for email (SMTP, or `.eml` drafts when SMTP is unset)

## Quick start

```bash
npm install
cp .env.example .env      # Windows: copy .env.example .env
npm start                 # http://localhost:3000
```

Run in watch mode during development:

```bash
npm run dev
```

## Configuration

All configuration is via environment variables (see `.env.example`).

| Variable | Purpose |
| --- | --- |
| `PORT` | HTTP port (default `3000`) |
| `DATA_DIR` | Where JSON data and email drafts are stored (default `data`) |
| `SMTP_HOST/PORT/SECURE/USER/PASS` | SMTP credentials. Leave blank to save drafts instead of sending |
| `MAIL_FROM` | From address for outgoing mail |
| `NEWSLETTER_INBOX` | Where signup notifications go (default `lemangonewsletter@gmail.com`) |
| `POLLINATIONS_MODEL` | Model for the keyless default provider (works with no key) |
| `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `GEMINI_API_KEY`, `HUGGINGFACE_API_KEY`, `DEEPSEEK_API_KEY`, `OPENAI_API_KEY` | Optional AI keys; unlock faster/stronger providers and automatic failover |
| `OPENAI_BASE_URL` / `OPENAI_MODEL` | Override the OpenAI-compatible endpoint/model |
| `AI_SYSTEM_PROMPT` | Override the system prompt (responses stay branded "Lemango AI") |
| `AI_DISABLE_LIVE` | Set to `1` to force preview mode (no external calls) |
| `ADSENSE_CLIENT` | AdSense publisher ID, e.g. `ca-pub-…` |

### AI providers

Lemango AI answers out of the box using a **free, keyless provider** (Pollinations).
Adding any key from the table above lets it fail over to faster or stronger models.
Users pick branded models (`Mango-Light`, `Mango-Flash`, `Mango-Core`, `Mango-Pro`),
and every reply identifies itself as **Lemango AI** — the underlying provider is
never disclosed.

The browser tries this backend first, then falls back to a free keyless public
provider (`lemango-ai.js`). That means Lemango AI also works on static
hosting (e.g. GitHub Pages) where the Node backend isn't running, and it upgrades
automatically to the configured providers/keys once the backend is deployed.

During the beta, chat is limited to **4 questions per day** per browser (tracked
in `localStorage`). Regenerating an answer doesn't count. If asked who created it,
Lemango AI credits the Lemangoes project's founders (Logan / LoganNeedsFries and
co-creator Kevin / Kmoon).

### Email

Without SMTP, every composed email is written to `data/outbox/*.eml` — open the
draft to review, then configure SMTP to send for real.

For Gmail, create an [App Password](https://support.google.com/accounts/answer/185833)
and set `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_SECURE=true`.

### Ads

1. Get approved by Google AdSense and copy your publisher ID.
2. Set `ADSENSE_CLIENT=ca-pub-…`.
3. Add a real ad unit ID to `data-ad-unit` on each `.ad-slot` in `index.html`.
4. Fill in `ads.txt`.

## API

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Service/config status |
| `GET` | `/api/config` | Public client config (AdSense ID, etc.) |
| `POST` | `/api/newsletter` | Subscribe `{ email, name }` |
| `GET` | `/api/newsletter/count` | Subscriber count |
| `GET` | `/api/ai/status` | Whether live AI is configured |
| `GET` | `/api/ai/models` | Branded model catalog |
| `POST` | `/api/ai/chat` | Chat `{ message, model, history }` |
| `POST` | `/api/ai/generate-document` | Legal document draft `{ prompt }` |
| `GET/POST` | `/api/court/cases` | List / create cases |
| `GET/PATCH/DELETE` | `/api/court/cases/:id` | Read / update / delete a case |
| `POST` | `/api/court/cases/:id/notices` | Add a notice |
| `POST` | `/api/court/cases/:id/documents` | Add a document |
| `GET/POST` | `/api/court/sessions` | Virtual court sessions |
| `GET` | `/api/court/summary` | Case statistics |

## Deploying

This is a Node service. Deploy to any Node host (Render, Railway, Fly.io, a VPS)
and set the environment variables above. `npm start` is the run command.

## Notes

- Court & Notice Management is independent organizational software — **not legal
  advice and not an official court service**.
- The newsletter and product data are stored unencrypted on the server.
