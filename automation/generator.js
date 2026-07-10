// ── Puppeteer driver for the generator website ───────────────────────────────
// Opens GENERATOR_URL, uploads the PDF, fills fields via the page's
// window.__automation bridge, clicks Generate, then renders every generated
// HTML note to a real PDF using headless Chrome's print engine.
import puppeteer from "puppeteer";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { PDFDocument } from "pdf-lib";

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
 * @returns {Promise<{pdfs:Array,noteCount:number,skippedDates:string[],certPeriod:object}>}
 */
export async function runGenerator(opts) {
  const { url, pdfBuffer, pdfFilename, agencyName, nurseName, visits, nurses = {}, bid = false } = opts;

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

    // 3. Send the full visit list (AM+PM duplicates preserved) + nurses + BID.
    await page.evaluate((vlist, nmap, bidFlag) => {
      if (window.__automation.setVisits) window.__automation.setVisits(vlist);
      if (window.__automation.setVisitNurses) window.__automation.setVisitNurses(nmap);
      if (window.__automation.setBID) window.__automation.setBID(bidFlag);
    }, visits, nurses, bid);

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

    // 7. Retrieve generated HTML (already oldest→newest) and render each to PDF.
    // Each note MUST be exactly one A4 page. If a note (e.g. a BID note with
    // injection text) is taller than the printable area, scale it down just
    // enough to fit — "write it a little smaller to fit one page".
    const notesHTML = await page.evaluate(() => window.__automation.getNotesHTML());
    const pagePdfs = [];
    // A4 @96dpi = 793.7 x 1122.5px; minus 8mm side + 10mm top/bottom margins.
    const CONTENT_W = 733;   // printable width  (px)
    const PRINTABLE_H = 1040; // printable height (px, with a small safety margin)
    for (const note of notesHTML) {
      const p = await browser.newPage();
      await p.setViewport({ width: CONTENT_W, height: 1123, deviceScaleFactor: 1 });
      await p.setContent(note.html, { waitUntil: "networkidle0", timeout: 30000 });
      // Don't let the whole column block jump to page 2 as one unit.
      await p.addStyleTag({ content: ".cols,.left,.right{page-break-inside:auto!important;break-inside:auto!important}" });
      // Measure the note's natural height and compute a shrink factor if needed.
      const contentH = await p.evaluate(() => Math.ceil(document.body.scrollHeight));
      const scale = contentH > PRINTABLE_H ? Math.max(0.55, PRINTABLE_H / contentH) : 1;
      const buffer = await p.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "10mm", bottom: "10mm", left: "8mm", right: "8mm" },
        scale,
        pageRanges: "1"   // hard guarantee: never more than one page per note
      });
      await p.close();
      if (scale < 1) console.log(`  Note scaled to ${(scale*100).toFixed(0)}% to fit one page (was ${contentH}px).`);
      pagePdfs.push(Buffer.from(buffer));
    }

    // 8. Merge ALL notes into a SINGLE PDF (one page per note, oldest→newest).
    const merged = await PDFDocument.create();
    for (const buf of pagePdfs) {
      const src = await PDFDocument.load(buf);
      const copied = await merged.copyPages(src, src.getPageIndices());
      copied.forEach(pg => merged.addPage(pg));
    }
    const mergedBytes = await merged.save();

    // Name the combined file after the patient.
    const pm = (notesHTML[0]?.filename || "").match(/^Note-(.+?)-\d{2}-\d{2}-\d{4}/i);
    const patientTag = pm ? pm[1] : "patient";
    const mergedName = `Notes-${patientTag}-${noteCount}-visits.pdf`;

    const pdfs = [{ filename: mergedName, buffer: Buffer.from(mergedBytes) }];

    if (skippedDates.length) console.log(`Skipped ${skippedDates.length} date(s) outside cert period: ${skippedDates.join(", ")}`);
    console.log(`Merged ${noteCount} note(s) into 1 PDF: ${mergedName}`);
    return { pdfs, noteCount, skippedDates, certPeriod };
  } finally {
    await browser.close();
    fs.unlink(tmpPdf).catch(() => {});
  }
}
