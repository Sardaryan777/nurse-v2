// ── Correction mode ──────────────────────────────────────────────────────────
// Subject contains "Correction" -> the email body is a set of correction
// INSTRUCTIONS, not a new note request. We locate the original note batch,
// use Claude to reason about which notes each instruction targets, apply the
// changes, and keep everything else untouched.
//
// Two AI passes:
//   1. parseCorrectionInstructions — free text/structured -> targeted change list
//   2. rewriteNote                 — apply changes to ONE note, keeping the rest
//      of that note's clinical content intact and internally consistent.
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-4-6";

function client() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("Missing ANTHROPIC_API_KEY");
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

function parseJSON(text) {
  let t = String(text || "").trim().replace(/```json/gi, "").replace(/```/g, "").trim();
  const s = t.indexOf("{"), e = t.lastIndexOf("}");
  if (s === -1 || e === -1) throw new Error("No JSON in correction response");
  const body = t.slice(s, e + 1);
  for (const a of [body, body.replace(/,\s*([}\]])/g, "$1")]) {
    try { return JSON.parse(a); } catch { /* next */ }
  }
  throw new Error("Could not parse correction JSON: " + body.slice(0, 300));
}

// Normalize "7:00 PM", "07:00 pm", "19:00" -> "07:00 PM" for reliable matching.
function normTime(t) {
  if (!t) return "";
  const s = String(t).trim();
  let m = s.match(/(\d{1,2}):(\d{2})\s*([AaPp])[Mm]?/);
  if (m) return `${String(+m[1]).padStart(2, "0")}:${m[2]} ${m[3].toUpperCase()}M`;
  m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m) {
    let h = +m[1]; const ap = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return `${String(h).padStart(2, "0")}:${m[2]} ${ap}`;
  }
  return s.toUpperCase();
}

// PASS 1 — read the correction email into a precise, machine-usable change list.
export async function parseCorrectionInstructions(bodyText, batchSummary) {
  const anthropic = client();
  const resp = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 8000,
    temperature: 0,
    system:
      "You read CORRECTION requests for already-generated home-health nursing notes and turn them into a precise change list.\n" +
      "You are given the list of existing notes (index, date, time, nurse, topic) and the user's correction email.\n" +
      "Your job is to decide WHICH note(s) each instruction targets and WHAT should change.\n\n" +
      "MATCHING RULES:\n" +
      "- Match by date, and by time when the email gives one. A date alone matching exactly one note targets that note.\n" +
      "- If a date matches MULTIPLE notes and no time is given, do NOT guess: add that instruction to \"ambiguous\" with a clear message naming the date.\n" +
      "- If a date matches NO note, add it to \"unmatched\".\n" +
      "- Interpret loose language: \"05/18 wrong oxygen, make it 96\" = O2 sat 96 on that date; \"pain not 4, make 2\" = pain level 2/10;\n" +
      "  \"do not discharge this date\" = remove discharge wording; \"last note should be discharge\" = discharge on the final chronological visit.\n" +
      "- \"regenerate all\" / \"redo everything\" sets \"regenerateAll\": true.\n\n" +
      "FIELDS you may set per note (omit any you are not changing):\n" +
      "  painLevel (number 0-10), painLoc (string), o2Sat (string), topic (string), nurseName (string),\n" +
      "  timeIn / timeOut (\"HH:MM AM\"), vitals {temp,hr,rr,bp,bs}, discharge (true=make this the discharge note, false=remove discharge wording),\n" +
      "  allergies (string), diet (string),\n" +
      "  checkboxes {} — set ONLY the boxes the user wants flipped, true = checked, false = unchecked.\n" +
      "    Valid checkbox keys (use these EXACT names):\n" +
      "      mental:    oriented, alert, forgetful, confusedAtTimes, anxious, depressedControlled, agitated\n" +
      "      deficits:  poorVision, legallyBlind, hoh, deaf, sob, cough, urinaryIncontinence, bowelIncontinence,\n" +
      "                 urinaryFrequency, urinaryUrgency, edema, stiffJoints, weakness, limitedROM, unsteadyBalance\n" +
      "      homebound: limitedEndurance, limitedStrength, assistADL, unevenSurfaces, confusion, unableToLeaveAlone,\n" +
      "                 poorCoordination, taxingEffort\n" +
      "      equipment: hasWalker, hasCane, hasWheelchair, hasContracture, isBedbound\n" +
      "      clinical:  isDiabetic, hasWound, hasPleurX, hasParalysis, hasDysphagia, proneToAspiration,\n" +
      "                 hasTremor, hasVertigo, hasPVD, hasCaregiver, leftArmRestricted\n" +
      "    Map plain language to these keys, e.g. \"patient is not incontinent\" -> {\"urinaryIncontinence\":false,\"bowelIncontinence\":false};\n" +
      "    \"uses a walker not a cane\" -> {\"hasWalker\":true,\"hasCane\":false}; \"remove SOB\" -> {\"sob\":false};\n" +
      "    \"patient is alert and oriented\" -> {\"oriented\":true,\"alert\":true}.\n" +
      "  instruction (free-text description of any other change: wording, wound detail, medication/injection documentation, text to remove/replace)\n\n" +
      'Return ONLY compact JSON: {"regenerateAll":false,"changes":[{"noteIndex":0,"date":"MM/DD/YYYY","time":"07:00 PM","fields":{"painLevel":2,"checkboxes":{"urinaryIncontinence":false}}}],"ambiguous":["..."],"unmatched":["..."],"summary":"one line"}\n' +
      "noteIndex MUST be the index from the provided note list. No markdown, no commentary.",
    messages: [{
      role: "user",
      content: `EXISTING NOTES:\n${batchSummary}\n\nCORRECTION EMAIL:\n${bodyText}`
    }]
  });
  const text = (resp.content || []).map(b => b.text || "").join("");
  const data = parseJSON(text);
  return {
    regenerateAll: !!data.regenerateAll,
    changes: Array.isArray(data.changes) ? data.changes : [],
    ambiguous: Array.isArray(data.ambiguous) ? data.ambiguous : [],
    unmatched: Array.isArray(data.unmatched) ? data.unmatched : [],
    summary: data.summary || ""
  };
}

