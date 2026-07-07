// ── Claude extraction helpers ────────────────────────────────────────────────
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-4-6";

function client() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("Missing ANTHROPIC_API_KEY");
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

// Tolerant JSON parser: strips markdown fences, isolates the object, and tries
// several light repairs (trailing commas, missing commas between objects) before
// giving up. Models occasionally emit slightly-off JSON; this recovers it.
function parseJSON(text) {
  let t = String(text).trim();
  t = t.replace(/```json/gi, "").replace(/```/g, "").trim();
  const s = t.indexOf("{");
  const e = t.lastIndexOf("}");
  if (s === -1 || e === -1) throw new Error("No JSON found in Claude response: " + t.slice(0, 200));
  const body = t.slice(s, e + 1);

  const attempts = [
    body,
    body.replace(/,\s*([}\]])/g, "$1"),                 // remove trailing commas
    body.replace(/}\s*{/g, "},{").replace(/]\s*\[/g, "],["), // add missing commas between items
    body.replace(/,\s*([}\]])/g, "$1").replace(/}\s*{/g, "},{")
  ];
  for (const a of attempts) {
    try { return JSON.parse(a); } catch { /* try next */ }
  }
  throw new Error("Could not parse JSON from Claude response: " + body.slice(0, 300));
}

// Extract ONLY the agency name from the PDF.
export async function extractAgencyName(pdfBuffer) {
  const anthropic = client();
  const resp = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 300,
    temperature: 0,
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

// Extract every visit (date, time in, time out, nurse) from the email body.
// Each visit line may carry its OWN nurse name; a nurse applies to all visits
// only when the email names exactly one nurse.
export async function extractVisitsFromEmail(bodyText) {
  const anthropic = client();
  const today = new Date();
  const resp = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4000,
    temperature: 0,
    system:
      "You parse scheduling emails for a home-health nursing service. " +
      "Extract every visit date with its time in, time out, and the nurse assigned to that specific visit. " +
      `Assume the current year is ${today.getFullYear()} if a year is not stated. ` +
      "Normalize every date to MM/DD/YYYY. Normalize every time to 'HH:MM AM' or 'HH:MM PM' (12-hour, zero-padded hour). " +
      "NURSE RULES: A visit line may include its own nurse name (before or after the date/times, or on a nearby grouping line like 'Nurse: NAME' followed by that nurse's dates). " +
      "Assign each visit the nurse that the email associates with that specific date. " +
      "If the email provides ONLY ONE nurse name total, apply it to every visit. " +
      "If a visit has no identifiable nurse, use null for nurseName on that visit. " +
      "Keep nurse names exactly as written, including titles like 'LVN' or 'RN' if attached (e.g. 'Gayane Maneyan / LVN'). " +
      "If only one time-in/time-out pair is given but multiple dates, apply that same pair to every date. " +
      "If a time is missing, use null for that field. " +
      'Return ONLY compact JSON of the exact form: ' +
      '{"nurseName":"","visits":[{"date":"MM/DD/YYYY","timeIn":"HH:MM AM","timeOut":"HH:MM PM","nurseName":""}]} ' +
      "where the top-level nurseName is the default/primary nurse (or the only one). " +
      "No markdown, no backticks, no commentary.",
    messages: [{ role: "user", content: `Email body:\n\n${bodyText}` }]
  });
  const text = (resp.content || []).map(b => b.text || "").join("");
  const data = parseJSON(text);
  const visits = Array.isArray(data.visits) ? data.visits : [];
  const defaultNurse = (data.nurseName || "").trim();
  // Fill blanks with the default nurse so every visit ends up with a name when possible.
  for (const v of visits) {
    v.nurseName = (v.nurseName || "").trim() || defaultNurse;
  }
  return { nurseName: defaultNurse, visits };
}

// Convert "HH:MM AM" -> { h, m, ap } for the generator bridge. null-safe.
export function splitTime(t) {
  if (!t) return { h: null, m: 0, ap: "AM" };
  const m = String(t).match(/(\d{1,2}):(\d{2})\s*([AaPp][Mm])/);
  if (!m) return { h: null, m: 0, ap: "AM" };
  return { h: parseInt(m[1], 10), m: parseInt(m[2], 10), ap: m[3].toUpperCase() };
}
