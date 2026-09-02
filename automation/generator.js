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
 * @param {boolean} [opts.word]        "Word" in email subject -> deliver .docx instead of PDF
 * @returns {Promise<{pdfs:Array,noteCount:number,skippedDates:string[],certPeriod:object}>}
 */
export async function runGenerator(opts) {
  const { url, pdfBuffer, pdfFilename, agencyName, nurseName, nurses = {}, bid = false, wound = false, word = false, requestedNotes = 0 } = opts;
  let visits = opts.visits || [];
  // "9 notes" with no dates: generate that many undated notes.
  const undated = visits.length === 0 && requestedNotes > 0;

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
    const siteVersion = await page.evaluate(() => window.__automation.version || 0);
    console.log(`Generator site bridge version: ${siteVersion}`);

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
    await page.evaluate((vlist, nmap, bidFlag, woundFlag, isUndated) => {
      if (!isUndated && window.__automation.setVisits) window.__automation.setVisits(vlist);
      if (window.__automation.setVisitNurses) window.__automation.setVisitNurses(nmap);
      if (window.__automation.setBID) window.__automation.setBID(bidFlag);
      if (window.__automation.setWound) window.__automation.setWound(woundFlag);
    }, visits, nurses, bid, wound, undated);

    // Give React a moment to commit state.
    await sleep(500);
    if (!undated) {
      await waitForState(page, s => s.bulkCount === visits.length, { timeout: 15000, label: "visits applied" });
    }

    // 4. Extract the 485 (needed before generation can run).
    await page.evaluate(() => window.__automation.extract());
    await waitForState(page, s => !s.extracting && s.hasPoc, { timeout: 180000, label: "485 extraction" });

    // Re-assert agency name (extraction clears poc/notes but not agency; safe to repeat).
    await page.evaluate((a) => window.__automation.setAgency(a), agencyName || "");
    await sleep(300);

    // 4b. UNDATED MODE: the email asked for N notes with no dates. The cert
    //     period is only known after extraction, so build N dates inside it
    //     (keeps the cert gate and visit ordering happy) and tell the page to
    //     print the DATE / TIME IN-OUT fields blank.
    if (undated) {
      const st = await page.evaluate(() => window.__automation.getState());
      visits = spreadVisits(requestedNotes, st.certPeriod || {}, nurseName || "");
      console.log(`Undated request: generating ${visits.length} note(s); DATE/TIME left blank.`);
      const ok = await page.evaluate((vlist) => {
        if (!window.__automation.setBlankDates) return false;
        window.__automation.setBlankDates(true);
        window.__automation.setVisits(vlist);
        return true;
      }, visits);
      if (!ok) throw new Error(`The generator website is out of date (bridge version ${siteVersion}, needs 17+). Upload frontend/src/App.jsx to GitHub and wait for the nurse-v2 service to redeploy, then resend this email.`);
      await sleep(500);
      await waitForState(page, s => s.bulkCount === visits.length, { timeout: 15000, label: "undated visits applied" });
    }

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
    const baseName = `Notes-${patientTag}-${noteCount}-visits`;

    let pdfs;
    if (word) {
      // Editable Word document instead of PDF.
      pdfs = [await buildWordDoc(browser, notesHTML, `${baseName}.doc`)];
    } else {
      const mergedPdf = await renderNotesToPdf(browser, notesHTML, `${baseName}.pdf`);
      // Tuck the structured batch into the PDF's metadata so a later Correction
      // email can work from this exact file — no extra attachment needed.
      mergedPdf.buffer = await embedBatchInPdf(mergedPdf.buffer, batch);
      pdfs = [mergedPdf];
    }

    if (skippedDates.length) console.log(`Skipped ${skippedDates.length} date(s) outside cert period: ${skippedDates.join(", ")}`);
    console.log(`Delivered 1 ${word ? "Word document" : "merged PDF"}: ${pdfs[0].filename} (${noteCount} note(s)).`);
    return { pdfs, noteCount, skippedDates, certPeriod, batch };
  } finally {
    await browser.close();
    fs.unlink(tmpPdf).catch(() => {});
  }
}

// Build N visit dates spread evenly across the certification period. Used for
// undated requests ("9 notes"): the pipeline still needs real dates for the
// cert gate, ordering and discharge logic, but the notes print them blank.
function spreadVisits(n, certPeriod, nurseName) {
  const parse = (str) => {
    if (!str) return null;
    const parts = String(str).trim().split("/");
    if (parts.length === 3) {
      const d = new Date(+parts[2], +parts[0] - 1, +parts[1]);
      return isNaN(d) ? null : d;
    }
    const d = new Date(str);
    return isNaN(d) ? null : d;
  };
  const fmt = (d) =>
    String(d.getMonth() + 1).padStart(2, "0") + "/" +
    String(d.getDate()).padStart(2, "0") + "/" + d.getFullYear();

  let start = parse(certPeriod.start);
  let end = parse(certPeriod.end);
  if (!start) { start = new Date(); start.setHours(12, 0, 0, 0); }
  if (!end || end <= start) { end = new Date(start.getTime() + (n - 1) * 7 * 86400000); }

  const span = end.getTime() - start.getTime();
  const step = n > 1 ? Math.floor(span / (n - 1)) : 0;
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(start.getTime() + step * i);
    d.setHours(12, 0, 0, 0);
    out.push({ date: fmt(d), timeIn: "", timeOut: "", nurseName });
  }
  return out;
}

