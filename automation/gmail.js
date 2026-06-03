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

// Find unread messages that carry a PDF attachment.
export async function findUnreadWithPdf(gmail) {
  const res = await gmail.users.messages.list({
    userId: "me",
    q: "is:unread has:attachment filename:pdf",
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
  const pdfPart = parts.find(p =>
    (p.mimeType === "application/pdf" || (p.filename || "").toLowerCase().endsWith(".pdf")) &&
    p.body?.attachmentId
  );
  if (pdfPart) {
    const att = await gmail.users.messages.attachments.get({
      userId: "me",
      messageId,
      id: pdfPart.body.attachmentId
    });
    pdf = {
      filename: pdfPart.filename || "document.pdf",
      buffer: Buffer.from(att.data.data.replace(/-/g, "+").replace(/_/g, "/"), "base64")
    };
  }

  return {
    id: messageId,
    threadId: msg.data.threadId,
    from: headerVal(headers, "From"),
    to: headerVal(headers, "To"),
    subject: headerVal(headers, "Subject"),
    messageIdHeader: headerVal(headers, "Message-ID"),
    references: headerVal(headers, "References"),
    bodyText,
    pdf
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
    lines.push(`Content-Type: application/pdf; name="${att.filename}"`);
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

export async function markRead(gmail, messageId) {
  await gmail.users.messages.modify({
    userId: "me",
    id: messageId,
    requestBody: { removeLabelIds: ["UNREAD"] }
  });
}
