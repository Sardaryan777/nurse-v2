// ── Puppeteer driver for the generator website ───────────────────────────────
// Opens GENERATOR_URL, uploads the PDF, fills fields via the page's
// window.__automation bridge, clicks Generate, then renders every generated
// HTML note to a real PDF using headless Chrome's print engine.
import puppeteer from "puppeteer";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { PDFDocument } from "pdf-lib";
import { embedBatchInPdf } from "./batchstore.js";

const launchOpts = {
  headless: "new",
  // Large batches keep the browser busy well past Puppeteer's 180s default;
  // raise the CDP protocol timeout so long generations don't error out.
  protocolTimeout: 600000,
  args: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--disable-software-rasterizer",
    "--disable-extensions"
  ]
};
if (process.env.PUPPETEER_EXECUTABLE_PATH) {
  launchOpts.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Poll page state until predicate(state) is true or timeout.
async function waitForState(page, predicate, { timeout = 180000, interval = 1500, label = "" } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const state = await page.evaluate(() => window.__automation?.getState?.() || null);
    if (state?.error) throw new Error(`Generator reported error${label ? " (" + label + ")" : ""}: ${state.error}`);
    if (state && predicate(state)) return state;
    await sleep(interval);
  }
  throw new Error(`Timed out waiting for generator state${label ? ": " + label : ""}`);
}

// Wait for note generation to settle WITHOUT throwing on error — an error/skip
// here (e.g. all dates outside the cert period) is a valid outcome the caller
// inspects. Returns the final state.
async function waitForSettle(page, timeout) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const s = await page.evaluate(() => window.__automation?.getState?.() || null);
    if (s && !s.generating && !s.extracting) {
      if (s.noteCount > 0 || (s.skippedDates && s.skippedDates.length > 0) || s.error) return s;
    }
    await sleep(1500);
  }
  throw new Error("Timed out waiting for note generation");
}

/**
 * Drive the generator end-to-end.
 * @param {Object} opts
 * @param {string} opts.url            GENERATOR_URL
 * @param {Buffer} opts.pdfBuffer      the source 485 PDF
 * @param {string} opts.pdfFilename
 * @param {string} opts.agencyName
 * @param {string} opts.nurseName      default nurse (used when a date has no specific nurse)
 * @param {Array}  opts.visits         [{ date:"MM/DD/YYYY", timeIn:"HH:MM AM", timeOut:"HH:MM PM" }] — duplicates (AM+PM) allowed
 * @param {Object} [opts.nurses]       { "MM/DD/YYYY": "Nurse Name / LVN" } per-visit nurses
 * @param {boolean} [opts.bid]         "BID" in email subject -> check BID Patient box
 * @param {boolean} [opts.wound]       "Wound" in email subject -> check Wound mode box
 * @returns {Promise<{pdfs:Array,noteCount:number,skippedDates:string[],certPeriod:object}>}
 */
