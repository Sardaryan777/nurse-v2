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
      "  vitals {bp,hr,rr,temp,bs,o2,weight} — use these EXACT lowercase keys. Put the value ONLY, no units:\n" +
      "     \"BP to 150/70 mmHg, HR to 86 bpm, RR to 19/min\" -> {\"bp\":\"150/70\",\"hr\":\"86\",\"rr\":\"19\"}\n" +
      "     \"temp 98.4\" -> {\"temp\":\"98.4\"}; \"blood sugar 142\" -> {\"bs\":\"142\"}; \"O2 96% RA\" -> {\"o2\":\"96% RA\"}; \"weight 165 lbs\" -> {\"weight\":\"165\"}\n" +
      "  painLevel (0-10), painLoc (string), painChar (\"sharp\"|\"dull\"|\"radiating\"|\"burning\"),\n" +
      "  topic (string), nurseName (string), timeIn / timeOut (\"HH:MM AM\"), lastBM (\"MM.DD.YY\"),\n" +
      "  discharge (true=make this the discharge note, false=remove discharge wording),\n" +
      "  allergies, diet, lungSounds, patientName, mrNumber, weight, o2Sat, bpArmRestriction (\"left\"|\"right\"|\"\"),\n" +
      "  woundDesc, woundStage, woundCareOrder, dressingType, cleansingSolution, woundFrequency, injSite,\n" +
      "  injectable {name,dose,route,frequency},\n" +
      "  communication {md,pt,ot,st,ms,rn,lvn,chha,supervisor,pharmacist} booleans + re (string)\n" +
      "     \"document communication with MD, RN and Supervisor\" -> {\"md\":true,\"rn\":true,\"supervisor\":true}\n" +
      "  addMedications [\"...\"], removeMedications [\"...\"], addDiagnoses [\"...\"], removeDiagnoses [\"...\"]\n" +
      "     \"add new medication Metoprolol\" -> addMedications:[\"Metoprolol\"]; \"add Asthma to the note\" -> addDiagnoses:[\"Asthma\"]\n" +
      "     \"if Rosuvastatin is discontinued remove its teaching\" -> removeMedications:[\"Rosuvastatin\"] plus an instruction describing the teaching change\n" +
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
      "      cardiac:   hasChestPain, hasPalpitations, hasDizziness, edemaPitting, hasPacer\n" +
      "                 (\"add palpitations to cardiovascular findings\" -> {\"hasPalpitations\":true})\n" +
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

