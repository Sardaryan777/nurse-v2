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
  markRead,
  findBatchInThread,
  getBatchFromMessage,
  BATCH_FILENAME
} from "./gmail.js";
import { extractAgencyName, extractVisitsFromEmail, splitTime } from "./extract.js";
import { runGenerator, renderCorrectedBatch } from "./generator.js";
import { parseCorrectionInstructions, applyCorrections, summarizeBatch } from "./correction.js";

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const GENERATOR_URL = process.env.GENERATOR_URL;

// Avoid double-processing within a single process lifetime.
const processed = new Set();

function log(...args) {
  console.log(`[${new Date().toISOString()}]`, ...args);
}

// Build the generator's date list + times map + per-date nurse map from visits.
// One visit entry = one date/time + one nurse name + one generated note.
function buildScheduleInputs(visits) {
  const dates = [];
  const times = {};
  const nurses = {};
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
    if (v.nurseName) nurses[dk] = v.nurseName;
  }
  // de-dup dates while keeping times/nurses
  return { dates: [...new Set(dates)], times, nurses };
}

// ── CORRECTION WORKFLOW ────────────────────────────────────────────────────
// Locate the original note batch, let Claude reason about what to change,
// apply it, re-render, and reply. Never guesses: if the batch can't be found
// or an instruction is ambiguous, it replies with a clear error instead.
async function processCorrection(gmail, msg) {
  const replyErr = async (text) => {
    await replyWithAttachments(gmail, msg, { text: `${text}\n\n— Automated Clinical Note Generator`, attachments: [] });
    log(`  Correction not applied: ${text.split("\n")[0]}`);
  };

  // 1. Find the original notes: attached to this email, else earlier in the thread.
  let batch = await getBatchFromMessage(gmail, msg.id);
  if (batch) log(`  Using note batch attached to this email.`);
  if (!batch) {
    batch = await findBatchInThread(gmail, msg.threadId);
    if (batch) log(`  Recovered original note batch from the email thread.`);
  }
  if (!batch || !Array.isArray(batch.notes) || !batch.notes.length) {
    return replyErr(
      "Cannot apply correction: the original note file was not attached and no previous note batch was found in this email thread.\n\n" +
      "Please reply to the email that contained the generated notes (so the batch travels with the thread), or attach the original " +
      `"${BATCH_FILENAME}" file that came with them.`
    );
  }
  log(`  Original batch: ${batch.notes.length} note(s).`);

  // 2. Ask Claude which notes each instruction targets and what changes.
  let parsed;
  try {
    parsed = await parseCorrectionInstructions(msg.bodyText || "", summarizeBatch(batch));
  } catch (err) {
    return replyErr(`Cannot apply correction: the instructions could not be interpreted (${err.message}). Please restate the correction with the visit date, time, and what should change.`);
  }
  log(`  Parsed corrections: ${parsed.changes.length} change(s)${parsed.regenerateAll ? " (regenerate all requested)" : ""}.`);

  if (!parsed.changes.length) {
    const problems = [...parsed.ambiguous, ...parsed.unmatched];
    return replyErr(
      "Cannot apply correction: no note matched the instructions." +
      (problems.length ? `\n\n${problems.join("\n")}` : "") +
      "\n\nPlease include the visit date (and time if that date has two visits) with each correction."
    );
  }

  // 3. Apply, with narrative rewritten so each note stays internally consistent.
  const { notes, applied, errors } = await applyCorrections(batch, parsed);
  const corrected = { ...batch, notes };

  // 4. Re-render. Only the touched notes unless the change is global.
  const touched = [...new Set(parsed.changes.map(c => c.noteIndex).filter(i => typeof i === "number"))].sort((a, b) => a - b);
  const globalChange = parsed.regenerateAll || parsed.changes.some(c => c?.fields?.discharge != null);
  const onlyIdx = (!globalChange && touched.length && touched.length <= 2) ? touched : null;

  let rendered;
  try {
    rendered = await renderCorrectedBatch(GENERATOR_URL, corrected, onlyIdx);
  } catch (err) {
    return replyErr(`Cannot apply correction: the corrected notes could not be rendered (${err.message}).`);
  }

  // 5. Reply with the corrected PDF + the refreshed batch sidecar.
  let text = `Hello,\n\nCorrections applied${parsed.summary ? ` — ${parsed.summary}` : ""}.\n\n`;
  text += applied.length ? `Applied:\n${applied.map(a => "• " + a).join("\n")}\n\n` : "";
  if (errors.length) text += `⚠️ Not applied:\n${errors.map(e => "• " + e).join("\n")}\n\n`;
  text += onlyIdx
    ? `Attached: the ${rendered.noteCount} corrected note(s) only. All other notes are unchanged.\n\n`
    : `Attached: the full corrected batch (${rendered.noteCount} notes).\n\n`;
  text += `— Automated Clinical Note Generator`;

  await replyWithAttachments(gmail, msg, {
    text,
    attachments: [
      ...rendered.pdfs,
      { filename: BATCH_FILENAME, mimeType: "application/json", buffer: Buffer.from(JSON.stringify(corrected), "utf8") }
    ]
  });
  log(`  Replied with corrected PDF (${rendered.noteCount} note(s))${errors.length ? `, ${errors.length} issue(s) reported` : ""}.`);
}

