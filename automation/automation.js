// ── Nursing automation worker ────────────────────────────────────────────────
// Every 5 minutes:
//   1. Check Gmail for unread emails with a PDF attachment
//   2. Download the PDF
//   3. Claude extracts the agency name from the PDF
//   4. Claude reads the email body -> nurse name, all dates, all times
//   5. Puppeteer opens the generator site, uploads PDF, fills fields,
//      selects all dates, fills times, clicks Generate, waits, gets files
//   6. Reply to the original email with all generated PDFs attached
//   7. Mark the email as read
import {
  getGmail,
  findUnreadWithPdf,
  getMessageDetails,
  replyWithAttachments,
  markRead
} from "./gmail.js";
import { extractAgencyName, extractVisitsFromEmail, splitTime } from "./extract.js";
import { runGenerator } from "./generator.js";

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const GENERATOR_URL = process.env.GENERATOR_URL;

// Avoid double-processing within a single process lifetime.
const processed = new Set();

function log(...args) {
  console.log(`[${new Date().toISOString()}]`, ...args);
}

// Build the generator's date list + times map from extracted visits.
function buildScheduleInputs(visits) {
  const dates = [];
  const times = {};
  for (const v of visits) {
    if (!v.date) continue;
    const dk = v.date.trim();
    dates.push(dk);
    const tin = splitTime(v.timeIn);
    const tout = splitTime(v.timeOut);
    times[dk] = {
      inH: tin.h, inM: tin.m, inAP: tin.ap,
      outH: tout.h, outM: tout.m, outAP: tout.ap
    };
  }
  // de-dup dates while keeping times
  return { dates: [...new Set(dates)], times };
}

async function processMessage(gmail, messageRef) {
  if (processed.has(messageRef.id)) return;

  const msg = await getMessageDetails(gmail, messageRef.id);
  if (!msg.pdf) {
    log(`Message ${messageRef.id} has no PDF attachment after inspection — skipping.`);
    return;
  }

  log(`Processing email from ${msg.from} — "${msg.subject}" (PDF: ${msg.pdf.filename})`);

  // 3. Agency name from the PDF.
  const agencyName = await extractAgencyName(msg.pdf.buffer);
  log(`  Agency: ${agencyName || "(none found)"}`);

  // 4. Nurse + visits from the email body.
  const { nurseName, visits } = await extractVisitsFromEmail(msg.bodyText || "");
  log(`  Nurse: ${nurseName || "(none)"} · Visits: ${visits.length}`);
  if (!visits.length) {
    log("  No visit dates found in email body — skipping (leaving unread for manual review).");
    return;
  }

  const { dates, times } = buildScheduleInputs(visits);
  log(`  Dates: ${dates.join(", ")}`);

  // 5. Drive the generator site -> PDFs.
  const pdfs = await runGenerator({
    url: GENERATOR_URL,
    pdfBuffer: msg.pdf.buffer,
    pdfFilename: msg.pdf.filename,
    agencyName,
    nurseName,
    dates,
    times
  });

  // 6. Reply with all PDFs attached.
  const replyText =
    `Hello,\n\nAttached are the ${pdfs.length} generated clinical note${pdfs.length > 1 ? "s" : ""} ` +
    `for ${nurseName || "the nurse"}${agencyName ? " (" + agencyName + ")" : ""}.\n\n` +
    `Visit dates: ${dates.join(", ")}\n\n` +
    `— Automated Clinical Note Generator`;

  await replyWithAttachments(gmail, msg, { text: replyText, attachments: pdfs });
  log(`  Replied with ${pdfs.length} PDF(s).`);

  // 7. Mark read.
  await markRead(gmail, msg.id);
  processed.add(msg.id);
  log(`  Marked read. Done.`);
}

async function pollOnce() {
  const gmail = getGmail();
  const messages = await findUnreadWithPdf(gmail);
  if (!messages.length) {
    log("No unread emails with PDF attachments.");
    return;
  }
  log(`Found ${messages.length} candidate email(s).`);
  for (const ref of messages) {
    try {
      await processMessage(gmail, ref);
    } catch (err) {
      log(`ERROR processing ${ref.id}: ${err.message}`);
      // leave the email unread so it can be retried / handled manually
    }
  }
}

async function main() {
  if (!GENERATOR_URL) {
    console.error("FATAL: GENERATOR_URL is not set.");
    process.exit(1);
  }
  log(`Worker started. Polling every ${POLL_INTERVAL_MS / 60000} min. Generator: ${GENERATOR_URL}`);

  // Run immediately, then on an interval. Guard against overlapping runs.
  let running = false;
  const tick = async () => {
    if (running) { log("Previous poll still running — skipping this tick."); return; }
    running = true;
    try { await pollOnce(); }
    catch (err) { log(`Poll error: ${err.message}`); }
    finally { running = false; }
  };

  await tick();
  setInterval(tick, POLL_INTERVAL_MS);
}

main();