// ── Vitals normalization ────────────────────────────────────────────────────
// The note template renders bare values and appends the units itself
// ("<u>${vs.hr}</u>bpm"), and it reads exact lowercase keys. A correction email
// says "HR to 86 bpm", so we must map the key AND strip the unit — otherwise
// the value lands on an unused key and the PDF silently doesn't change.
const VITAL_KEYS = {
  bp: ["bp", "bloodpressure", "b/p"],
  hr: ["hr", "pulse", "heartrate", "heart"],
  rr: ["rr", "resp", "resps", "respirations", "respiratoryrate", "respiration"],
  temp: ["temp", "t", "temperature"],
  bs: ["bs", "bloodsugar", "glucose", "cbg", "fsbs", "sugar"],
  o2: ["o2", "o2sat", "spo2", "sat", "sats", "oxygen", "oxygensaturation", "pulseox"],
  weight: ["weight", "wt"]
};
function canonVitalKey(k) {
  const s = String(k || "").toLowerCase().replace(/[\s_\-./]/g, "");
  for (const [canon, aliases] of Object.entries(VITAL_KEYS)) if (aliases.includes(s)) return canon;
  return null;
}
function stripUnits(v) {
  return String(v == null ? "" : v)
    .replace(/mmhg|bpm|mg\/dl|breaths?|\/min|per minute|degrees?|°\s*[fc]?|lbs?\.?|pounds?|%/gi, "")
    .replace(/\b(ra|room air|on o2)\b/gi, "")
    .trim()
    .replace(/[,;]+$/, "")
    .trim();
}
// -> { vs:{...bare values}, o2RoomAir:bool|null, touched:[...] }
function normalizeVitals(raw) {
  const vs = {};
  const touched = [];
  let o2RoomAir = null;
  for (const [k, v] of Object.entries(raw || {})) {
    const key = canonVitalKey(k);
    if (!key) continue;
    if (key === "o2") {
      const s = String(v);
      if (/\bra\b|room air/i.test(s)) o2RoomAir = true;
      else if (/on o2|nasal cannula|\blpm\b/i.test(s)) o2RoomAir = false;
    }
    const val = stripUnits(v);
    if (!val) continue;
    vs[key] = val;
    touched.push(`${key.toUpperCase()} ${val}`);
  }
  return { vs, o2RoomAir, touched };
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
async function rewriteNoteText(note, fields, poc, cbTouched = [], vitalsTouched = []) {
  const anthropic = client();
  const changeLines = [];
  if (vitalsTouched.length) {
    changeLines.push(
      `- Vital signs are now: ${vitalsTouched.join(", ")}. If the narrative comments on vital signs, blood pressure, ` +
      `heart rate, oxygen or blood sugar, make it consistent with these values (e.g. do not call a normal BP "elevated").`
    );
  }
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

    // Work on this note's OWN copy of the plan-of-care data so a correction
    // never leaks into other notes.
    const setPoc = (patch) => { note.poc = { ...(note.poc || poc), ...patch }; };
    let vitalsTouched = [];
    const cbTouchedExtra = [];   // communication / medication / diagnosis edits

    // Structured field updates
    if (f.painLevel != null) note.painLevel = Number(f.painLevel);
    if (f.painLoc) note.painLoc = f.painLoc;
    if (f.painChar) setPoc({ painCharOverride: String(f.painChar).toLowerCase() });
    if (f.topic) note.topic = f.topic;
    if (f.nurseName) note.nurseName = f.nurseName;
    if (f.timeIn) note.timeIn = normTime(f.timeIn);
    if (f.timeOut) note.timeOut = normTime(f.timeOut);
    if (f.lastBM) note.lastBM = f.lastBM;

    // Vitals — normalized keys + units stripped (BP/HR/RR/T/BS/O2/weight).
    if (f.vitals && typeof f.vitals === "object") {
      const nv = normalizeVitals(f.vitals);
      if (Object.keys(nv.vs).length) note.vs = { ...(note.vs || {}), ...nv.vs };
      if (nv.o2RoomAir !== null) setPoc({ o2RoomAir: nv.o2RoomAir });
      vitalsTouched = nv.touched;
    }
    // O2 given on its own. The template prefers vs.o2, so set BOTH.
    if (f.o2Sat) {
      const val = stripUnits(f.o2Sat);
      if (val) {
        note.vs = { ...(note.vs || {}), o2: val };
        setPoc({ o2Sat: val });
        if (/\bra\b|room air/i.test(String(f.o2Sat))) setPoc({ o2RoomAir: true });
        else if (/on o2|nasal cannula|\blpm\b/i.test(String(f.o2Sat))) setPoc({ o2RoomAir: false });
        vitalsTouched.push(`O2 ${val}`);
      }
    }
    if (f.weight) note.vs = { ...(note.vs || {}), weight: stripUnits(f.weight) };

    // Plan-of-care text fields shown on the form
    if (f.allergies) setPoc({ allergies: f.allergies });
    if (f.diet) setPoc({ diet: f.diet });
    if (f.lungSounds) setPoc({ lungSounds: f.lungSounds });
    if (f.patientName) setPoc({ patient: { ...((note.poc || poc).patient || {}), name: f.patientName } });
    if (f.mrNumber) setPoc({ patient: { ...((note.poc || poc).patient || {}), mrNumber: f.mrNumber } });
    if (f.bpArmRestriction != null) setPoc({ bpArmRestriction: f.bpArmRestriction });

    // Wound + injection detail
    if (f.woundDesc) setPoc({ woundDesc: f.woundDesc });
    if (f.woundStage) setPoc({ woundStage: f.woundStage });
    if (f.woundCareOrder) setPoc({ woundCareOrder: f.woundCareOrder });
    if (f.dressingType) setPoc({ dressingType: f.dressingType });
    if (f.cleansingSolution) setPoc({ cleansingSolution: f.cleansingSolution });
    if (f.woundFrequency) setPoc({ woundFrequency: f.woundFrequency });
    if (f.injSite) note.injSite = f.injSite;
    if (f.injectable && typeof f.injectable === "object") {
      setPoc({ injectable: { ...((note.poc || poc).injectable || {}), ...f.injectable, found: true } });
    }

    // COMMUNICATION row (MD / PT / OT / ST / MS / RN / LVN / CHHA / Supervisor /
    // Pharmacist + the "Re:" text). These used to be hardcoded in the form.
    if (f.communication && typeof f.communication === "object") {
      const cur = (note.poc || poc).communication || {};
      setPoc({ communication: { ...cur, ...f.communication } });
      const on = Object.entries(f.communication)
        .filter(([k, v]) => v === true && k !== "re").map(([k]) => k.toUpperCase());
      if (on.length) cbTouchedExtra.push(`communication: ${on.join(", ")}`);
    }

    // Medication / diagnosis list edits — these feed the teaching content and
    // the pain-medication wording, so the narrative rewrite picks them up.
    const listEdit = (key, add, remove) => {
      const base = (note.poc || poc)[key];
      let list = Array.isArray(base) ? [...base] : [];
      for (const rm of (remove || [])) {
        const needle = String(rm).toLowerCase();
        list = list.filter(x => !String(x).toLowerCase().includes(needle));
      }
      for (const ad of (add || [])) {
        if (!list.some(x => String(x).toLowerCase().includes(String(ad).toLowerCase()))) list.push(ad);
      }
      setPoc({ [key]: list });
    };
    if (f.addMedications?.length || f.removeMedications?.length) {
      listEdit("medications", f.addMedications, f.removeMedications);
      if (f.addMedications?.length) cbTouchedExtra.push(`medication added: ${f.addMedications.join(", ")}`);
      if (f.removeMedications?.length) cbTouchedExtra.push(`medication removed: ${f.removeMedications.join(", ")}`);
    }
    if (f.addDiagnoses?.length || f.removeDiagnoses?.length) {
      listEdit("diagnoses", f.addDiagnoses, f.removeDiagnoses);
      if (f.addDiagnoses?.length) cbTouchedExtra.push(`diagnosis added: ${f.addDiagnoses.join(", ")}`);
      if (f.removeDiagnoses?.length) cbTouchedExtra.push(`diagnosis removed: ${f.removeDiagnoses.join(", ")}`);
    }

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
    cbTouched = cbTouched.concat(cbTouchedExtra);

    // Narrative rewrite so the paragraph agrees with the new values
    const needsRewrite = f.painLevel != null || f.o2Sat || f.topic || f.discharge != null ||
                         f.instruction || cbTouched.length || vitalsTouched.length ||
                         f.woundDesc || f.woundCareOrder || f.dressingType || f.injSite || f.injectable;
    if (needsRewrite) {
      try {
        note.intervention = await rewriteNoteText(note, f, note.poc || poc, cbTouched, vitalsTouched);
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
  if (f.vitals && typeof f.vitals === "object") {
    const nv = normalizeVitals(f.vitals);
    if (nv.touched.length) bits.push(nv.touched.join(", "));
  }
  if (f.weight) bits.push(`weight ${stripUnits(f.weight)}`);
  if (f.allergies) bits.push(`allergies ${f.allergies}`);
  if (f.diet) bits.push(`diet ${f.diet}`);
  if (f.lungSounds) bits.push(`lung sounds ${f.lungSounds}`);
  if (f.lastBM) bits.push(`last BM ${f.lastBM}`);
  if (f.painChar) bits.push(`pain character ${f.painChar}`);
  if (f.patientName) bits.push(`patient ${f.patientName}`);
  if (f.mrNumber) bits.push(`MR# ${f.mrNumber}`);
  if (f.injSite) bits.push(`injection site ${f.injSite}`);
  if (f.woundDesc || f.woundCareOrder || f.dressingType || f.cleansingSolution || f.woundFrequency || f.woundStage) bits.push("wound details");
  if (f.injectable) bits.push("injectable order");
  if (f.communication) {
    const on = Object.entries(f.communication).filter(([k, v]) => v === true && k !== "re").map(([k]) => k.toUpperCase());
    if (on.length) bits.push(`communication ${on.join("/")}`);
    if (f.communication.re) bits.push(`Re: ${f.communication.re}`);
  }
  if (f.addMedications?.length) bits.push(`+med ${f.addMedications.join(", ")}`);
  if (f.removeMedications?.length) bits.push(`−med ${f.removeMedications.join(", ")}`);
  if (f.addDiagnoses?.length) bits.push(`+dx ${f.addDiagnoses.join(", ")}`);
  if (f.removeDiagnoses?.length) bits.push(`−dx ${f.removeDiagnoses.join(", ")}`);
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