async function processMessage(gmail, messageRef) {
  if (processed.has(messageRef.id)) return;

  const msg = await getMessageDetails(gmail, messageRef.id);

  // ── CORRECTION MODE ─────────────────────────────────────────────────────
  // Subject contains "correction" (any case) -> the body is correction
  // instructions for notes we already generated, NOT a new-notes request.
  if (/correction/i.test(msg.subject || "")) {
    log(`Processing CORRECTION email from ${msg.from} — "${msg.subject}"`);
    processed.add(msg.id);
    await markRead(gmail, msg.id);
    await processCorrection(gmail, msg);
    return;
  }

  if (!msg.pdf) {
    log(`Message ${messageRef.id} has no PDF attachment after inspection — skipping.`);
    return;
  }

  // Never re-process our OWN generated notes (their filename looks like
  // "Note-PATIENT-MM-DD-YYYY-....pdf"). This prevents a reply loop where the
  // robot picks up the notes it just sent and treats them as a new 485.
  if (/^Notes?-.+?-\d{2}-\d{2}-\d{4}|^Notes-(CORRECTED-)?.+-\d+-(visits|notes?)\.pdf$/i.test(msg.pdf.filename || "")) {
    log(`Attachment "${msg.pdf.filename}" is a generated note (our own output) — skipping + marking read.`);
    await markRead(gmail, msg.id);
    return;
  }

  log(`Processing email from ${msg.from} — "${msg.subject}" (PDF: ${msg.pdf.filename})`);

  // ── LOCK IMMEDIATELY ────────────────────────────────────────────────────
  // Generation takes several minutes; mark the email read + record it NOW so a
  // second poll (or a duplicate worker) can't grab the same email and generate
  // everything a second time. This is what prevents duplicate sends.
  processed.add(msg.id);
  await markRead(gmail, msg.id);

  // 3. Agency name from the PDF.
  const agencyName = await extractAgencyName(msg.pdf.buffer);
  log(`  Agency: ${agencyName || "(none found)"}`);

  // 4. Nurses + visits from the email body (each visit may have its own nurse).
  const { nurseName, visits } = await extractVisitsFromEmail(msg.bodyText || "");
  const uniqueNurses = [...new Set(visits.map(v => v.nurseName).filter(Boolean))];
  log(`  Default nurse: ${nurseName || "(none)"} · Visits: ${visits.length} · Nurses on schedule: ${uniqueNurses.join(", ") || "(none)"}`);
  if (!visits.length) {
    log("  No visit dates found in email body — skipping (leaving unread for manual review).");
    return;
  }

  // Keep the FULL visit list (AM+PM duplicates preserved for BID). Build a
  // per-date nurse map, and a unique-date list for logging/reply text.
  const nurses = {};
  for (const v of visits) { if (v.nurseName) nurses[v.date] = v.nurseName; }
  const dates = [...new Set(visits.map(v => v.date))];
  log(`  Visits: ${visits.length} across ${dates.length} date(s): ${dates.join(", ")}`);

  // "BID" in the email SUBJECT → generate as a BID patient (AM/PM pairs share a note).
  const bid = /\bBID\b/i.test(msg.subject || "");
  if (bid) log(`  "BID" in subject → BID Patient mode ON.`);

  // "Wound" in the email SUBJECT → wound care notes mode. "Wound BID" turns on both.
  const wound = /\bwound\b/i.test(msg.subject || "");
  if (wound) log(`  "Wound" in subject → Wound mode ON.`);

  // 5. Drive the generator site -> ONE merged PDF (+ any dates skipped for cert period).
  const { pdfs, noteCount = 0, skippedDates = [], certPeriod = { start: "", end: "" }, batch = null } = await runGenerator({
    url: GENERATOR_URL,
    pdfBuffer: msg.pdf.buffer,
    pdfFilename: msg.pdf.filename,
    agencyName,
    nurseName,
    visits,
    nurses,
    bid,
    wound
  });

  const certLabel = (certPeriod.start || certPeriod.end)
    ? `${certPeriod.start || "?"} – ${certPeriod.end || "?"}`
    : "the certification period on the 485";

  // 6. Reply.
  const nurseLabel = uniqueNurses.length > 1
    ? `nurses ${uniqueNurses.join(", ")}`
    : (uniqueNurses[0] || nurseName || "the nurse");

  if (pdfs.length === 0) {
    // Every visit date is outside the cert period — nothing generated.
    const text =
      `Hello,\n\nNo clinical notes were generated. All requested visit date(s) fall OUTSIDE the ` +
      `certification period of this 485 (${certLabel}).\n\n` +
      `Requested dates: ${dates.join(", ")}\n\n` +
      `Please check that the correct 485 was attached, or that the visit dates match the cert period, and resend.\n\n` +
      `— Automated Clinical Note Generator`;
    await replyWithAttachments(gmail, msg, { text, attachments: [] });
    log(`  Replied: all dates outside cert period (${certLabel}). No notes generated.`);
  } else {
    // All notes are combined into ONE merged PDF (oldest → newest).
    let text =
      `Hello,\n\nAttached is 1 combined PDF containing the ${noteCount} generated clinical note${noteCount > 1 ? "s" : ""} ` +
      `for ${nurseLabel}${agencyName ? " (" + agencyName + ")" : ""}${bid ? " (BID patient)" : ""}.\n\n` +
      `Visit dates generated (oldest → newest): ${dates.filter(d => !skippedDates.includes(d)).join(", ")}\n`;
    if (skippedDates.length) {
      text +=
        `\n⚠️ The following date(s) were NOT generated because they fall OUTSIDE the ` +
        `certification period (${certLabel}):\n${skippedDates.join(", ")}\n`;
    }
    text += `\nTo correct any of these notes, just reply to this email with "Correction" in the subject and say what should change.\n`;
    text += `\n— Automated Clinical Note Generator`;
    // Attach the batch as a small JSON sidecar so a later Correction email in
    // this thread can be applied to these exact notes.
    const attachments = [...pdfs];
    if (batch) {
      attachments.push({
        filename: BATCH_FILENAME,
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(batch), "utf8")
      });
    }
    await replyWithAttachments(gmail, msg, { text, attachments });
    log(`  Replied with 1 merged PDF (${noteCount} note${noteCount > 1 ? "s" : ""})${batch ? " + batch sidecar" : ""}.${skippedDates.length ? ` Skipped ${skippedDates.length} out-of-period date(s).` : ""}`);
  }

  // Already marked read + recorded up front (see LOCK above).
  log(`  Done.`);
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
