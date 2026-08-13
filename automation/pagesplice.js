// ── Page-splice corrections ─────────────────────────────────────────────────
// For notes that were already delivered as a PDF (no stored batch): read the
// PDF to learn which page holds which visit, regenerate ONLY the corrected
// notes, and swap those pages back into the original file.
//
// Everything not corrected is copied through untouched — the untouched pages
// are the ORIGINAL pages, not re-rendered ones, so approved notes cannot drift.
import Anthropic from "@anthropic-ai/sdk";
import { PDFDocument } from "pdf-lib";

const MODEL = "claude-sonnet-4-6";

function client() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("Missing ANTHROPIC_API_KEY");
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

function parseJSON(text) {
  let t = String(text || "").trim().replace(/```json/gi, "").replace(/```/g, "").trim();
  const s = t.indexOf("{"), e = t.lastIndexOf("}");
  if (s === -1 || e === -1) throw new Error("No JSON in page-map response");
  const body = t.slice(s, e + 1);
  for (const a of [body, body.replace(/,\s*([}\]])/g, "$1")]) {
    try { return JSON.parse(a); } catch { /* next */ }
  }
  throw new Error("Could not parse page-map JSON");
}

/**
 * Read a generated-notes PDF and map every page to its visit.
 * Also captures the ORIGINAL topic + pain level so a regenerated page keeps the
 * episode's progression instead of restarting it.
 * @returns {Promise<{patient:string, agencyName:string, pages:Array}>}
 */
export async function mapNotesPdf(pdfBuffer) {
  const anthropic = client();
  const resp = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 16000,
    temperature: 0,
    messages: [{
      role: "user",
      content: [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBuffer.toString("base64") } },
        {
          type: "text",
          text:
            "This PDF contains home-health clinical notes, ONE note per page.\n" +
            "For EVERY page, read the bottom block (PATIENT / DATE / TIME IN-OUT), the SN NAME field, " +
            "the ASSESSMENTS teaching topic, and the PAIN intensity.\n\n" +
            "Return ONLY compact JSON:\n" +
            '{"patient":"","agencyName":"","pages":[{"page":1,"date":"MM/DD/YYYY","timeIn":"HH:MM AM","timeOut":"HH:MM PM","nurse":"","topic":"","painLevel":4}]}\n' +
            "page is 1-based. Use \"\" for anything not readable. Times as 12-hour with AM/PM. " +
            "painLevel is the circled/underlined number 0-10 (use null if unclear). " +
            "List EVERY page in order. No markdown, no commentary."
        }
      ]
    }]
  });
  const text = (resp.content || []).map(b => b.text || "").join("");
  const data = parseJSON(text);
  const pages = (Array.isArray(data.pages) ? data.pages : [])
    .filter(p => p && p.page)
    .sort((a, b) => a.page - b.page);
  if (!pages.length) throw new Error("could not read any note pages from the attached PDF");
  return { patient: data.patient || "", agencyName: data.agencyName || "", pages };
}

/**
 * Replace specific pages of the original PDF with newly rendered pages.
 * @param {Buffer} originalPdf
 * @param {Buffer} correctedPdf     one page per corrected note, in `order`
 * @param {number[]} order          0-based ORIGINAL page indexes being replaced,
 *                                  aligned with the pages of correctedPdf
 * @returns {Promise<Buffer>}
 */
export async function splicePages(originalPdf, correctedPdf, order) {
  const orig = await PDFDocument.load(originalPdf);
  const fixed = await PDFDocument.load(correctedPdf);
  const out = await PDFDocument.create();

  const total = orig.getPageCount();
  const replaceAt = new Map();          // originalPageIndex -> correctedPageIndex
  order.forEach((origIdx, k) => replaceAt.set(origIdx, k));

  for (let i = 0; i < total; i++) {
    if (replaceAt.has(i)) {
      const k = replaceAt.get(i);
      if (k < fixed.getPageCount()) {
        const [pg] = await out.copyPages(fixed, [k]);
        out.addPage(pg);
        continue;
      }
    }
    const [pg] = await out.copyPages(orig, [i]);
    out.addPage(pg);
  }
  return Buffer.from(await out.save());
}

// Compact list of the PDF's pages for the correction AI to match against.
export function summarizePages(map) {
  return map.pages.map((p, i) =>
    `[${i}] page ${p.page} | ${p.date} ${p.timeIn || "--"}${p.timeOut ? "-" + p.timeOut : ""} | nurse: ${p.nurse || "(none)"} | topic: ${p.topic || "(none)"} | pain: ${p.painLevel ?? "?"}/10`
  ).join("\n");
}

// Decide which attachment is the notes PDF and which is the 485.
// The notes PDF is the one whose filename looks like our output, or (fallback)
// the larger multi-page file.
export function classifyPdfs(pdfs) {
  const isNotes = f => /^notes?[-_]/i.test(f || "") || /corrected/i.test(f || "");
  let notes = pdfs.find(p => isNotes(p.filename)) || null;
  let poc = pdfs.find(p => p !== notes && /485|487|poc|plan/i.test(p.filename || "")) || null;
  if (!notes && pdfs.length) {
    // Fall back to size: generated batches are much larger than a 485.
    const sorted = [...pdfs].sort((a, b) => b.buffer.length - a.buffer.length);
    notes = sorted[0];
    poc = poc || sorted[1] || null;
  }
  if (!poc) poc = pdfs.find(p => p !== notes) || null;
  return { notesPdf: notes, pocPdf: poc };
}