// Where each checkbox lives inside the POC object the note template reads.
const CB_GROUPS = {
  mentalStatus: ["oriented", "alert", "forgetful", "confusedAtTimes", "anxious", "depressedControlled", "agitated", "disoriented"],
  deficits: ["poorVision", "legallyBlind", "hoh", "deaf", "sob", "cough", "urinaryIncontinence", "bowelIncontinence",
             "urinaryFrequency", "urinaryUrgency", "edema", "stiffJoints", "weakness", "limitedROM", "unsteadyBalance"],
  homeboundFlags: ["limitedEndurance", "limitedStrength", "assistADL", "unevenSurfaces", "confusion",
                   "unableToLeaveAlone", "poorCoordination", "taxingEffort"]
};
// Everything else is a top-level POC flag (hasWalker, isDiabetic, hasWound, ...).
function groupFor(key) {
  for (const [group, keys] of Object.entries(CB_GROUPS)) if (keys.includes(key)) return group;
  return null;
}

// Apply checkbox flips to a COPY of the note's POC, so only this note changes.
function applyCheckboxes(poc, checkboxes) {
  const next = { ...(poc || {}) };
  const touched = [];
  for (const [key, val] of Object.entries(checkboxes || {})) {
    if (typeof val !== "boolean") continue;
    const group = groupFor(key);
    if (group) {
      next[group] = { ...(next[group] || {}), [key]: val };
    } else {
      next[key] = val;
    }
    touched.push(`${key}=${val ? "checked" : "unchecked"}`);
  }
  return { poc: next, touched };
}

