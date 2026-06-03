// ── Claude extraction helpers ────────────────────────────────────────────────
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-4-6";

function client() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("Missing ANTHROPIC_API_KEY");
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

function parseJSON(text) {
  const s = text.indexOf("{");
  const e = text.lastIndexOf("}");
  if (s === -1 || e === -1) throw new Error("No JSON found in Claude response");
  return JSON.parse(text.slice(s, e + 1));
}

// Extract ONLY the agency name from the PDF.
export async function extractAgencyName(pdfBuffer) {
  const anthropic = client();
  const resp = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 300,
    messages: [{
      role: "user",
      content: [
        {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: pdfBuffer.toString("base64") }
        },
        {
          type: "text",
          text:
            "From this home-health Plan of Care / 485 document, extract ONLY the home health agency name " +
            "(the provider/agency, NOT the patient, physician, or hospital). " +
            'Return ONLY compact JSON: {"agencyName":"..."} with no other text.'
        }
      ]
    }]
  });
  const text = (resp.content || []).map(b => b.text || "").join("");
  const data = parseJSON(text);
  return (data.agencyName || "").trim();
}

// Extract nurse name + every visit (date, time in, time out) from the email body.
export async function extractVisitsFromEmail(bodyText) {
  const anthropic = client();
  const today = new Date();
  const resp = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system:
      "You parse scheduling emails for a home-health nursing service. " +
      "Extract the nurse's name and every visit date with its time in and time out. " +
      `Assume the current year is ${today.getFullYear()} if a year is not stated. ` +
      "Normalize every date to MM/DD/YYYY. Normalize every time to 'HH:MM AM' or 'HH:MM PM' (12-hour, zero-padded hour). " +
      "If only one time-in/time-out pair is given but multiple dates, apply that same pair to every date. " +
      "If a time is missing, use null for that field. " +
      'Return ONLY compact JSON of the exact form: ' +
      '{"nurseName":"","visits":[{"date":"MM/DD/YYYY","timeIn":"HH:MM AM","timeOut":"HH:MM PM"}]} ' +
      "with no markdown, no backticks, no commentary.",
    messages: [{ role: "user", content: `Email body:\n\n${bodyText}` }]
  });
  const text = (resp.content || []).map(b => b.text || "").join("");
  const data = parseJSON(text);
  return {
    nurseName: (data.nurseName || "").trim(),
    visits: Array.isArray(data.visits) ? data.visits : []
  };
}

// Convert "HH:MM AM" -> { h, m, ap } for the generator bridge. null-safe.
export function splitTime(t) {
  if (!t) return { h: null, m: 0, ap: "AM" };
  const m = String(t).match(/(\d{1,2}):(\d{2})\s*([AaPp][Mm])/);
  if (!m) return { h: null, m: 0, ap: "AM" };
  return { h: parseInt(m[1], 10), m: parseInt(m[2], 10), ap: m[3].toUpperCase() };
}
