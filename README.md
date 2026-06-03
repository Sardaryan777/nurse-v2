# Nursing Clinical Note Generator + Email Automation

Two services that run on [Railway](https://railway.app):

| Service | Folder | What it is | Public URL? |
|---|---|---|---|
| **Generator website** | `frontend/` | Your `nursing-doc-generator.jsx` wrapped in a React app + a tiny Express server that proxies the Claude API (so your key never reaches the browser). | ✅ Yes — the automation opens it. |
| **Automation worker** | `automation/` | Background worker. Every 5 min: reads Gmail for unread emails with a PDF, extracts the agency name from the PDF and the nurse/dates/times from the email body with Claude, drives the generator site with Puppeteer, then replies with the generated PDFs and marks the email read. | ❌ No — background only. |

```
nursing-automation/
├── frontend/        # generator website (public)
│   ├── src/App.jsx          ← your generator, proxied + automation bridge
│   ├── src/main.jsx
│   ├── index.html
│   ├── server.js            ← Express: serves build + /api/claude proxy
│   ├── vite.config.js
│   ├── Dockerfile
│   └── railway.toml
├── automation/      # email worker (background)
│   ├── automation.js        ← main 5-min loop
│   ├── gmail.js             ← Gmail read / reply / mark-read
│   ├── extract.js           ← Claude: agency (PDF) + nurse/dates/times (body)
│   ├── generator.js         ← Puppeteer driver + HTML→PDF rendering
│   ├── Dockerfile
│   └── railway.toml
├── .env.example
└── README.md
```

---

## How the pieces fit

1. **Email arrives** in your Gmail with a 485 / Plan-of-Care **PDF** attached, and the
   nurse name + visit dates/times written in the **email body**.
2. The **worker** finds it (`is:unread has:attachment filename:pdf`), downloads the PDF.
3. **Claude** reads the PDF → **agency name**. Claude reads the body → **nurse name, all dates, all times**.
4. **Puppeteer** opens your **generator URL**, uploads the PDF, fills Agency + Nurse,
   selects every date, fills each date's time-in/out, clicks **Generate**, and waits.
5. The generator emits HTML notes; the worker renders each to a **real A4 PDF**.
6. The worker **replies** to the original email with all PDFs attached and **marks it read**.

> **Design note:** the generator exposes a small `window.__automation` bridge so Puppeteer
> sets dates/times reliably instead of clicking fragile calendar/time popovers. The human
> UI is unchanged — you can still use the site normally.

---

## Part A — Deploy the Generator website

### 1. Push this repo to GitHub
```bash
cd nursing-automation
git init
git add .
git commit -m "Nursing generator + automation"
git remote add origin https://github.com/<you>/nursing-automation.git
git push -u origin main
```

### 2. Create the frontend service on Railway
1. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo** → pick this repo.
2. Open the created service → **Settings**:
   - **Root Directory**: `frontend`
   - **Builder**: Dockerfile (auto-detected from `frontend/railway.toml`).
3. **Variables** tab → add:
   - `ANTHROPIC_API_KEY` = your Anthropic key.
   - *(Railway sets `PORT` automatically; `server.js` reads it.)*
4. **Settings → Networking → Generate Domain**. Copy the public URL, e.g.
   `https://your-generator.up.railway.app`. **You'll need this for the worker (`GENERATOR_URL`).**
5. Open the URL in a browser to confirm the generator loads.

---

## Part B — Get a Gmail OAuth token

The worker uses OAuth (no password). You need three values:
`GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_TOKEN`.

### 1. Enable the Gmail API + create OAuth credentials
1. [Google Cloud Console](https://console.cloud.google.com) → create/select a project.
2. **APIs & Services → Library** → enable **Gmail API**.
3. **APIs & Services → OAuth consent screen** → External → fill required fields →
   add your Gmail address under **Test users**.
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Web application**.
   - **Authorized redirect URIs**: add `https://developers.google.com/oauthplayground`
   - Create → copy the **Client ID** and **Client secret**.

### 2. Mint a refresh token with the OAuth Playground
1. Go to [OAuth 2.0 Playground](https://developers.google.com/oauthplayground).
2. Click the ⚙️ (top-right) → check **Use your own OAuth credentials** → paste your
   Client ID + Client secret.
3. Left panel: in the "Input your own scopes" box enter:
   ```
   https://mail.google.com/
   ```
   (full scope — needed to read, send, and modify/label messages) → **Authorize APIs**.
4. Sign in with the Gmail account → allow.
5. Click **Exchange authorization code for tokens**.
6. Copy the **Refresh token**.

### 3. Form your `GMAIL_TOKEN`
Set `GMAIL_TOKEN` to either:
- the bare refresh token string, e.g. `1//0gABCDxyz...`, **or**
- a JSON blob: `{"refresh_token":"1//0gABCDxyz..."}`

Both are accepted by `gmail.js`.

---

## Part C — Deploy the Automation worker

1. In the **same Railway project** → **New → GitHub Repo** (same repo) to add a second service
   (or **New → Empty Service** and connect the repo).
2. Open it → **Settings**:
   - **Root Directory**: `automation`
   - **Builder**: Dockerfile.
   - Leave networking **off** — it's a background worker, no domain needed.
3. **Variables** tab → add all of:
   | Variable | Value |
   |---|---|
   | `ANTHROPIC_API_KEY` | your Anthropic key |
   | `GMAIL_CLIENT_ID` | from Part B |
   | `GMAIL_CLIENT_SECRET` | from Part B |
   | `GMAIL_TOKEN` | from Part B |
   | `GENERATOR_URL` | the frontend's public URL from Part A (no trailing slash) |
4. Deploy. Watch the **Deploy Logs** — you should see:
   ```
   Worker started. Polling every 5 min. Generator: https://your-generator.up.railway.app
   No unread emails with PDF attachments.
   ```

> 💡 **Tip:** in Railway you can reference the frontend's URL automatically by setting
> `GENERATOR_URL=https://${{frontend.RAILWAY_PUBLIC_DOMAIN}}` (replace `frontend` with that
> service's name) so it stays in sync.

---

## Testing end-to-end

1. From any account, send an email **to the connected Gmail** with:
   - a **PDF** 485 / Plan of Care attached, and
   - a body like:
     ```
     Nurse: Gayane Maneyan / LVN
     Visits:
     06/02/2026  9:00 AM - 10:00 AM
     06/05/2026  9:00 AM - 10:00 AM
     06/09/2026  1:00 PM - 2:00 PM
     ```
2. Within 5 minutes the worker processes it. Check the worker logs.
3. You'll receive a reply on the same thread with the generated PDFs, and the original
   email becomes **read**.

---

## Local development (optional)

**Frontend:**
```bash
cd frontend
npm install
# terminal 1 — proxy server
ANTHROPIC_API_KEY=sk-ant-... node server.js
# terminal 2 — vite dev server (proxies /api to :3001)
npm run dev          # http://localhost:5173
```
Or test the production path: `npm run build && ANTHROPIC_API_KEY=... npm start` → http://localhost:3001

**Automation:**
```bash
cd automation
npm install
# set env vars (or use a .env loader), then:
GENERATOR_URL=https://your-generator.up.railway.app \
ANTHROPIC_API_KEY=... GMAIL_CLIENT_ID=... GMAIL_CLIENT_SECRET=... GMAIL_TOKEN=... \
node automation.js
```
Puppeteer will download its own Chromium locally (the Docker image instead uses system Chromium via `PUPPETEER_EXECUTABLE_PATH`).

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Worker: `Missing required env var: GMAIL_TOKEN` | Set all Gmail vars on the **automation** service. |
| Worker: `invalid_grant` | Refresh token expired/revoked or app still in "Testing" with no test user — re-mint in Playground; add your email as a Test user. |
| Worker: `GENERATOR_URL is not set` | Add it to the automation service variables. |
| Puppeteer: `Could not find Chromium` | Ensure the automation Dockerfile built (installs `chromium`) and `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium` is set (it is, in the Dockerfile). |
| Generator `/api/claude` 500 | `ANTHROPIC_API_KEY` missing on the **frontend** service. |
| Timed out waiting for `485 extraction` | The PDF wasn't readable, or the API key is wrong; check frontend logs. |
| Email not picked up | Must be **unread**, have a real **PDF** attachment, and match `has:attachment filename:pdf`. |

---

## Notes & assumptions

- **Output is PDF.** Your generator downloads `.html` (meant to be printed to PDF). The worker
  renders each note to a true A4 PDF with Chrome's print engine, so replies carry PDFs.
- **Agency name** comes from the **PDF** (per your spec); **nurse name / dates / times** come
  from the **email body**.
- If an email yields **no dates**, the worker logs it and leaves it **unread** for manual handling
  rather than sending an empty reply.
- Vital signs are auto-randomized by the generator (unchanged from your original).