// PASS 2 — rewrite ONE note's narrative so every related sentence matches the
// corrected values (pain wording, O2, teaching topic, discharge language...).
// Everything not covered by the correction must survive unchanged.
async function rewriteNoteText(note, fields, poc, cbTouched = []) {
  const anthropic = client();
  const changeLines = [];
  if (cbTouched.length) {
    changeLines.push(
      `- The following assessment findings changed: ${cbTouched.join(", ")}. ` +
      `Make the narrative agree — remove or reword any sentence that contradicts these, and do NOT describe a finding that is now unchecked ` +
      `(e.g. if incontinence is unchecked, the note must not mention incontinence).`
    );
  }
  if (fields.painLevel != null) changeLines.push(`- Pain level is now ${fields.painLevel}/10 (was ${note.painLevel}/10). Rewrite ALL pain wording to match this severity.`);
  if (fields.o2Sat) changeLines.push(`- O2 saturation is now ${fields.o2Sat}. Update any oxygen/respiratory wording.`);
  if (fields.topic) changeLines.push(`- Teaching topic is now "${fields.topic}" (was "${note.topic}"). Replace the education content with teaching on this topic.`);
  if (fields.discharge === true) changeLines.push(`- This IS now the discharge note: state skilled nursing goals met / maximum benefit achieved and patient appropriate for discharge. Do NOT say "continue plan of care".`);
  if (fields.discharge === false) changeLines.push(`- This is NOT a discharge note: remove ALL discharge language and end with continuing the plan of care as approved by MD.`);
  if (fields.instruction) changeLines.push(`- ${fields.instruction}`);
  if (!changeLines.length) return note.intervention;

  const resp = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1500,
    temperature: 0,
    system:
      "You correct an existing home-health nursing note's INTERVENTION paragraph.\n" +
      "Apply ONLY the requested corrections. Preserve every other clinical statement exactly in meaning.\n" +
      "The result MUST be internally consistent: if pain changed, every pain sentence matches the new level; if the topic changed, the education matches the new topic.\n" +
      "STRICT: never introduce diagnoses, medications, wounds, or treatments that are not in the Plan of Care data given below.\n" +
      "LVN wording only (observed, monitored, performed, reinforced). No his/her, s/he, their, or [placeholders].\n" +
      "Keep a similar length to the original. Return ONLY the corrected paragraph text — no preamble, no labels.",
    messages: [{
      role: "user",
      content:
        `PLAN OF CARE (authoritative — do not contradict):\n` +
        `Diagnoses: ${(poc?.diagnoses || []).join(", ") || "n/a"}\n` +
        `Medications: ${(poc?.medications || []).join(", ") || "n/a"}\n` +
        `Allergies: ${poc?.allergies || "n/a"}\nDiet: ${poc?.diet || "n/a"}\n\n` +
        `ORIGINAL NOTE PARAGRAPH:\n${note.intervention}\n\n` +
        `CORRECTIONS TO APPLY:\n${changeLines.join("\n")}`
    }]
  });
  return (resp.content || []).map(b => b.text || "").join("").trim();
}

/**
 * Apply a parsed change list to a note batch.
 * @returns {{notes:Array, applied:string[], errors:string[]}}
 */
