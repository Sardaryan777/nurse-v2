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

// Pull every top-level {...} block out of a response. Models sometimes emit two
// objects with commentary between them ("Wait, let me re-read the rules..."), and
// naively slicing from the first { to the last } swallows the prose and fails.
export function extractJsonObjects(t) {
  const out = [];
  let depth = 0, start = -1, inStr = false, esc = false, quote = "";
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inStr) {
      if (esc) { esc = false; continue; }
      if (c === "\\") { esc = true; continue; }
      if (c === quote) inStr = false;
      continue;
    }
    if (c === "\"" || c === "'") { inStr = true; quote = c; continue; }
    if (c === "{") { if (depth === 0) start = i; depth++; }
    else if (c === "}") { depth--; if (depth === 0 && start >= 0) { out.push(t.slice(start, i + 1)); start = -1; } }
  }
  return out;
}
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

  // The response may hold SEVERAL objects (model second-guessing itself). Parse
  // each one and keep the most complete answer.
  const candidates = [];
  for (const obj of extractJsonObjects(t)) {
    for (const variant of [obj, obj.replace(/,\s*([}\]])/g, "$1")]) {
      try { candidates.push(JSON.parse(variant)); break; } catch { /* next */ }
    }
  }
  if (candidates.length) {
    candidates.sort((a, b) => {
      const av = Array.isArray(a.visits) ? a.visits.length : -1;
      const bv = Array.isArray(b.visits) ? b.visits.length : -1;
      if (bv !== av) return bv - av;
      return (Number(b.noteCount) || 0) - (Number(a.noteCount) || 0);
    });
    return candidates[0];
  }

  // Last resort: the response was TRUNCATED mid-list (long schedules can hit the
  // output-token cap). Salvage every complete {...} visit object we did receive
  // and rebuild valid JSON from them, rather than losing the whole email.
  const salvaged = repairTruncated(t.slice(s));
  if (salvaged) return salvaged;

  throw new Error("Could not parse JSON from Claude response: " + body.slice(0, 300));
}

// Rebuild usable JSON from a truncated response: keep the top-level nurseName
// and every fully-formed visit object, discarding the incomplete tail.
function repairTruncated(raw) {
  try {
    const nurseMatch = raw.match(/"nurseName"\s*:\s*"([^"]*)"/);
    const visitRe = /\{[^{}]*"date"\s*:\s*"[^"]+"[^{}]*\}/g;
    const visits = [];
    let m;
    while ((m = visitRe.exec(raw)) !== null) {
      try { visits.push(JSON.parse(m[0])); } catch { /* skip malformed */ }
    }
    if (!visits.length) return null;
    return { nurseName: nurseMatch ? nurseMatch[1] : "", visits, _truncated: true };
  } catch {
    return null;
  }
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
    // Long schedules (100+ visits, each with its own nurse) produce a lot of
    // JSON — keep plenty of headroom so the list is never cut off mid-array.
    max_tokens: 32000,
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
      "If the email gives NO dates but names a NUMBER of notes, put that number in noteCount "
      + 'and leave visits empty: {"nurseName":"","visits":[],"noteCount":9}. ' +
      "Written-out numbers count (nine -> 9). If there are no dates AND no number, use noteCount 0. " +
      "OUTPUT FORMAT IS ABSOLUTE: reply with ONE JSON object only. Start at { and stop at the matching }. " +
      "Never write explanations, reasoning, corrections, or a second object. No markdown, no backticks.",
    messages: [{ role: "user", content: `Email body:\n\n${bodyText}` }]
  });
  const text = (resp.content || []).map(b => b.text || "").join("");
  const data = parseJSON(text);
  if (data._truncated) {
    console.log(`  WARNING: schedule response was truncated — salvaged ${(data.visits||[]).length} complete visit(s). Some later dates may be missing.`);
  }
  const visits = Array.isArray(data.visits) ? data.visits : [];
  const defaultNurse = (data.nurseName || "").trim();
  // Fill blanks with the default nurse so every visit ends up with a name when possible.
  for (const v of visits) {
    v.nurseName = (v.nurseName || "").trim() || defaultNurse;
  }
  // No dates, just a count ("9 notes") -> caller generates that many
  // undated notes.
  let noteCount = Number(data.noteCount) > 0 ? Math.min(60, Math.floor(Number(data.noteCount))) : 0;
  if (!visits.length && !noteCount) noteCount = countFromText(bodyText);
  return { nurseName: defaultNurse, visits, noteCount };
}

// Convert "HH:MM AM" -> { h, m, ap } for the generator bridge. null-safe.
export function splitTime(t) {
  if (!t) return { h: null, m: 0, ap: "AM" };
  const m = String(t).match(/(\d{1,2}):(\d{2})\s*([AaPp][Mm])/);
  if (!m) return { h: null, m: 0, ap: "AM" };
  return { h: parseInt(m[1], 10), m: parseInt(m[2], 10), ap: m[3].toUpperCase() };
}

// Local fallback: pull a note count straight from the email text. The model is
// asked for this too, but a plain "9 notes" must never depend on that alone.
export function countFromText(text) {
  const t = String(text || "").toLowerCase();
  const words = { one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,
                  eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,
                  seventeen:17,eighteen:18,nineteen:19,twenty:20 };
  // "9 notes", "9 visits", "(9 notes)"
  let m = t.match(/(\d{1,2})\s*(?:notes?|visits?)/);
  if (m) return Math.min(60, parseInt(m[1], 10));
  // "nine notes"
  m = t.match(/([a-z]+)\s*(?:notes?|visits?)/);
  if (m && words[m[1]]) return words[m[1]];
  // a message that is just a number
  const bare = t.replace(/[^0-9]/g, "");
  const only = t.replace(/[^a-z0-9]/g, "");
  if (bare && only === bare && bare.length <= 2) return Math.min(60, parseInt(bare, 10));
  if (words[only]) return words[only];
  return 0;
}
