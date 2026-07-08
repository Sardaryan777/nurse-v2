// ── Puppeteer driver for the generator website ───────────────────────────────
// Opens GENERATOR_URL, uploads the PDF, fills fields via the page's
// window.__automation bridge, clicks Generate, then renders every generated
// HTML note to a real PDF using headless Chrome's print engine.
import puppeteer from "puppeteer";
import fs from "fs/promises";
import os from "os";
import path from "path";

const launchOpts = {
  headless: "new",
  args: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--no-zygote",
    "--single-process",
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

/**
 * Drive the generator end-to-end.
 * @param {Object} opts
 * @param {string} opts.url            GENERATOR_URL
 * @param {Buffer} opts.pdfBuffer      the source 485 PDF
 * @param {string} opts.pdfFilename
 * @param {string} opts.agencyName
 * @param {string} opts.nurseName      default nurse (used when a date has no specific nurse)
 * @param {string[]} opts.dates        ["MM/DD/YYYY", ...]
 * @param {Object} opts.times          { "MM/DD/YYYY": {inH,inM,inAP,outH,outM,outAP} }
 * @param {Object} [opts.nurses]       { "MM/DD/YYYY": "Nurse Name / LVN" } per-visit nurses
 * @returns {Promise<Array<{filename:string, buffer:Buffer}>>} generated PDFs
 */
export async function runGenerator(opts) {
  const { url, pdfBuffer, pdfFilename, agencyName, nurseName, dates, times, nurses = {} } = opts;

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

    // 3. Select all dates + fill times + assign each visit its nurse.
    await page.evaluate((ds, tmap, nmap) => {
      window.__automation.setDates(ds);
      window.__automation.setTimes(tmap);
      if (window.__automation.setVisitNurses) window.__automation.setVisitNurses(nmap);
    }, dates, times, nurses);

    // Give React a moment to commit state.
    await sleep(500);
    await waitForState(page, s => s.dates.length === dates.length, { timeout: 15000, label: "dates applied" });

    // 4. Extract the 485 (needed before generation can run).
    await page.evaluate(() => window.__automation.extract());
    await waitForState(page, s => !s.extracting && s.hasPoc, { timeout: 180000, label: "485 extraction" });

    // Re-assert agency name (extraction clears poc/notes but not agency; safe to repeat).
    await page.evaluate((a) => window.__automation.setAgency(a), agencyName || "");
    await sleep(300);

    // 5. Click Generate and wait for completion.
    // Each note is its own Claude call, so scale the timeout with the number of
    // dates (~20s per note) with a 5-minute floor.
    const genTimeout = Math.max(300000, dates.length * 20000);
    await page.evaluate(() => window.__automation.generate());
    const finalState = await waitForState(
      page,
      s => !s.generating && s.noteCount > 0,
      { timeout: genTimeout, label: "note generation" }
    );

    // 6. Retrieve generated HTML for every note.
    const notesHTML = await page.evaluate(() => window.__automation.getNotesHTML());
    if (!notesHTML.length) throw new Error("Generator produced no notes");

    // 7. Render each HTML note to a real PDF via the print engine.
    const pdfs = [];
    for (const note of notesHTML) {
      const p = await browser.newPage();
      await p.setContent(note.html, { waitUntil: "networkidle0", timeout: 30000 });
      const buffer = await p.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "10mm", bottom: "10mm", left: "8mm", right: "8mm" }
      });
      await p.close();
      pdfs.push({
        filename: note.filename.replace(/\.html$/i, ".pdf"),
        buffer: Buffer.from(buffer)
      });
    }

    console.log(`Rendered ${pdfs.length} PDF(s) for ${finalState.dates.length} date(s).`);
    return pdfs;
  } finally {
    await browser.close();
    fs.unlink(tmpPdf).catch(() => {});
  }
}