export async function applyCorrections(batch, parsed) {
  const notes = batch.notes.map(n => ({ ...n }));
  const poc = batch.poc || {};
  const applied = [];
  const errors = [...(parsed.ambiguous || []), ...(parsed.unmatched || [])];

  for (const change of parsed.changes) {
    const i = change.noteIndex;
    if (typeof i !== "number" || i < 0 || i >= notes.length) {
      errors.push(`Cannot apply correction: no matching note found for ${change.date || "(unspecified date)"}${change.time ? " " + change.time : ""}.`);
      continue;
    }
    const note = notes[i];
    const f = change.fields || {};

    // Structured field updates
    if (f.painLevel != null) note.painLevel = Number(f.painLevel);
    if (f.painLoc) note.painLoc = f.painLoc;
    if (f.o2Sat) note.poc = { ...(note.poc || poc), o2Sat: String(f.o2Sat).replace(/[^\d.]/g, "") || note.poc?.o2Sat };
    if (f.topic) note.topic = f.topic;
    if (f.nurseName) note.nurseName = f.nurseName;
    if (f.timeIn) note.timeIn = normTime(f.timeIn);
    if (f.timeOut) note.timeOut = normTime(f.timeOut);
    if (f.vitals) note.vs = { ...(note.vs || {}), ...f.vitals };
    if (f.allergies) note.poc = { ...(note.poc || poc), allergies: f.allergies };
    if (f.diet) note.poc = { ...(note.poc || poc), diet: f.diet };
    if (f.discharge === true) { note.isLast = true; note.phase = "FINAL_DISCHARGE"; }
    if (f.discharge === false) { note.isLast = false; if (note.phase === "FINAL_DISCHARGE") note.phase = "LATE"; }

    // ── CHECKBOXES ────────────────────────────────────────────────────────
    // Flip the boxes on THIS note's own copy of the plan-of-care data.
    let cbTouched = [];
    if (f.checkboxes && typeof f.checkboxes === "object") {
      const res = applyCheckboxes(note.poc || poc, f.checkboxes);
      note.poc = res.poc;
      cbTouched = res.touched;
    }

    // Narrative rewrite so the paragraph agrees with the new values
    const needsRewrite = f.painLevel != null || f.o2Sat || f.topic || f.discharge != null || f.instruction || cbTouched.length;
    if (needsRewrite) {
      try {
        note.intervention = await rewriteNoteText(note, f, note.poc || poc, cbTouched);
      } catch (err) {
        errors.push(`Correction for ${note.dk}${note.timeIn ? " " + note.timeIn : ""} could not be rewritten: ${err.message}`);
        continue;
      }
    }
    applied.push(`${note.dk}${note.timeIn ? " " + note.timeIn : ""}: ${describeFields(f)}`);
  }

  // Discharge is positional: only the LAST chronological visit may be a full
  // discharge note. Enforce that whenever discharge was touched.
  if (parsed.changes.some(c => c?.fields?.discharge != null)) {
    const order = notes
      .map((n, idx) => ({ idx, key: sortKey(n) }))
      .sort((a, b) => a.key - b.key);
    const lastIdx = order.length ? order[order.length - 1].idx : -1;
    let fixed = 0;
    notes.forEach((n, idx) => {
      if (n.isLast && idx !== lastIdx) { n.isLast = false; if (n.phase === "FINAL_DISCHARGE") n.phase = "LATE"; fixed++; }
    });
    if (fixed) applied.push(`Discharge wording kept only on the final visit (${notes[lastIdx]?.dk || "?"}); removed from ${fixed} earlier note(s).`);
  }

  return { notes, applied, errors };
}

function sortKey(n) {
  const [m, d, y] = String(n.dk || "").split("/").map(Number);
  const base = new Date(y || 1970, (m || 1) - 1, d || 1).getTime();
  const t = String(n.timeIn || "");
  const tm = t.match(/(\d{1,2}):(\d{2})\s*([AP])M/i);
  let mins = 0;
  if (tm) {
    let h = +tm[1] % 12;
    if (/P/i.test(tm[3])) h += 12;
    mins = h * 60 + +tm[2];
  }
  return base + mins * 60000;
}

function describeFields(f) {
  const bits = [];
  if (f.painLevel != null) bits.push(`pain ${f.painLevel}/10`);
  if (f.painLoc) bits.push(`pain location ${f.painLoc}`);
  if (f.o2Sat) bits.push(`O2 ${f.o2Sat}`);
  if (f.topic) bits.push(`topic "${f.topic}"`);
  if (f.nurseName) bits.push(`nurse ${f.nurseName}`);
  if (f.timeIn || f.timeOut) bits.push(`time ${f.timeIn || ""}${f.timeOut ? "-" + f.timeOut : ""}`);
  if (f.vitals) bits.push("vitals");
  if (f.allergies) bits.push(`allergies ${f.allergies}`);
  if (f.diet) bits.push(`diet ${f.diet}`);
  if (f.checkboxes && Object.keys(f.checkboxes).length) {
    bits.push(Object.entries(f.checkboxes)
      .filter(([, v]) => typeof v === "boolean")
      .map(([k, v]) => `${v ? "☒" : "☐"} ${k}`).join(", "));
  }
  if (f.discharge === true) bits.push("set as discharge");
  if (f.discharge === false) bits.push("discharge removed");
  if (f.instruction) bits.push(f.instruction);
  return bits.join(", ") || "updated";
}

// Compact list of the existing notes for the AI to match instructions against.
export function summarizeBatch(batch) {
  return (batch.notes || []).map((n, i) =>
    `[${i}] ${n.dk} ${n.timeIn || "--"}${n.timeOut ? "-" + n.timeOut : ""} | nurse: ${n.nurseName || "(default)"} | topic: ${n.topic} | pain: ${n.painLevel}/10${n.isLast ? " | DISCHARGE" : ""}`
  ).join("\n");
}
