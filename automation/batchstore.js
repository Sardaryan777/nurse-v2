// ── Batch storage inside the PDF ────────────────────────────────────────────
// Correction mode needs the structured notes that produced a PDF. Rather than
// emailing a separate JSON file (clutter for the user), we tuck the batch into
// the PDF's own metadata — gzipped and base64'd, so it's invisible, travels
// with the file, and survives forwarding.
import zlib from "zlib";
import { PDFDocument } from "pdf-lib";

const MARKER = "NBATCH1:";

export function packBatch(batch) {
  return MARKER + zlib.gzipSync(Buffer.from(JSON.stringify(batch), "utf8")).toString("base64");
}

export function unpackBatch(str) {
  if (!str) return null;
  const m = String(str).match(/NBATCH1:([A-Za-z0-9+/=]+)/);
  if (!m) return null;
  try {
    return JSON.parse(zlib.gunzipSync(Buffer.from(m[1], "base64")).toString("utf8"));
  } catch {
    return null;
  }
}

// Write the batch into a finished PDF. Returns a new Buffer.
export async function embedBatchInPdf(pdfBuffer, batch) {
  if (!batch) return pdfBuffer;
  try {
    const doc = await PDFDocument.load(pdfBuffer);
    doc.setKeywords([packBatch(batch)]);
    return Buffer.from(await doc.save());
  } catch {
    return pdfBuffer;   // never lose the PDF over a metadata failure
  }
}

// Read the batch back out of a PDF the user forwarded/replied with.
export async function readBatchFromPdf(pdfBuffer) {
  try {
    const doc = await PDFDocument.load(pdfBuffer);
    const batch = unpackBatch(doc.getKeywords());
    if (batch && Array.isArray(batch.notes) && batch.notes.length) return batch;
  } catch { /* not our PDF, or unreadable */ }
  return null;
}