// ── WORD (.docx) OUTPUT ─────────────────────────────────────────────────────
// Subject contains "Word" -> deliver editable .docx instead of PDF.
// Word has no flexbox, so the two-column body is rebuilt as a TABLE (which Word
// renders correctly). Everything else — fonts, checkboxes, sizes — is unchanged.
async function buildWordDoc(browser, notesHTML, filename) {
  const p = await browser.newPage();
  const bodies = [];
  let styleBlock = "";

  for (const note of notesHTML) {
    await p.setContent(note.html, { waitUntil: "domcontentloaded", timeout: 30000 });
    const res = await p.evaluate(() => {
      // Word has no flexbox. Rebuild the whole note as ONE table:
      //   row 1 = the centred header spanning both columns
      //   row 2 = the left / right columns
      // Keeping the header inside the table stops Word pushing the columns to
      // page 2 and leaving the header alone on page 1.
      const cols = document.querySelector(".cols");
      if (cols) {
        const left = cols.querySelector(".left");
        const right = cols.querySelector(".right");
        const hdr = document.querySelector(".hdr");

        const tbl = document.createElement("table");
        tbl.setAttribute("width", "100%");
        tbl.setAttribute("cellspacing", "0");
        tbl.setAttribute("cellpadding", "0");
        tbl.style.cssText = "width:100%;border-collapse:collapse;table-layout:fixed";

        if (hdr) {
          const trH = document.createElement("tr");
          const tdH = document.createElement("td");
          tdH.setAttribute("colspan", "2");
          tdH.style.cssText = "text-align:center;padding-bottom:3pt";
          // Word maps <h1>/<h2> to its built-in Heading styles, which add large
          // fonts and space-before/after and blow the header up. Emit plain divs
          // with the exact sizes instead.
          const h1 = hdr.querySelector("h1");
          const h2 = hdr.querySelector("h2");
          const line = (txt, size, spacing) =>
            "<div style=" + String.fromCharCode(39) +
            "font-size:" + size + ";font-weight:bold;letter-spacing:" + spacing +
            ";margin:0;padding:0;line-height:1.15" + String.fromCharCode(39) + ">" + txt + "</div>";
          tdH.innerHTML =
            (h1 ? line(h1.textContent, "14pt", "0.5pt") : "") +
            (h2 ? line(h2.textContent, "10pt", "2pt") : "");
          trH.appendChild(tdH);
          tbl.appendChild(trH);
          hdr.remove();
        }

        const tr = document.createElement("tr");
        // setAttribute keeps the literal text; .style.cssText would let Chrome
        // rewrite "page-break-inside" to "break-inside", which Word ignores.
        tr.setAttribute("style", "page-break-inside:auto;break-inside:auto");
        const td1 = document.createElement("td");
        td1.setAttribute("width", "40%");
        td1.style.cssText = "width:40%;vertical-align:top;padding-right:6pt;border-right:1pt solid #666;border-top:2pt solid #000;font-size:8.2pt;line-height:1.32";
        td1.innerHTML = left ? left.innerHTML : "";
        const td2 = document.createElement("td");
        td2.setAttribute("width", "60%");
        td2.style.cssText = "width:60%;vertical-align:top;padding-left:6pt;border-top:2pt solid #000;font-size:8.4pt;line-height:1.35";
        td2.innerHTML = right ? right.innerHTML : "";
        tr.appendChild(td1); tr.appendChild(td2); tbl.appendChild(tr);
        cols.replaceWith(tbl);
      }
      const st = document.querySelector("style");
      // Word cannot parse @page / @media rules - drop them, keep the rest.
      let css = st ? st.innerHTML : "";
      css = css.split("@").map((chunk, i) => {
        if (i === 0) return chunk;
        const brace = chunk.indexOf("{");
        if (brace === -1) return "";
        let depth = 0, j = brace;
        for (; j < chunk.length; j++) {
          if (chunk[j] === "{") depth++;
          else if (chunk[j] === "}") { depth--; if (depth === 0) { j++; break; } }
        }
        return chunk.slice(j);
      }).join("");
      // These would make Word shove whole blocks onto the next page.
      // Word-only: use the legacy break property Word understands, and stop
      // Word applying its own Heading styles to h1/h2.
      css += " .sec,.intv,.sm,.bgrid,.left,.right,tr,td{page-break-inside:auto !important}";
      css += " h1,h2,h3{margin:0 !important;padding:0 !important;line-height:1.15 !important;font-family:inherit !important}";
      return { body: document.body.innerHTML, style: css };
    });
    if (!styleBlock) styleBlock = res.style;
    bodies.push(res.body);
  }
  await p.close();

  // Word-native HTML: Word opens and edits this directly, and renders the CSS
  // properly (no third-party docx builder, no XML escaping problems).
  const NS = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">';
  const MSO = '<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->';
  const PAGE = '@page WordSection1 {size:210mm 297mm; margin:10mm 8mm 10mm 8mm;} div.WordSection1 {page:WordSection1;} table{border-collapse:collapse}';
  const BRK = '<br clear="all" style="page-break-before:always">';
  const head = NS + '<head><meta charset="utf-8">' + MSO + '<style>' + PAGE + styleBlock + '</style></head><body><div class="WordSection1">';
  const body = bodies.map((b, i) => (i ? BRK + b : b)).join("");
  const html = head + body + '</div></body></html>';

  console.log(`Built Word document: ${filename} (${notesHTML.length} note(s)).`);
  return { filename, buffer: Buffer.from(html, "utf8"), mimeType: "application/msword" };
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