export async function runGenerator(opts) {
  const { url, pdfBuffer, pdfFilename, agencyName, nurseName, visits, nurses = {}, bid = false, wound = false } = opts;

  // Write PDF to a temp file so the native file input can accept it.
  const tmpPdf = path.join(os.tmpdir(), `poc-${Date.now()}.pdf`);
  await fs.writeFile(tmpPdf, pdfBuffer);

  const browser = await puppeteer.launch(launchOpts);
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(60000);
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

    // Wait for the automation bridge to be installed by React.
    await page.waitForFunction(() => window.__automation?.ready === true, { timeout: 30000 });

    // 1. Upload the PDF into the upload section (native file input).
    const fileInput = await page.waitForSelector('[data-testid="file-input"]', { timeout: 15000 });
    await fileInput.uploadFile(tmpPdf);
    await waitForState(page, s => s.hasFile, { timeout: 15000, label: "file upload" });

    // 2. Fill agency + nurse names.
    await page.evaluate((a, n) => {
      window.__automation.setAgency(a);
      window.__automation.setNurse(n);
    }, agencyName || "", nurseName || "");

    // 3. Send the full visit list (AM+PM duplicates preserved, each visit may
    //    carry its own nurseName) + BID + Wound flags from the email subject.
    await page.evaluate((vlist, nmap, bidFlag, woundFlag) => {
      if (window.__automation.setVisits) window.__automation.setVisits(vlist);
      if (window.__automation.setVisitNurses) window.__automation.setVisitNurses(nmap);
      if (window.__automation.setBID) window.__automation.setBID(bidFlag);
      if (window.__automation.setWound) window.__automation.setWound(woundFlag);
    }, visits, nurses, bid, wound);

    // Give React a moment to commit state.
    await sleep(500);
    await waitForState(page, s => s.bulkCount === visits.length, { timeout: 15000, label: "visits applied" });

    // 4. Extract the 485 (needed before generation can run).
    await page.evaluate(() => window.__automation.extract());
    await waitForState(page, s => !s.extracting && s.hasPoc, { timeout: 180000, label: "485 extraction" });

    // Re-assert agency name (extraction clears poc/notes but not agency; safe to repeat).
    await page.evaluate((a) => window.__automation.setAgency(a), agencyName || "");
    await sleep(300);

    // 5. Click Generate and wait for it to settle.
    // Each note is its own Claude call, so scale the timeout with the number of
    // dates (~20s per note) with a 5-minute floor. Generation "settles" when it
    // stops running and either produced notes, skipped every date (all outside
    // the cert period), or reported an error.
    const genTimeout = Math.max(300000, visits.length * 20000);
    await page.evaluate(() => window.__automation.generate());
    const finalState = await waitForSettle(page, genTimeout);

    const skippedDates = finalState.skippedDates || [];
    const certPeriod = finalState.certPeriod || { start: "", end: "" };

    const noteCount = finalState.noteCount || 0;

    // 6. If nothing was generated:
    if (noteCount === 0) {
      // All dates outside the cert period is a valid outcome — report it back
      // so the worker can reply to the email explaining the mismatch.
      if (skippedDates.length > 0) {
        console.log(`No notes generated — all ${skippedDates.length} date(s) outside cert period ${certPeriod.start}–${certPeriod.end}.`);
        return { pdfs: [], noteCount: 0, skippedDates, certPeriod };
      }
      throw new Error(finalState.error || "Generator produced no notes");
    }

    // Capture the batch as plain data so a later "Correction" email can be
    // applied to these exact notes (stored as a sidecar on the reply).
    const batch = await page.evaluate(() => window.__automation.getNotesData?.() || null);

    // 7-8. Render + merge through the SAME layout engine every other note type
    // uses (see renderNotesToPdf) — no per-type geometry, no scaling.
    const notesHTML = await page.evaluate(() => window.__automation.getNotesHTML());

    // Name the combined file after the patient.
    const pm = (notesHTML[0]?.filename || "").match(/^Note-(.+?)-\d{2}-\d{2}-\d{4}/i);
    const patientTag = pm ? pm[1] : "patient";
    const mergedName = `Notes-${patientTag}-${noteCount}-visits.pdf`;

    const mergedPdf = await renderNotesToPdf(browser, notesHTML, mergedName);

    // Tuck the structured batch into the PDF's metadata so a later Correction
    // email can work from this exact file — no extra attachment needed.
    mergedPdf.buffer = await embedBatchInPdf(mergedPdf.buffer, batch);
    const pdfs = [mergedPdf];

    if (skippedDates.length) console.log(`Skipped ${skippedDates.length} date(s) outside cert period: ${skippedDates.join(", ")}`);
    console.log(`Merged ${noteCount} note(s) into 1 PDF: ${mergedName}`);
    return { pdfs, noteCount, skippedDates, certPeriod, batch };
  } finally {
    await browser.close();
    fs.unlink(tmpPdf).catch(() => {});
  }
}

