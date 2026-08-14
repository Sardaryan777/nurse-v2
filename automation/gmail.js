// ── Gmail helpers ────────────────────────────────────────────────────────────
// Minimal wrapper around the Gmail API for: finding unread emails with a PDF
// attachment, downloading the PDF, replying with PDF attachments, and marking
// the thread read.
import { google } from "googleapis";

const REQUIRED = ["GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_TOKEN"];

function buildAuth() {
  for (const k of REQUIRED) {
    if (!process.env[k]) throw new Error(`Missing required env var: ${k}`);
  }
  const oauth2 = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    "https://developers.google.com/oauthplayground" // redirect used to mint the token
  );

  // GMAIL_TOKEN may be a full token JSON ({refresh_token,...}) or a bare refresh token.
  let creds;
  const raw = process.env.GMAIL_TOKEN.trim();
  try {
    creds = JSON.parse(raw);
  } catch {
    creds = { refresh_token: raw };
  }
  oauth2.setCredentials(creds);
  return oauth2;
}

export function getGmail() {
  return google.gmail({ version: "v1", auth: buildAuth() });
}

// Find unread messages we should act on: either a new-notes request (PDF
// attached) or a Correction request (subject says "correction" — these often
// carry no attachment at all, just instructions).
export async function findUnreadWithPdf(gmail) {
  const res = await gmail.users.messages.list({
    userId: "me",
    q: "is:unread ((has:attachment filename:pdf) OR subject:correction)",
    maxResults: 10
  });
  return res.data.messages || [];
}

// Walk the MIME tree collecting parts.
function flattenParts(payload) {
  const out = [];
  const walk = (part) => {
    if (!part) return;
    out.push(part);
    (part.parts || []).forEach(walk);
  };
  walk(payload);
  return out;
}

function headerVal(headers, name) {
  const h = (headers || []).find(x => x.name.toLowerCase() === name.toLowerCase());
  return h ? h.value : "";
}

function decodeBody(data) {
  if (!data) return "";
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

// Pull the full message, the plain-text body, sender/subject, and the first PDF.
export async function getMessageDetails(gmail, messageId) {
  const msg = await gmail.users.messages.get({ userId: "me", id: messageId, format: "full" });
  const payload = msg.data.payload;
  const headers = payload.headers || [];
  const parts = flattenParts(payload);

  // body text (prefer text/plain, fall back to stripped html)
  let bodyText = "";
  const plain = parts.find(p => p.mimeType === "text/plain" && p.body?.data);
  if (plain) {
    bodyText = decodeBody(plain.body.data);
  } else {
    const html = parts.find(p => p.mimeType === "text/html" && p.body?.data);
    if (html) bodyText = decodeBody(html.body.data).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  }

  // first PDF attachment
  let pdf = null;
  // Correction emails can carry TWO PDFs (the generated notes + the 485), so
  // collect them all. `pdf` stays the first one for the normal new-notes path.
  const pdfs = [];
  const pdfParts = parts.filter(p =>
    (p.mimeType === "application/pdf" || (p.filename || "").toLowerCase().endsWith(".pdf")) &&
    p.body?.attachmentId
  );
  for (const part of pdfParts) {
    const att = await gmail.users.messages.attachments.get({
      userId: "me",
      messageId,
      id: part.body.attachmentId
    });
    pdfs.push({
      filename: part.filename || "document.pdf",
      buffer: Buffer.from(att.data.data.replace(/-/g, "+").replace(/_/g, "/"), "base64")
    });
  }
  pdf = pdfs[0] || null;

  return {
    id: messageId,
    threadId: msg.data.threadId,
    from: headerVal(headers, "From"),
    to: headerVal(headers, "To"),
    subject: headerVal(headers, "Subject"),
    messageIdHeader: headerVal(headers, "Message-ID"),
    references: headerVal(headers, "References"),
    bodyText,
    pdf,
    pdfs
  };
}

// Build and send a MIME reply with attachments on the same thread.
export async function replyWithAttachments(gmail, original, { text, attachments }) {
  const boundary = "==BOUNDARY_" + Date.now() + "==";
  const toAddr = original.from; // reply to sender
  const subject = original.subject?.startsWith("Re:") ? original.subject : `Re: ${original.subject || ""}`;

  const lines = [];
  lines.push(`To: ${toAddr}`);
  lines.push(`Subject: ${subject}`);
  if (original.messageIdHeader) {
    lines.push(`In-Reply-To: ${original.messageIdHeader}`);
    lines.push(`References: ${original.references ? original.references + " " : ""}${original.messageIdHeader}`);
  }
  lines.push("MIME-Version: 1.0");
  lines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
  lines.push("");
  lines.push(`--${boundary}`);
  lines.push('Content-Type: text/plain; charset="UTF-8"');
  lines.push("Content-Transfer-Encoding: 7bit");
  lines.push("");
  lines.push(text || "");
  lines.push("");

  for (const att of attachments) {
    lines.push(`--${boundary}`);
    lines.push(`Content-Type: ${att.mimeType || "application/pdf"}; name="${att.filename}"`);
    lines.push("Content-Transfer-Encoding: base64");
    lines.push(`Content-Disposition: attachment; filename="${att.filename}"`);
    lines.push("");
    lines.push(att.buffer.toString("base64").replace(/(.{76})/g, "$1\r\n"));
    lines.push("");
  }
  lines.push(`--${boundary}--`);

  const raw = Buffer.from(lines.join("\r\n"))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw, threadId: original.threadId }
  });
}

// Download every PDF attachment on a message (filename + bytes).
async function getPdfAttachments(gmail, messageId) {
  const msg = await gmail.users.messages.get({ userId: "me", id: messageId, format: "full" });
  const parts = flattenParts(msg.data.payload).filter(p =>
    (p.mimeType === "application/pdf" || (p.filename || "").toLowerCase().endsWith(".pdf")) && p.body?.attachmentId
  );
  const out = [];
  for (const p of parts) {
    const att = await gmail.users.messages.attachments.get({ userId: "me", messageId, id: p.body.attachmentId });
    out.push({
      filename: p.filename || "document.pdf",
      buffer: Buffer.from(att.data.data.replace(/-/g, "+").replace(/_/g, "/"), "base64")
    });
  }
  // Our generated batches first — they're the ones carrying the embedded data.
  return out.sort((a, b) => (/^notes?[-_]/i.test(b.filename) ? 1 : 0) - (/^notes?[-_]/i.test(a.filename) ? 1 : 0));
}

// Walk a thread newest-first and recover the note batch hidden inside the most
// recent generated PDF. This is how Correction mode finds the original notes
// without a database and without emailing the user a separate data file.
export async function findBatchInThread(gmail, threadId, readBatchFromPdf) {
  if (!threadId) return null;
  const thread = await gmail.users.threads.get({ userId: "me", id: threadId, format: "minimal" });
  const ids = (thread.data.messages || []).map(m => m.id).reverse(); // newest first
  for (const id of ids) {
    try {
      for (const pdf of await getPdfAttachments(gmail, id)) {
        const batch = await readBatchFromPdf(pdf.buffer);
        if (batch) return batch;
      }
    } catch { /* keep looking */ }
  }
  return null;
}

export async function markRead(gmail, messageId) {
  await gmail.users.messages.modify({
    userId: "me",
    id: messageId,
    requestBody: { removeLabelIds: ["UNREAD"] }
  });
}