// ── THE ONE PDF LAYOUT ENGINE ───────────────────────────────────────────────
// Every note type — regular, discharge, wound, BID/injection, correction, long
// teaching — is rendered through THIS function and nothing else, so they all
// get identical geometry.
//
// Rules (deliberate):
//  • NO scaling. page.pdf({scale}) shrank long notes into a corner of the sheet
//    and left the white space this replaces. Content is never zoomed.
//  • NO margin option here. The note's own @page rule is the single source of
//    truth, so the PDF matches what you get printing the HTML from a browser.
//  • Viewport = full A4 at 96dpi so the form lays out at true page width.
async function renderNotesToPdf(browser, notesHTML, mergedName) {
  // ORIGINAL A4 geometry — the one that produced the good-looking notes:
  // fixed A4 page, 8mm sides / 10mm top-bottom, viewport at the content width.
  const CONTENT_W = 733;    // printable width (px @96dpi)
  const USABLE_H  = 1040;   // printable height, with a small safety margin
  const PDF_OPTS = {
    format: "A4",
    printBackground: true,
    margin: { top: "10mm", bottom: "10mm", left: "8mm", right: "8mm" },
    pageRanges: "1"         // one note = one page
  };

  // Overflow handling: tighten LINE-HEIGHT and SECTION SPACING step by step
  // until the note fits. Font size never changes and the form keeps the full
  // page width — unlike page scaling, which shrank it into a corner of the
  // sheet and left the white space.
  const compactCss = (lv) => `
    .hdr{margin-bottom:${Math.max(1, 3 - lv * 0.4).toFixed(2)}pt !important}
    .cols{padding-top:${Math.max(1, 3 - lv * 0.4).toFixed(2)}pt !important}
    .left{line-height:${Math.max(1.08, 1.32 - lv * 0.04).toFixed(3)} !important}
    .right{line-height:${Math.max(1.10, 1.35 - lv * 0.04).toFixed(3)} !important}
    .sec{margin-bottom:${Math.max(0.4, 2.5 - lv * 0.35).toFixed(2)}pt !important}
    .intv{margin-bottom:${Math.max(0.4, 2.5 - lv * 0.35).toFixed(2)}pt !important;
          line-height:${Math.max(1.08, 1.32 - lv * 0.04).toFixed(3)} !important}
    .sm{margin-bottom:${Math.max(0.3, 2 - lv * 0.28).toFixed(2)}pt !important;
        line-height:${Math.max(1.06, 1.28 - lv * 0.04).toFixed(3)} !important}
    .bgrid{margin-top:${Math.max(1, 3 - lv * 0.4).toFixed(2)}pt !important}
  `;

  const pagePdfs = [];
  let compacted = 0;

  for (const note of notesHTML) {
    const p = await browser.newPage();
    await p.setViewport({ width: CONTENT_W, height: 1123, deviceScaleFactor: 1 });
    await p.setContent(note.html, { waitUntil: "networkidle0", timeout: 30000 });
    // Don't let the whole two-column body move as one unbreakable unit.
    await p.addStyleTag({ content: ".cols,.left,.right{page-break-inside:auto!important;break-inside:auto!important}" });

    const measure = () => p.evaluate(() => Math.ceil(document.body.scrollHeight));
    let h = await measure();
    let lv = 0;
    while (h > USABLE_H && lv < 6) {
      lv++;
      await p.addStyleTag({ content: compactCss(lv) });
      h = await measure();
    }
    if (lv > 0) compacted++;

    const buffer = await p.pdf(PDF_OPTS);
    await p.close();
    pagePdfs.push(Buffer.from(buffer));
  }
  if (compacted) console.log(`  ${compacted} note(s) auto-compacted to fit one page (font size unchanged).`);

  const merged = await PDFDocument.create();
  for (const buf of pagePdfs) {
    const src = await PDFDocument.load(buf);
    const copied = await merged.copyPages(src, src.getPageIndices());
    copied.forEach(pg => merged.addPage(pg));
  }
  return { filename: mergedName, buffer: Buffer.from(await merged.save()) };
}

/**
 * CORRECTION MODE: render an already-corrected note batch to PDF.
 * No AI generation happens here — the notes are loaded verbatim, so anything
 * the correction didn't touch comes out exactly as it was.
 * @param {string} url            GENERATOR_URL
 * @param {Object} batch          { agencyName, snName, poc, notes:[...] }
 * @param {number[]} [onlyIdx]    render only these note indexes (corrected-only output)
 * @returns {Promise<{pdfs:Array, noteCount:number}>}
 */
export async function renderCorrectedBatch(url, batch, onlyIdx = null) {
  const browser = await puppeteer.launch(launchOpts);
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(60000);
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
    await page.waitForFunction(() => window.__automation?.ready === true, { timeout: 30000 });

    const ok = await page.evaluate((b) => window.__automation.setNotesData?.(b) === true, batch);
    if (!ok) throw new Error("Generator could not load the corrected note batch (setNotesData unavailable — is the site updated?)");
    await sleep(600);

    let notesHTML = await page.evaluate(() => window.__automation.getNotesHTML());
    if (!notesHTML.length) throw new Error("Corrected batch produced no notes");

    const patient = (batch.notes?.[0]?.poc?.patient?.name || batch.poc?.patient?.name || "patient").replace(/[\s,]+/g, "-");
    let name = `Notes-CORRECTED-${patient}-${notesHTML.length}-visits.pdf`;

    if (Array.isArray(onlyIdx) && onlyIdx.length) {
      notesHTML = onlyIdx.filter(i => i >= 0 && i < notesHTML.length).map(i => notesHTML[i]);
      name = `Notes-CORRECTED-${patient}-${notesHTML.length}-note${notesHTML.length > 1 ? "s" : ""}.pdf`;
    }

    const pdf = await renderNotesToPdf(browser, notesHTML, name);
    // Carry the corrected batch forward so THIS file can be corrected again.
    pdf.buffer = await embedBatchInPdf(pdf.buffer, batch);
    console.log(`Rendered corrected PDF: ${name} (${notesHTML.length} note(s)).`);
    return { pdfs: [pdf], noteCount: notesHTML.length };
  } finally {
    await browser.close();
  }
}
