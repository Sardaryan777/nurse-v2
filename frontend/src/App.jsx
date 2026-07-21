import { useState, useRef, useEffect } from "react";

// ── EMBEDDED VITAL SIGNS ─────────────────────────────────────────────────────
const VITAL_SIGNS_DB = [
  "T 97.4  HR 60  RR 16/min  BP Sitting 115/69 mmHg","T 97.5  HR 61  RR 17/min  BP Sitting 116/70 mmHg",
  "T 97.6  HR 62  RR 18/min  BP Sitting 117/71 mmHg","T 97.7  HR 63  RR 16/min  BP Sitting 118/72 mmHg",
  "T 97.8  HR 64  RR 17/min  BP Sitting 119/73 mmHg","T 97.4  HR 65  RR 18/min  BP Sitting 120/74 mmHg",
  "T 97.5  HR 66  RR 16/min  BP Sitting 121/75 mmHg","T 97.6  HR 67  RR 17/min  BP Sitting 122/76 mmHg",
  "T 97.7  HR 68  RR 18/min  BP Sitting 123/77 mmHg","T 97.8  HR 69  RR 16/min  BP Sitting 124/78 mmHg",
  "T 97.4  HR 70  RR 17/min  BP Sitting 125/79 mmHg","T 97.5  HR 71  RR 18/min  BP Sitting 126/80 mmHg",
  "T 97.6  HR 72  RR 16/min  BP Sitting 127/81 mmHg","T 97.7  HR 73  RR 17/min  BP Sitting 128/82 mmHg",
  "T 97.8  HR 74  RR 18/min  BP Sitting 129/83 mmHg","T 97.4  HR 75  RR 16/min  BP Sitting 130/69 mmHg",
  "T 97.5  HR 76  RR 17/min  BP Sitting 131/70 mmHg","T 97.6  HR 77  RR 18/min  BP Sitting 132/71 mmHg",
  "T 97.7  HR 78  RR 16/min  BP Sitting 133/72 mmHg","T 97.8  HR 79  RR 17/min  BP Sitting 134/73 mmHg",
  "T 97.4  HR 80  RR 18/min  BP Sitting 135/74 mmHg","T 97.5  HR 60  RR 16/min  BP Sitting 136/75 mmHg",
  "T 97.6  HR 61  RR 17/min  BP Sitting 137/76 mmHg","T 97.7  HR 62  RR 18/min  BP Sitting 138/77 mmHg",
  "T 97.8  HR 63  RR 16/min  BP Sitting 139/78 mmHg","T 97.4  HR 64  RR 17/min  BP Sitting 115/79 mmHg",
  "T 97.5  HR 65  RR 18/min  BP Sitting 116/80 mmHg","T 97.6  HR 66  RR 16/min  BP Sitting 117/81 mmHg",
  "T 97.7  HR 67  RR 17/min  BP Sitting 118/82 mmHg","T 97.8  HR 68  RR 18/min  BP Sitting 119/83 mmHg",
  "T 98.0  HR 72  RR 18/min  BP Sitting 120/76 mmHg","T 98.2  HR 76  RR 18/min  BP Sitting 124/80 mmHg",
  "T 98.0  HR 78  RR 16/min  BP Sitting 128/82 mmHg","T 97.9  HR 80  RR 17/min  BP Sitting 130/84 mmHg",
  "T 97.8  HR 75  RR 18/min  BP Sitting 132/80 mmHg","T 98.2  HR 76  RR 19/min  BP Sitting 138/85 mmHg",
  "T 98.0  HR 80  RR 17/min  BP Sitting 140/88 mmHg","T 97.9  HR 75  RR 18/min  BP Sitting 130/80 mmHg",
  "T 98.3  HR 86  RR 16/min  BP Sitting 140/88 mmHg","T 97.9  HR 70  RR 17/min  BP Sitting 134/75 mmHg",
  "T 98.0  HR 86  RR 16/min  BP Sitting 140/88 mmHg","T 98.5  HR 80  RR 18/min  BP Sitting 128/78 mmHg"
];

// ── HELPERS ──────────────────────────────────────────────────────────────────
function pickVS() {
  const line = VITAL_SIGNS_DB[Math.floor(Math.random() * VITAL_SIGNS_DB.length)];
  const t = line.match(/T\s+([\d.]+)/);
  const hr = line.match(/HR\s+(\d+)/);
  const rr = line.match(/RR\s+(\d+)/);
  const bp = line.match(/BP Sitting\s+([\d/]+)/);
  // Random blood sugar 90-210 mg/dL for diabetic patients
  const bs = Math.floor(100 + Math.random()*80); // 100-180 mg/dL, away from report thresholds
  const O2_LIST = [97,95,92,96,93,97,92,96,96,94,93,95,94,97,93,96,94,93,92,94,97,92,94,95,93,94,93,95,95,95,97,96,97,97,93,97,97,94,94,95,96,97,92,96,95,96,94,97,92,96,94,92,95,97,92,96,93,96,92,96,96,92,92,92,93,95,97,95,93,96,95,94,95,94,92,97,93,92,95,92,92,96,95,92,92,92,96,93,96,92,95,93,95,97,93,96,96,96,92,94];
  const o2 = O2_LIST[Math.floor(Math.random()*O2_LIST.length)];
  return { temp: t?.[1]||"98.0", hr: hr?.[1]||"76", rr: rr?.[1]||"18", bp: bp?.[1]||"128/80", bs: String(bs), o2: String(o2) };
}
function parseVL(line) { return pickVS(); } // compat
function fmtDate(d) { if(!d)return""; return `${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}/${d.getFullYear()}`; }
function fmtDateDot(d) { if(!d)return""; return `${String(d.getMonth()+1).padStart(2,"0")}.${String(d.getDate()).padStart(2,"0")}.${String(d.getFullYear()).slice(2)}`; }
function fmtTime(h,m,ap) { return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")} ${ap}`; }

// Injection site rotation — avoids left arm if restricted
// Why the SKILLED NURSE (not the caregiver) performed wound care this visit (review fix #6)
const SN_NECESSITY = [
  "Caregiver was unavailable at the time of this visit; SN performed wound care per physician order.",
  "Caregiver requested SN perform the dressing change and re-demonstrate proper technique this visit.",
  "Caregiver was unable to safely complete the dressing change due to patient positioning needs; SN performed wound care per order.",
  "Wound care performed by SN this visit at patient/caregiver request per physician order.",
  "SN performed wound care this visit to assess wound progress and reinforce caregiver technique; caregiver observed the procedure."
];
const WOUND_TEACHING_EARLY = [
  ["INFECTION SIGNS & SYMPTOMS", "signs and symptoms of wound infection — increased drainage, foul odor, fever, spreading redness, swelling, warmth, or increased pain — and reporting them promptly to the physician/home health agency"],
  ["HAND HYGIENE & CLEAN TECHNIQUE", "hand hygiene before and after any contact with the wound or dressing, and clean technique principles to prevent contamination"],
  ["KEEPING DRESSING CLEAN & DRY", "keeping the dressing clean, dry, and intact between visits, and notifying the nurse if the dressing becomes wet, soiled, or loosened"],
  ["WHEN TO NOTIFY PHYSICIAN", "when to notify the physician: wound deterioration, new drainage or odor, bleeding, fever, increased pain, or any change in wound appearance"],
  ["SAFE DRESSING DISPOSAL", "safe disposal of soiled dressings and contaminated materials, and keeping wound care supplies clean and organized"],
  ["CAREGIVER WOUND CARE TECHNIQUE", "caregiver wound care technique per physician order, with return demonstration observed and reinforced by SN"]
];
const WOUND_TEACHING_MID = [
  ["PRESSURE RELIEF & OFFLOADING", "pressure relief, offloading the affected area, and repositioning to support wound healing and prevent additional breakdown"],
  ["MOISTURE CONTROL", "keeping the wound area and surrounding skin folds clean and dry, moisture control, and protecting the periwound skin"],
  ["NUTRITION & PROTEIN FOR HEALING", "the role of adequate protein intake, nutrition, and hydration in wound healing and tissue repair"],
  ["BLOOD SUGAR CONTROL & WOUND HEALING", "the effect of blood sugar control on wound healing, since elevated glucose slows tissue repair and increases infection risk"],
  ["PAIN MANAGEMENT WITH WOUND CARE", "pain management before and during dressing changes, using ordered comfort measures and reporting pain not controlled by current measures"],
  ["SKIN INSPECTION & FALL SAFETY", "daily skin inspection, avoiding scratching or picking at the wound, and fall prevention during transfers and wound care positioning"]
];
const WOUND_TEACHING_LATE = [
  ["PROTECTING HEALING TISSUE", "protecting fragile new epithelial tissue from friction, shearing, and pressure as the wound closes"],
  ["PREVENTING RECURRENCE", "preventing wound recurrence: maintaining a clean, dry skin area, avoiding friction and prolonged pressure, and continuing daily skin checks"],
  ["MONITORING FOR REOPENING", "monitoring the healed/healing site for reopening, drainage, redness, warmth, odor, or increased pain, and reporting promptly"],
  ["ONGOING SKIN CHECKS", "continuing routine skin inspection and moisture control after skilled nursing ends, and when to contact the physician or agency"]
];
function getWoundTeaching(band, dayIdx, isDiabetic) {
  let pool = band === "early" ? WOUND_TEACHING_EARLY
           : band === "mid" ? WOUND_TEACHING_MID
           : WOUND_TEACHING_LATE;                       // late / final / healed
  if (!isDiabetic) pool = pool.filter(t => t[0].indexOf("BLOOD SUGAR") === -1);
  return pool[dayIdx % pool.length];
}

const BID_TEACHING = [
  "Instructed patient/caregiver on signs and symptoms of hypoglycemia (shakiness, sweating, confusion, dizziness, rapid heartbeat) and to treat promptly with fast-acting sugar, rechecking blood sugar in 15 minutes.",
  "Instructed patient/caregiver on signs and symptoms of hyperglycemia (increased thirst, frequent urination, fatigue, blurred vision) and to notify MD if blood sugar remains elevated.",
  "Reinforced proper injection site care and rotation to prevent lipohypertrophy; instructed to inspect sites daily and report redness, swelling, or hard lumps.",
  "Reviewed proper glucometer technique: wash hands before testing, rotate puncture sites, record all results, and bring the log to MD appointments.",
  "Instructed on proper insulin storage: keep current pen at room temperature away from heat and sunlight, refrigerate unopened pens, and check expiration dates before use."
];
const INJ_SITES = ["abdomen RUQ","abdomen LUQ","abdomen RLQ","abdomen LLQ","right thigh","left thigh","right upper arm","left upper arm"];
function getInjSite(index, leftArmRestricted) {
  const sites = leftArmRestricted ? INJ_SITES.filter(s => s !== "left upper arm") : INJ_SITES;
  return sites[index % sites.length];
}

// Parse bulk date/time input: "03/25/2026 11:00-11:45" per line → [{date, timeIn, timeOut}]
function parseBulkInput(text) {
  const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);
  const entries = [];
  let currentNurse = "";   // grouped "Nurse: X" header carries forward until the next header
  for (const line of lines) {
    // Grouped nurse header line: "Nurse: Anna Petrosyan" (no date on the line)
    const headerMatch = line.match(/^nurse\s*[:\-]\s*(.+)$/i);
    if (headerMatch && !/\d{1,2}[\/\.]\d{1,2}[\/\.]\d{2,4}/.test(line)) {
      currentNurse = headerMatch[1].trim();
      continue;
    }
    // Inline nurse on a date line: "04/16/2026 10:00-10:45 Nurse: Anna Petrosyan"
    let inlineNurse = "";
    const inlineMatch = line.match(/nurse\s*[:\-]\s*(.+)$/i);
    if (inlineMatch) inlineNurse = inlineMatch[1].trim();
    // Match MM/DD/YYYY then two times. Times may be 24hr (07:00) or 12hr with am/pm (08:00 pm)
    const m = line.match(/(\d{1,2}[\/\.]\d{1,2}[\/\.]\d{2,4})\s+(\d{1,2}:\d{2}(?:\s*[apAP][mM])?)\s*(?:-|–|—|to)\s*(\d{1,2}:\d{2}(?:\s*[apAP][mM])?)/i);
    if (m) {
      const dateParts = m[1].split(/[\/\.]/);
      let yr = dateParts[2]; if (yr.length === 2) yr = "20" + yr;
      const dateObj = new Date(parseInt(yr), parseInt(dateParts[0])-1, parseInt(dateParts[1]));
      dateObj.setHours(12,0,0,0);
      // Normalize times: trim, uppercase am/pm
      const normTime = t => t.trim().replace(/\s*([apAP])[mM]/, (x,a)=>" "+a.toUpperCase()+"M");
      entries.push({ date: dateObj, timeIn: normTime(m[2]), timeOut: normTime(m[3]), nurseName: inlineNurse || currentNurse, raw: line });
    } else {
      // Try just a date with no time
      const dm = line.match(/(\d{1,2}[\/\.]\d{1,2}[\/\.]\d{2,4})/);
      if (dm) {
        const dp = dm[1].split(/[\/\.]/);
        let yr = dp[2]; if (yr.length === 2) yr = "20" + yr;
        const dateObj = new Date(parseInt(yr), parseInt(dp[0])-1, parseInt(dp[1]));
        dateObj.setHours(12,0,0,0);
        entries.push({ date: dateObj, timeIn: "", timeOut: "", nurseName: inlineNurse || currentNurse, raw: line });
      }
    }
  }
  return entries;
}

const MONTHS=["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS=["Su","Mo","Tu","We","Th","Fr","Sa"];

// Strip a nurse's trailing credential(s) so only "Surname, First" remains.
function stripNurseTitle(name) {
  let n = String(name || "").trim();
  let prev;
  do { prev = n; n = n.replace(/[\s,\/\-]+(RN|LVN|LPN|BSN|MSN|NP|APRN|CNA|CHHA|HHA)\.?$/i, "").trim(); } while (n !== prev);
  return n.replace(/[,\/\-\s]+$/, "").trim();
}
// Parse a cert-period date ("MM/DD/YYYY", "YYYY-MM-DD", "MM-DD-YYYY") -> Date | null
function parseCertDate(s) {
  if (!s) return null;
  s = String(s).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) { const d = new Date(+m[1], +m[2]-1, +m[3]); return isNaN(d) ? null : d; }
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m) { let y = +m[3]; if (y < 100) y += 2000; const d = new Date(y, +m[1]-1, +m[2]); return isNaN(d) ? null : d; }
  const d = new Date(s); return isNaN(d) ? null : d;
}

// ── SYSTEM PROMPT — extract POC info ─────────────────────────────────────────
const EXTRACT_PROMPT = `You are an expert LVN. Extract ALL information from this CMS-485 Plan of Care and return ONLY valid compact JSON (no markdown, no backticks, no explanation).

Detect stage automatically:
- If "Start of Care", "SOC", "Admit" → stage = "SOC"  
- If "Recertif" → stage = "RECERT"
- If "Discharge" → stage = "DISCHARGE"

Return this exact structure:
{"stage":"SOC","patient":{"name":"","mrNumber":"","weight":"","dob":""},"agency":{"name":"","phone":""},"physician":{"name":""},"pcg":{"name":"","phone":""},"certPeriodStart":"","certPeriodEnd":"","snvFrequency":"","diagnoses":[],"medications":[],"diet":"low fat, low cholesterol","allergies":"NKDA","fallRiskScore":"","weight":"","referencesExternal487":false,"lungSounds":"clear","hasTremor":false,"hasVertigo":false,"hasPVD":false,"homeboundFlags":{"limitedEndurance":true,"limitedStrength":true,"assistADL":true,"unevenSurfaces":true,"confusion":false,"unableToLeaveAlone":true,"poorCoordination":false,"taxingEffort":true},"deficits":{"poorVision":false,"legallyBlind":false,"hoh":false,"deaf":false,"sob":false,"sobExertion":"","cough":false,"urinaryIncontinence":false,"bowelIncontinence":false,"urinaryFrequency":false,"urinaryUrgency":false,"edema":false,"stiffJoints":false,"weakness":false,"limitedROM":false,"unsteadyBalance":false},"hasCaregiver":false,"hasPleurX":false,"hasParalysis":false,"isBedbound":false,"hasWound":false,"woundDesc":"","woundStage":"","wounds":[],"woundIsPressure":false,"caregiverPerformsWoundCare":false,"bpArmRestriction":"","o2RoomAir":true,"o2Threshold":"","woundCareOrder":"","cleansingSolution":"","dressingType":"","woundSupplies":"","woundFrequency":"","hasContracture":false,"hasDysphagia":false,"proneToAspiration":false,"hasWheelchair":false,"hasWalker":false,"hasCane":false,"o2Sat":"96","isDiabetic":false,"leftArmRestricted":false,"injectable":{"found":false,"name":"","dose":"","route":"subcutaneous","frequency":"","instruction":""},"mentalStatus":{"oriented":true,"alert":true,"forgetful":true,"confusedAtTimes":true,"anxious":true,"depressedControlled":true,"agitated":false},"teachingTopics":[],"homebound":""}

RULES:
- stage: exactly "SOC", "RECERT", or "DISCHARGE"  
- diagnoses: ["CODE - Description", ...] — copied VERBATIM from this document ONLY. NEVER invent, infer, or add typical/expected diagnoses
- medications: ["full medication string", ...] — copied VERBATIM from this document ONLY. NEVER invent, infer, or add typical/expected medications. If the document references an external med list (e.g. "See Meds 487") that is not attached, extract ONLY the medications visibly printed here and nothing more
- teachingTopics: ordered list of 9 SHORT ALL-CAPS topic labels (2-5 words each). Derived from diagnoses, most acute first. For RECERT/DISCHARGE: last topic = "MEDICATION SAFETY & DISCHARGE PLANNING". Examples: "ACUTE RESPIRATORY FAILURE", "HOME SAFETY & FALL PRECAUTIONS", "ANXIETY & LORAZEPAM MEDICATION", "BENIGN PROSTATIC HYPERPLASIA", "BIPOLAR DISORDER", "DEPRESSION & CITALOPRAM MEDICATION", "DIFFICULTY IN WALKING", "HYPERLIPIDEMIA & ROSUVASTATIN", "PAIN MANAGEMENT & TYLENOL"
- hasPleurX: true if PleurX catheter mentioned in document\n- hasParalysis: true ONLY if paralysis, paraplegia, hemiplegia, or quadriplegia is explicitly diagnosed. Default false — do NOT assume paralysis from weakness or difficulty walking\n- hasCaregiver: true if PCG, caregiver, family member, or caregiver involvement is documented in the POC. Default false
- isBedbound: true if Complete Bedrest, bedbound, or bedrest is marked in Activities Permitted or functional limitations
- hasWound: true if pressure ulcer, wound, decubitus, or wound care orders present. woundDesc: brief location description (e.g. "coccyx and right hip pressure ulcers"). woundStage: stage if stated (e.g. "1")
- wounds: array of wound objects, one per distinct wound site found ANYWHERE in the document (diagnoses, orders, 487, supplies, goals). Each: {"location":"","type":"","stage":"","size":"","drainage":"","odor":"","periwound":"","woundBed":"","careOrder":""}. Search terms: wound, ulcer, pressure ulcer, decubitus, stage, drainage, dressing, cleanse, NS/normal saline, gauze, foam, calcium alginate, hydrocolloid, silver, xeroform, Santyl, Betadine, Kerlix, compression, offloading, diabetic/venous/arterial/surgical ulcer. Fill each field ONLY with what the document states VERBATIM — leave "" when not documented. NEVER invent measurements, stages, drainage amounts, odor, or dressing types
- woundIsPressure: true ONLY if the wound is a pressure injury/ulcer/decubitus (stage documented or pressure etiology stated). false for open wounds, surgical wounds, moisture/skin-fold wounds, venous/arterial/diabetic ulcers described without pressure etiology
- caregiverPerformsWoundCare: true if the orders state the CAREGIVER is to perform routine/daily wound care (SN performs when caregiver unavailable or on request)
- bpArmRestriction: "right" or "left" if the document restricts BP measurement in that arm (mastectomy, lymphedema, AV fistula, "no BP right arm"); "" if no restriction
- o2RoomAir: false ONLY if the patient is documented on supplemental oxygen; true otherwise (sat measured on room air)
- o2Threshold: the notification threshold number if the POC says to notify MD/RN when O2 sat falls below a value (e.g. "notify if SpO2 < 90" → "90"); "" if none stated
- medications: EXCLUDE any medication marked discontinued, DC'd, stopped, or ended — only ACTIVE medications
- woundCareOrder: the EXACT wound care order text from the document (e.g. "Clean with NS, pat dry, apply triple antibiotic cream, secure with 4x4"). "" if none found
- cleansingSolution/dressingType/woundSupplies/woundFrequency: extracted verbatim from orders/supplies; "" when not stated
- hasContracture: true if contracture diagnosis or functional limitation listed
- hasDysphagia: true if dysphagia diagnosed. proneToAspiration: true if dysphagia or aspiration risk documented
- lungSounds: "clear" unless 485 documents wheezes/crackles/diminished (then use that word, e.g. "anterior wheezes")
- hasTremor: true if tremor diagnosis (essential tremor, Parkinson's) in diagnosis list\n- hasVertigo: true if vertigo or dizziness disorder diagnosed (e.g. H81.x peripheral vertigo)
- referencesExternal487: true if this 485 references an external form (\"See 487\", \"See Meds 487\", \"see addendum\") whose content is NOT attached to this request\n- mentalStatus.depressedControlled: true when item 19 marks Depressed AND an antidepressant/psychiatric medication (bupropion, escitalopram, sertraline, citalopram, aripiprazole, etc.) is in the med list
- hasPVD: true if peripheral vascular/arterial disease diagnosed
- hasWalker/hasCane/hasWheelchair: true ONLY if that device is in DME/supplies or activities permitted. Do NOT default to true
- homeboundFlags: read the 485's homebound statement and set each flag from it: limitedEndurance, limitedStrength, assistADL (needs assistance for activities), unevenSurfaces, confusion (only if confusion listed as homebound reason), unableToLeaveAlone, poorCoordination, taxingEffort
- mentalStatus: set each flag true ONLY if documented in Mental Status section (item 19) or medical summary. depressedControlled=true ONLY if depression documented AND a psychiatric medication exists in med list
- deficits.sobExertion: when SOB is documented, extract the exertion level EXACTLY as the 485 states it: "rest", "minimal", or "moderate" (e.g. "SOB w/mod exertion" → "moderate"). NEVER change the documented level. If SOB documented without a level, use "moderate"
- deficits: set each flag true ONLY if that finding is explicitly documented as a CURRENT finding. IGNORE symptoms that appear only in report-to-MD parameters, warning lists, or 'notify MD if...' instructions (e.g. 'report blurred vision' does NOT mean the patient has poor vision) in this 485/POC (functional limitations, medical summary, diagnoses, item 99). Do NOT assume or default any deficit to true. Examples: poorVision only if impaired/blurred vision documented; hoh only if HOH/hearing impairment; sob only if SOB/dyspnea; urinaryIncontinence/bowelIncontinence only if incontinence documented; edema only if edema documented; stiffJoints/weakness/limitedROM/unsteadyBalance only if documented
- isDiabetic: true if diabetes, insulin, blood sugar monitoring, or diabetic care mentioned
- leftArmRestricted: true if left mastectomy, left-arm restriction, or "no BP/blood draw left arm" mentioned
- injectable: search the ENTIRE 485/487 document — medication list, nursing orders, treatment orders, goals, and any other section — for any INJECTABLE medication (insulin, Lantus, Solostar, Humalog, Novolog, enoxaparin, Lovenox, B12, etc). If found, set found=true and extract: name (e.g. "Lantus Solostar Insulin"), dose (e.g. "30 units"), route ("subcutaneous"), frequency ("twice daily" or "once daily"), instruction (brief admin note). If no injectable, found=false.`;

// ── NOTE GENERATION PROMPT ────────────────────────────────────────────────────
const NOTE_PROMPT = `You are an experienced LVN writing a home health clinical note INTERVENTION section. Write real, concise documentation — NOT a textbook essay. {WORDS} words total.

STRICT DATA RULE: Only mention diagnoses, medications, treatments, and findings that are listed below. Never invent inhalers, insulin, oxygen, wounds, catheters, diabetes, COPD, or any condition not in the data.

VISIT CONTEXT:
- Teaching topic: {TOPIC}
- Visit phase: {PHASE}
- Pain level: {PAIN}/10  |  Pain location: {PAINLOC}  |  Pain character: {PAINCHAR}
- Pain medication available: {PAINMED}
- Subject: {SUBJECT}  (write for this subject — "patient" or "patient/caregiver")
- Note #{NUM} of {TOTAL}
- Diagnoses (ONLY these): {DIAGNOSES}
- Medications (ONLY these): {MEDS}
- Visit-specific observations to include: {OBS}
- Respiratory medication present: {HAS_RESP}
- Assistive device: {DEVICE}  (CONSISTENCY RULE: mention ONLY this device in ALL narrative — never any other device; if "none", never mention any ambulation device)
- Edema: {EDEMA}  (CONSISTENCY RULE: if "none documented", NEVER mention edema anywhere in the note)
- SOB level: {SOBLEVEL}  (CONSISTENCY RULE: use this EXACT exertion level in narrative — never change severity)
- Mental status: {MENTAL}  (CONSISTENCY RULE: narrative must match these exact findings — do not add or drop alert/oriented)
- Mobility status: {MOBILITY}  (if BEDBOUND: NEVER write that patient stood, walked, ambulated, or used a walker/cane — patient is on complete bedrest; pain wording must use "increased with repositioning and turning" instead of standing/ambulation)
{INJECTION_INFO}

Write the INTERVENTION as 4 short blocks (concise, clinical):

BLOCK 1 — LVN visit actions (3-4 sentences):
"{SUBJECT_CAP} was contacted prior to visit. LVN completed skilled observation and focused assessment/data collection per plan of care. Vital signs obtained and recorded. Lung and heart sounds monitored. Pain level reviewed. Medication compliance, diet adherence, homebound status, and safety measures were reviewed. Hand washing performed before and after patient care."

BLOCK 2 — Pain + visit observations (3-4 sentences):
State pain: "Patient reported {PAINCHAR} {PAINLOC} pain rated {PAIN}/10" — wording MUST match the level:
- 4-5/10: pain increased with activity (if BEDBOUND: with repositioning and turning, NOT standing/walking), partially relieved by rest, repositioning, and {PAINMED_PHRASE}.
- 2-3/10: mild pain, managed with rest, repositioning, gentle activity, and {PAINMED_PHRASE}.
- 1/10: minimal discomfort only; no intervention beyond routine comfort measures needed.
Never write severe-pain language for a low score or minimizing language for a high score. If the level dropped vs typical, it can read as improvement; if it rose, note it fluctuated with activity.
Then weave in the visit-specific observations naturally.
{INJECTION_SENTENCE}

BLOCK 3 — Teaching (4-6 sentences) on {TOPIC}, individualized to the patient's ACTUAL diagnoses/meds. If respiratory teaching and NO respiratory med present, do NOT mention inhalers/nebulizers — instead teach avoiding irritants, pacing activity, monitoring symptoms. Only name medications from the list above.

BLOCK 4 — MD/911 (1-2 sentences): when to notify MD (worsening pain, uncontrolled BP, new dizziness, falls, signs of infection, change in condition) and call 911 (chest pain, severe breathing difficulty, stroke symptoms, loss of consciousness, serious fall injury).

RULES: Never write his/her, he/she, s/he, their, or [placeholders]. Never say "evaluation and assessment of all body systems" (RN-level) — use LVN wording (observed, monitored, reviewed, reinforced). Vary wording from prior notes. IF PHASE IS FINAL_DISCHARGE: do NOT write "continues to require skilled observation", "continued skilled teaching", "needs further assessment", "requires follow-up teaching", or "continue plan of care" — instead state that skilled nursing goals have been met / maximum benefit achieved and patient is appropriate for discharge. Return ONLY the paragraph text, no block labels.`;

// ── WOUND NOTE PROMPT ─────────────────────────────────────────────────────────
const WOUND_NOTE_PROMPT = `You are an experienced LVN writing a home health WOUND CARE visit note INTERVENTION section. Write real, concise skilled documentation — 180-280 words for a routine visit. Only go up to 400 words when clinically justified (discharge/final note, wound worsening, abnormal vitals, MD/RN notification, caregiver re-demonstration). Not every note should be long — over-detailed routine notes look generated.

STRICT DATA RULE: Only document wound details listed below. NEVER invent wound measurements, stages, drainage amounts, odor, wound bed findings, dressing types, or locations that are not provided. If a detail is blank/unknown, use conservative wording ("per physician order", "per plan of care").

VISIT CONTEXT:
- Wound teaching topic this visit: {WTOPIC}
- Wound(s) — document EACH separately, never merge: {WOUNDS}
- WOUND STAGE / CARE MODE THIS VISIT (controls what care is documented): {WSTAGE}
- OBJECTIVE FINDINGS THIS VISIT — document these exact values as what was observed (measurement, wound bed, drainage, edges): {WFINDINGS}
- Why SN (not caregiver) performed wound care this visit: {WNECESSITY}
- Wound care order (follow EXACTLY, never substitute solutions/dressings): {WORDER}
- Dressing type: {WDRESSING}   (if "not specified": write "dressing changed per physician order and agency protocol" — do NOT invent one)
- Visit phase: {PHASE}  |  Note #{NUM} of {TOTAL}
- Diagnoses (ONLY these): {DIAGNOSES}
- Pain: {PAIN}/10 {PAINLOC}
- Subject: {SUBJECT}
- Mobility: {MOBILITY}  |  Assistive device: {DEVICE}
- Mental status: {MENTAL}
{INJECTION_INFO}

Write ONE flowing intervention with this structure:
1. Arrival block: "SN arrived for scheduled skilled nursing visit. Patient identified by two identifiers. Vital signs checked and recorded. Patient assessed for pain, respiratory status, cardiovascular status, safety, skin integrity, and homebound status. Hand hygiene performed before and after patient care."
2. Wound assessment — DOCUMENT THE ACTUAL FINDINGS, not just what was assessed (an auditor's rule: "stating that something was assessed is not the same as documenting the findings"). Write the objective findings from {WFINDINGS}: current measurement, wound bed appearance (granulation/epithelial %), drainage type and amount, wound edges, periwound skin. Note the change from prior visits naturally (e.g. "decreased from prior visit", "granulation increasing"). If NO measurement data exists, use qualitative progression wording only — never invent numbers.
3. State {WNECESSITY} if provided (skip if 'not applicable'), then wound care — FOLLOW THE CARE MODE in {WSTAGE}: OPEN WOUND → full care per the order EXACTLY; NEARLY HEALED → minimal protective dressing/barrier, protection and monitoring focus; HEALED → NO cleansing/dressing-change language at all — skin integrity monitoring, moisture control, friction protection only. When performing full care, follow the order EXACTLY (e.g. cleansing solution, application, securing). Base: "Wound care was performed per plan of care. Wound was cleansed as ordered, periwound skin protected, and new dressing applied. Patient tolerated wound care procedure without adverse reaction." If multiple wounds: "Wound #1: [location]... Wound #2: [location]..." separately.
4. {INJECTION_SENTENCE}
5. Teaching (3-5 sentences) on {WTOPIC}, individualized to the patient's actual diagnoses.
6. Close: homebound status + "Plan is to continue skilled nursing visits for wound care, assessment, and teaching per plan of care." (unless FINAL_DISCHARGE phase — then goals met / appropriate for discharge wording).

DISCHARGE CONSISTENCY (critical audit rule): the final discharge note's wound findings and goal statements must AGREE. If {WFINDINGS} shows the wound closed/epithelialized → document closure AND "wound care goals met". Only make goal-met claims that the documented findings support.
RULES: Write like a real nurse charting a real patient — natural, specific, varied. Open sentences differently in each note; never reuse identical phrasing from prior notes; let the wound findings tell a believable healing story visit to visit. LVN wording only (observed, monitored, performed, reinforced). Never his/her, s/he, their, [placeholders]. IF PHASE IS FINAL_DISCHARGE: include final wound assessment summary, do NOT write "continue plan of care" — write skilled nursing goals met / maximum benefit achieved and appropriate for discharge. Return ONLY the paragraph text.`;

// ── VARIATION PROMPT ──────────────────────────────────────────────────────────
const VARIATION_PROMPT = `Rewrite this nursing intervention paragraph with COMPLETELY DIFFERENT wording, sentence structure, and phrasing. Keep ALL the same clinical meaning and actions. Use synonyms throughout. Change sentence order. Must sound like a different nurse wrote it on a different day. Return ONLY the rewritten text, nothing else.

Original:
{TEXT}`;

// PAIN RULE (CMS-485-based): range depends on what the 485 supports; variation is
// natural, never one fixed number, never a robotic sequence. Same day shares a level.
function painSupportedHigher(poc) {
  const dx = stripNegated((poc.diagnoses||[]).join(" "));
  const terms = ["sciatica","radiculopathy","arthritis","osteoarthritis","spondylosis","chronic pain","dorsalgia","back pain","neuropath","fibromyalgia","fracture","stenosis","gout","pain in"];
  if (terms.some(t => dx.includes(t))) return true;
  if (poc.hasWound) return true;                       // wound condition supports higher pain
  if (findPainMed(poc.medications)) return true;       // ordered analgesic implies documented pain
  return false;
}
function getPainLevelByVisit(dayIdx, totalDays, poc, phase) {
  // Spec example patterns — cycled with a drifting offset so long series never repeat exactly
  const HIGH = [5,4,3,4,2,3,3,2,4,3,2,2];
  const LOW  = [3,2,2,3,3,1,1,2,3,2,1,2];
  const supported = painSupportedHigher(poc||{});
  const pat = supported ? HIGH : LOW;
  const shift = Math.floor(dayIdx / pat.length);          // drift each cycle
  let lvl = pat[(dayIdx + shift) % pat.length];
  // Late-episode bias downward (healing/teaching effect) — still varies, never flat
  const f = totalDays <= 1 ? 0 : dayIdx / (totalDays - 1);
  if (f > 0.75) lvl = Math.min(lvl, supported ? 3 : 2);
  if (phase === "FINAL_DISCHARGE" || phase === "PRE_DISCHARGE") lvl = Math.min(lvl, 2);
  return Math.max(1, lvl);
}

// Visit phase based on position in episode
function getVisitPhase(index, totalVisits, dischargeOn, isLast) {
  if (isLast && dischargeOn) return "FINAL_DISCHARGE";
  if (dischargeOn && totalVisits > 2 && index >= totalVisits - 2) return "PRE_DISCHARGE";
  if (totalVisits <= 1) return "EARLY";
  const p = index / (totalVisits - 1);
  if (p < 0.34) return "EARLY";
  if (p < 0.67) return "MIDDLE";
  return "LATE";
}

// Skilled observation bank — rotate for visit-specific detail
const SKILLED_OBS = [
  "Patient required verbal cueing for safe transfer technique.",
  "Patient denied chest pain, dizziness, or acute shortness of breath at rest.",
  "Patient demonstrated improved medication recall with caregiver assistance.",
  "Patient required reinforcement of instructions due to forgetfulness.",
  "No new open areas or skin breakdown observed or reported.",
  "Appetite fair; patient encouraged to maintain prescribed diet.",
  "Patient reported no falls since prior visit.",
  "Lung sounds monitored; respirations even and unlabored at rest.",
  "Patient tolerated visit without acute distress."
];
const SKILLED_OBS_BEDBOUND = [
  "Patient repositioned with caregiver assistance; skin over bony prominences inspected.",
  "Caregiver demonstrated proper repositioning technique with verbal cueing from SN.",
  "Patient denied chest pain or dizziness at rest; respirations even and unlabored.",
  "Wound site inspected; dressing dry and intact prior to care.",
  "Passive range of motion status observed; contractures noted without acute change.",
  "Patient demonstrated improved medication recall with caregiver assistance.",
  "Patient required reinforcement of instructions due to forgetfulness.",
  "No new areas of skin breakdown observed beyond documented wound sites.",
  "Appetite fair; caregiver encouraged to maintain prescribed diet with upright positioning during meals.",
  "Head of bed elevated during and after meals due to dysphagia risk.",
  "Patient remained on bedrest per plan of care; pressure-relief schedule reviewed with caregiver.",
  "Patient alert and oriented with forgetfulness and intermittent confusion noted.",
  "Incontinence care reviewed; perineal skin observed intact aside from documented wounds.",
  "Patient tolerated visit without acute distress."
];
function getObsForVisit(index, count=3, poc={}) {
  const df = poc.deficits||{};
  const ms = poc.mentalStatus||{};
  const device = getAssistiveDevice(poc);
  const pool = [...(poc.isBedbound ? SKILLED_OBS_BEDBOUND : SKILLED_OBS)];
  // RULE 1: device observations use THE documented device only — never invent one
  if (device && !poc.isBedbound) {
    pool.unshift(`Patient ambulated slowly with ${device} with supervision; reminded to use the ${device} consistently for all ambulation.`);
    pool.push(`Patient used the ${device} appropriately after cueing; fall precautions reinforced.`);
  }
  // RULE 2: edema observation ONLY when 485 documents edema; progression wording by visit position
  if (df.edema && !poc.isBedbound) {
    pool.push(index === 0
      ? "Bilateral lower extremity non-pitting edema was noted during the current visit."
      : "Bilateral lower extremity non-pitting edema remained present without acute worsening.");
  }
  // RULE 3: SOB observation matches the documented exertion level exactly
  if (df.sob) {
    const lvl = df.sobExertion || "moderate";
    pool.push(`Mild shortness of breath noted with ${lvl} exertion, relieved by rest.`);
  }
  // RULE 4: mental-status observation built from the SAME normalized data as the checkboxes
  const mParts = [];
  if (ms.alert !== false) mParts.push("alert");
  if (ms.oriented !== false) mParts.push("oriented");
  let mLine = mParts.length ? `Patient was ${mParts.join(" and ")} during the visit` : "Patient's mental status observed during the visit";
  const mExtra = [];
  if (ms.forgetful) mExtra.push("intermittent forgetfulness");
  if (ms.confusedAtTimes) mExtra.push("confusion at times");
  if (mExtra.length) mLine += `, with ${mExtra.join(" and ")} requiring repetition and cueing`;
  pool.push(mLine + ".");
  const out = [];
  for (let i = 0; i < count; i++) out.push(pool[(index*3 + i) % pool.length]);
  return out;
}

// ── 485/POC VALIDATION & LVN-SAFETY HELPERS ─────────────────────────────────
function buildPOCSource(poc) {
  return [
    (poc.diagnoses||[]).join(" "),
    (poc.medications||[]).join(" "),
    poc.diet||"", poc.homebound||"", poc.allergies||"",
    (poc.teachingTopics||[]).join(" ")
  ].join(" ").toLowerCase();
}
function pocSupports(poc, term) {
  return buildPOCSource(poc).includes(String(term||"").toLowerCase());
}
function hasRespiratoryMed(meds=[]) {
  const terms=["albuterol","ventolin","proair","xopenex","atrovent","ipratropium","spiriva","tiotropium","symbicort","advair","breo","trelegy","flovent","pulmicort","budesonide","duoneb","nebulizer","inhaler"];
  return meds.some(m=>terms.some(t=>String(m).toLowerCase().includes(t)));
}
function findPainMed(meds=[]) {
  const s=meds.map(m=>String(m).toLowerCase());
  // Opioid combos first — name the actual ordered drug, not just the acetaminophen component
  if(s.some(m=>m.includes("hydrocodone"))) return "Hydrocodone-Acetaminophen";
  if(s.some(m=>m.includes("oxycodone")&&m.includes("acetaminophen"))) return "Oxycodone-Acetaminophen";
  if(s.some(m=>m.includes("oxycodone"))) return "Oxycodone";
  if(s.some(m=>m.includes("norco"))) return "Norco";
  if(s.some(m=>m.includes("tramadol"))) return "Tramadol";
  if(s.some(m=>m.includes("meloxicam"))) return "Meloxicam";
  if(s.some(m=>m.includes("ibuprofen")||m.includes("advil"))) return "Ibuprofen";
  if(s.some(m=>m.includes("gabapentin"))) return "Gabapentin";
  if(s.some(m=>m.includes("tylenol")||m.includes("acetaminophen"))) return "Tylenol";
  return null;
}
// Pain location consistent with teaching topic + diagnoses
function getPainLocation(topic, diagnoses) {
  const t=stripNegated(topic);
  const dx=stripNegated((diagnoses||[]).join(" "));
  const all = t + " " + dx;
  // Sciatica / radiculopathy with leg pain — side-specific
  const rightSide = all.includes("right side")||all.includes("right lower leg")||all.includes("right leg")||all.includes("sciatica, right");
  const leftSide = all.includes("left side")||all.includes("left lower leg")||all.includes("left leg")||all.includes("sciatica, left");
  const hasSciatica = all.includes("sciatica")||all.includes("radiculopathy");
  const hasBack = all.includes("back")||all.includes("lumbar")||all.includes("dorsalgia");
  const hasKnee = all.includes("knee");
  if(hasSciatica && rightSide) return "right lower back and right leg";
  if(hasSciatica && leftSide) return "left lower back and left leg";
  if(hasSciatica) return "lower back radiating to leg";
  if(hasBack && hasKnee) return "lower back and knee";
  if(all.includes("left knee")) return "left knee";
  if(all.includes("right knee")) return "right knee";
  if(hasKnee||all.includes("osteoarthritis")) return "knee";
  if(hasBack) return "lower back";
  return "lower back";
}
// WOUND HEALING TRAJECTORY — a healing CURVE, not a mathematical line (spec §2-3).
// Plateaus early, drainage improves before size, depth resolves before length/width,
// steps are irregular, and the final 3-5 visits transition to nearly-healed/healed logic.
// NEVER invents a measurement when the 485 documents none — qualitative wording only.
function getWoundProgress(wound, dayIdx, totalDays, dischargeOn) {
  const f = totalDays <= 1 ? 0 : Math.min(1, dayIdx / (totalDays - 1));
  const willClose = dischargeOn;
  // Piecewise shrink curve with plateaus (fraction of ORIGINAL size remaining)
  const CURVE_CLOSE = [[0.14,1.0],[0.22,0.97],[0.34,0.9],[0.42,0.9],[0.52,0.78],[0.62,0.68],[0.7,0.68],[0.78,0.5],[0.86,0.32],[0.93,0.15],[1.01,0.0]];
  const CURVE_OPEN  = [[0.2,1.0],[0.35,0.94],[0.5,0.85],[0.62,0.85],[0.75,0.72],[0.88,0.62],[1.01,0.52]];
  const curve = willClose ? CURVE_CLOSE : CURVE_OPEN;
  let shrink = 1.0;
  for (const [limit, val] of curve) { if (f < limit) { shrink = val; break; } }
  const closed = willClose && f >= 0.97;
  const nearlyHealed = willClose && !closed && f >= 0.82;   // final 3-5 visits of a long series
  // Stage band for teaching + care wording
  const band = closed ? "healed" : nearlyHealed ? "final" : f < 0.3 ? "early" : f < 0.7 ? "mid" : "late";
  const m = String(wound.size||"").match(/([\d.]+)\s*[xX]\s*([\d.]+)(?:\s*[xX]\s*([\d.]+))?/);
  let sizeStr = "";
  if (m) {
    const L0=parseFloat(m[1]), W0=parseFloat(m[2]), D0=m[3]?parseFloat(m[3]):null;
    const r=x=>Math.round(x*10)/10;
    if (closed) sizeStr = "wound closed; resurfaced with epithelial tissue";
    else {
      const L=Math.max(0.1, r(L0*shrink)), W=Math.max(0.1, r(W0*shrink));
      const D=D0===null?null:(f>=0.45?0:r(D0*(1-f*2)));   // depth resolves ~mid-episode
      sizeStr = `${L} x ${W}${D===null?"":" x "+(D<=0?"0":D)} cm` + (shrink>=0.97&&f>0.05?" (no significant change from prior visit)":"");
    }
  }
  // Drainage improves BEFORE size; bed evolves slough → granulation → epithelium
  let bed, drainage, edges, careMode;
  if (closed) {
    bed="fully epithelialized, no open area remaining"; drainage="none";
    edges="closed; new epithelial tissue fragile, surrounding skin intact";
    careMode="HEALED — NO open-wound cleansing/dressing. Skin integrity monitoring, moisture control, friction protection, recurrence-prevention teaching only.";
  } else if (nearlyHealed) {
    bed="nearly epithelialized with only a small superficial open area remaining"; drainage="none observed this visit";
    edges="well-approximated; periwound skin intact without erythema or maceration";
    careMode="NEARLY HEALED — minimal protective dressing/skin barrier per order; focus on protection, moisture control, monitoring for reopening, and recurrence-prevention teaching. Reduce full open-wound care language.";
  } else if (f < 0.3) {
    bed="pink-red base with scattered yellow slough, early granulation forming"; drainage=(f<0.15?"moderate serous":"scant-to-moderate serous, decreasing");
    edges="defined, no undermining or tunneling noted";
    careMode="OPEN WOUND — full wound care per physician order (cleansing, barrier, dressing exactly as ordered).";
  } else if (f < 0.7) {
    bed="increasing beefy-red granulation tissue covering an estimated 60-80% of the wound bed"; drainage="scant serous";
    edges="contracting, no maceration; periwound stable";
    careMode="OPEN WOUND — full wound care per physician order; document treatment effectiveness.";
  } else {
    bed="healthy granulation with advancing epithelial tissue at wound margins"; drainage="scant, decreasing to none on some visits";
    edges="epithelializing; periwound skin intact";
    careMode="LATE HEALING — wound care per order; begin shifting teaching toward protection and prevention.";
  }
  return { sizeStr, bed, drainage, edges, closed, nearlyHealed, band, careMode };
}

// RULE 1: Single normalized assistive device — 485 DME/Activities Permitted is the source
function getAssistiveDevice(poc) {
  if (poc.isBedbound) return null;            // bedbound: no ambulation device
  if (poc.hasWalker) return "walker";          // primary ambulation device
  if (poc.hasCane) return "cane";
  if (poc.hasWheelchair) return "wheelchair";
  return null;                                  // none documented → never invent one
}

// Pain character from diagnoses: sciatica/radiculopathy → radiating; else dull
// Strip negated findings ("without X", "w/o X") so they never match as positive
function stripNegated(text) {
  return String(text||"").toLowerCase()
    .replace(/without\s+(myelopathy\s+or\s+)?[a-z]+/g, " ")
    .replace(/w\/o\s+(myelopathy\s+or\s+)?[a-z]+/g, " ")
    .replace(/no\s+evidence\s+of\s+[a-z]+/g, " ");
}
function getPainCharacter(diagnoses) {
  const dx=stripNegated((diagnoses||[]).join(" "));
  if(dx.includes("sciatica")||dx.includes("radiculopathy")) return "radiating";
  return "dull";
}
// Remove unresolved placeholders and RN-level wording from AI text
function cleanNoteText(text) {
  return String(text||"")
    .replace(/\bhis\/her\b/gi,"the patient's")
    .replace(/\bhe\/she\b/gi,"patient")
    .replace(/\bhim\/her\b/gi,"patient")
    .replace(/\bhis or her\b/gi,"the patient's")
    .replace(/\bs\/he\b/gi,"patient")
    .replace(/\btheir\b/gi,"the patient's")
    .replace(/\[patient\]/gi,"patient")
    .replace(/\[caregiver\]/gi,"caregiver")
    .replace(/\[medication\]/gi,"the medication")
    .replace(/\[diagnosis\]/gi,"the diagnosis")
    .replace(/comprehensive assessment/gi,"focused assessment/data collection")
    .replace(/evaluation and assessment done of all body systems/gi,"skilled observation and focused assessment/data collection per plan of care")
    .replace(/Skilled nursing evaluation and assessment done of all body systems/gi,"LVN completed skilled observation and focused assessment/data collection per plan of care")
    .replace(/\s{2,}/g," ")
    .trim();
}
// Detect final discharge visit by date vs cert end / last scheduled
function normDate(d){ if(!d)return null; const x=new Date(d); x.setHours(0,0,0,0); return x; }

// ── NAME AUTOCOMPLETE ─────────────────────────────────────────────────────────
function NameAutocomplete({ value, onChange }) {
  const [names, setNames] = useState([]);
  const [open, setOpen] = useState(false);
  const [filtered, setFiltered] = useState([]);
  const ref = useRef(null);
  useEffect(() => { (async()=>{ try{ const r=await window.storage.get("sn_names_v2"); if(r?.value)setNames(JSON.parse(r.value)); }catch{} })(); }, []);
  useEffect(() => { const h=e=>{ if(ref.current&&!ref.current.contains(e.target))setOpen(false); }; document.addEventListener("mousedown",h); return()=>document.removeEventListener("mousedown",h); }, []);
  const save = async name => { if(!name.trim()||names.includes(name.trim()))return; const u=[name.trim(),...names].slice(0,20); setNames(u); try{await window.storage.set("sn_names_v2",JSON.stringify(u));}catch{} };
  const remove = async (name,e) => { e.stopPropagation(); const u=names.filter(n=>n!==name); setNames(u); try{await window.storage.set("sn_names_v2",JSON.stringify(u));}catch{} };
  return (
    <div ref={ref} style={{position:"relative"}}>
      <div style={{fontSize:11,fontWeight:700,color:"#374151",marginBottom:4}}>SN Name / Title</div>
      <div style={{position:"relative"}}>
        <input data-testid="sn-name-input" value={value} onChange={e=>{onChange(e.target.value);setFiltered(names.filter(n=>n.toLowerCase().includes(e.target.value.toLowerCase())&&n!==e.target.value));setOpen(true);}}
          onFocus={()=>{setFiltered(names.filter(n=>!value||n.toLowerCase().includes(value.toLowerCase())));setOpen(true);}}
          placeholder="e.g. Gayane Maneyan / LVN"
          style={{width:"100%",padding:"9px 60px 9px 12px",border:"1.5px solid #d1d5db",borderRadius:8,fontSize:13,fontFamily:"inherit",outline:"none",background:"white"}}/>
        {value&&<button onClick={()=>{save(value);setOpen(false);}} style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",background:"#2b6cb0",border:"none",borderRadius:4,color:"white",fontSize:10,padding:"2px 6px",cursor:"pointer",fontWeight:700}}>SAVE</button>}
      </div>
      {open&&filtered.length>0&&<div style={{position:"absolute",top:"calc(100% + 4px)",left:0,right:0,background:"white",border:"1.5px solid #d1d5db",borderRadius:8,boxShadow:"0 8px 24px rgba(0,0,0,0.12)",zIndex:100,maxHeight:180,overflowY:"auto"}}>
        {filtered.map(n=><div key={n} onClick={()=>{onChange(n);setOpen(false);}} style={{padding:"8px 12px",cursor:"pointer",display:"flex",justifyContent:"space-between",fontSize:13,borderBottom:"1px solid #f3f4f6"}} onMouseEnter={e=>e.currentTarget.style.background="#eff6ff"} onMouseLeave={e=>e.currentTarget.style.background="white"}>
          <span>👤 {n}</span><span onClick={e=>remove(n,e)} style={{color:"#9ca3af",fontSize:16}}>×</span>
        </div>)}
      </div>}
    </div>
  );
}

// ── CALENDAR PICKER ───────────────────────────────────────────────────────────
function CalendarPicker({ dates, onChange }) {
  const today = new Date();
  const [view, setView] = useState({year:today.getFullYear(),month:today.getMonth()});
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(()=>{ const h=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);}; document.addEventListener("mousedown",h); return()=>document.removeEventListener("mousedown",h); },[]);
  const first=new Date(view.year,view.month,1).getDay();
  const days=new Date(view.year,view.month+1,0).getDate();
  const isSel=day=>dates.some(d=>fmtDate(d)===fmtDate(new Date(view.year,view.month,day)));
  const isToday=day=>fmtDate(new Date(view.year,view.month,day))===fmtDate(today);
  const toggle=day=>{ const c=new Date(view.year,view.month,day); c.setHours(12,0,0,0); const k=fmtDate(c); if(dates.some(d=>fmtDate(d)===k))onChange(dates.filter(d=>fmtDate(d)!==k)); else onChange([...dates,c].sort((a,b)=>a-b)); };
  const label=dates.length===0?"Select visit date(s)":dates.length===1?fmtDate(dates[0]):`${dates.length} dates selected`;
  return (
    <div ref={ref} style={{position:"relative"}}>
      <div style={{fontSize:11,fontWeight:700,color:"#374151",marginBottom:4}}>Visit Date(s)</div>
      <div data-testid="calendar-toggle" onClick={()=>setOpen(o=>!o)} style={{padding:"9px 12px",border:"1.5px solid #d1d5db",borderRadius:8,background:"white",cursor:"pointer",fontSize:13,display:"flex",justifyContent:"space-between",userSelect:"none"}}>
        <span style={{color:dates.length?"#111827":"#9ca3af"}}>📅 {label}</span><span style={{color:"#6b7280",fontSize:10}}>▼</span>
      </div>
      {dates.length>0&&<div style={{marginTop:4,display:"flex",flexWrap:"wrap",gap:4}}>
        {dates.map(d=><span key={fmtDate(d)} style={{background:"#dbeafe",color:"#1e40af",fontSize:11,padding:"2px 8px",borderRadius:20,display:"flex",alignItems:"center",gap:4}}>{fmtDate(d)}<span onClick={()=>onChange(dates.filter(x=>fmtDate(x)!==fmtDate(d)))} style={{cursor:"pointer",fontWeight:700,fontSize:13,lineHeight:1}}>×</span></span>)}
      </div>}
      {open&&<><div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:9998}} onClick={()=>setOpen(false)}/>
        <div style={{position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",background:"white",border:"1.5px solid #d1d5db",borderRadius:16,boxShadow:"0 20px 60px rgba(0,0,0,0.3)",zIndex:9999,padding:14,width:"min(310px,92vw)"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
            <button onClick={()=>setView(v=>v.month===0?{year:v.year-1,month:11}:{...v,month:v.month-1})} style={{background:"none",border:"none",cursor:"pointer",fontSize:18,color:"#374151",padding:"0 6px"}}>‹</button>
            <span style={{fontWeight:700,fontSize:14}}>{MONTHS[view.month]} {view.year}</span>
            <button onClick={()=>setView(v=>v.month===11?{year:v.year+1,month:0}:{...v,month:v.month+1})} style={{background:"none",border:"none",cursor:"pointer",fontSize:18,color:"#374151",padding:"0 6px"}}>›</button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:4}}>{DAYS.map(d=><div key={d} style={{textAlign:"center",fontSize:10,fontWeight:700,color:"#9ca3af"}}>{d}</div>)}</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2}}>
            {Array(first).fill(null).map((_,i)=><div key={`e${i}`}/>)}
            {Array(days).fill(null).map((_,i)=>{ const day=i+1,sel=isSel(day),tod=isToday(day); return (
              <div key={day} onClick={()=>toggle(day)} style={{textAlign:"center",padding:"5px 2px",borderRadius:6,cursor:"pointer",fontSize:12,fontWeight:sel?700:400,background:sel?"#2b6cb0":tod?"#eff6ff":"transparent",color:sel?"white":tod?"#2b6cb0":"#374151",border:tod&&!sel?"1.5px solid #2b6cb0":"1.5px solid transparent"}}
                onMouseEnter={e=>{if(!sel)e.currentTarget.style.background="#dbeafe";}} onMouseLeave={e=>{if(!sel)e.currentTarget.style.background=tod?"#eff6ff":"transparent";}}>{day}</div>
            );})}
          </div>
          <div style={{marginTop:10,paddingTop:8,borderTop:"1px solid #f3f4f6",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{fontSize:11,color:"#6b7280"}}>{dates.length} date{dates.length!==1?"s":""} selected</span>
            <button onClick={()=>onChange([])} style={{fontSize:11,color:"#ef4444",background:"none",border:"none",cursor:"pointer",fontWeight:600}}>Clear all</button>
          </div>
        </div>
      </>}
    </div>
  );
}

// ── TIME PICKER ───────────────────────────────────────────────────────────────
function TimePicker({ label, hour, minute, ampm, onChange }) {
  const [open, setOpen] = useState(false);
  const [lh, setLh] = useState(hour); const [lm, setLm] = useState(minute||0); const [la, setLa] = useState(ampm||"AM");
  const ref = useRef(null);
  useEffect(()=>{ const h=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);}; document.addEventListener("mousedown",h); return()=>document.removeEventListener("mousedown",h); },[]);
  const apply=(h,m,a)=>{setLh(h);setLm(m);setLa(a);onChange(h,m,a);};
  const hours=Array.from({length:12},(_,i)=>i+1);
  const mins=Array.from({length:12},(_,i)=>i*5);
  return (
    <div ref={ref} style={{position:"relative"}}>
      <div style={{fontSize:11,fontWeight:700,color:"#374151",marginBottom:4}}>{label}</div>
      <div onClick={()=>setOpen(o=>!o)} style={{padding:"9px 12px",border:"1.5px solid #d1d5db",borderRadius:8,background:"white",cursor:"pointer",fontSize:13,display:"flex",justifyContent:"space-between",userSelect:"none",color:hour?"#111827":"#9ca3af"}}>
        <span>🕐 {hour?fmtTime(hour,minute||0,ampm):"-- : --"}</span><span style={{color:"#6b7280",fontSize:10}}>▼</span>
      </div>
      {open&&<><div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:9998}} onClick={()=>setOpen(false)}/>
        <div style={{position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",background:"white",border:"1.5px solid #d1d5db",borderRadius:16,boxShadow:"0 20px 60px rgba(0,0,0,0.3)",zIndex:9999,padding:14,width:"min(260px,90vw)"}}>
          <div style={{textAlign:"center",fontSize:22,fontWeight:900,color:"#1e40af",marginBottom:10,letterSpacing:2}}>{String(lh||12).padStart(2,"0")}:{String(lm||0).padStart(2,"0")} <span style={{fontSize:14}}>{la}</span></div>
          <div style={{fontSize:10,fontWeight:700,color:"#9ca3af",marginBottom:4}}>HOUR</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:3,marginBottom:8}}>{hours.map(h=><div key={h} onClick={()=>apply(h,lm||0,la)} style={{textAlign:"center",padding:"4px 2px",borderRadius:5,cursor:"pointer",fontSize:12,fontWeight:lh===h?700:400,background:lh===h?"#2b6cb0":"#f9fafb",color:lh===h?"white":"#374151",border:"1px solid "+(lh===h?"#2b6cb0":"#e5e7eb")}} onMouseEnter={e=>{if(lh!==h)e.currentTarget.style.background="#dbeafe";}} onMouseLeave={e=>{if(lh!==h)e.currentTarget.style.background="#f9fafb";}}>{h}</div>)}</div>
          <div style={{fontSize:10,fontWeight:700,color:"#9ca3af",marginBottom:4}}>MINUTE</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:3,marginBottom:10}}>{mins.map(m=><div key={m} onClick={()=>apply(lh||12,m,la)} style={{textAlign:"center",padding:"4px 2px",borderRadius:5,cursor:"pointer",fontSize:12,fontWeight:lm===m?700:400,background:lm===m?"#2b6cb0":"#f9fafb",color:lm===m?"white":"#374151",border:"1px solid "+(lm===m?"#2b6cb0":"#e5e7eb")}} onMouseEnter={e=>{if(lm!==m)e.currentTarget.style.background="#dbeafe";}} onMouseLeave={e=>{if(lm!==m)e.currentTarget.style.background="#f9fafb";}}>{String(m).padStart(2,"0")}</div>)}</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:10}}>{["AM","PM"].map(ap=><div key={ap} onClick={()=>apply(lh||12,lm||0,ap)} style={{textAlign:"center",padding:7,borderRadius:7,cursor:"pointer",fontWeight:700,fontSize:14,background:la===ap?"#2b6cb0":"#f9fafb",color:la===ap?"white":"#374151",border:"1.5px solid "+(la===ap?"#2b6cb0":"#e5e7eb")}}>{ap}</div>)}</div>
          <button onClick={()=>setOpen(false)} style={{width:"100%",padding:8,background:"#2b6cb0",color:"white",border:"none",borderRadius:7,fontWeight:700,cursor:"pointer",fontSize:13}}>Confirm</button>
        </div>
      </>}
    </div>
  );
}

// ── API HELPER ────────────────────────────────────────────────────────────────
async function callAPI(messages, system="", maxTokens=8000) {
  const resp = await fetch("/api/claude", {
    method:"POST", headers:{"Content-Type":"application/json"},
    body:JSON.stringify({ messages, system, maxTokens })
  });
  const data = await resp.json();
  if (data.error) throw new Error(data.error);
  return data.text || "";
}
async function fileToBase64(file) {
  return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result.split(",")[1]); r.onerror=()=>rej(new Error("fail")); r.readAsDataURL(file); });
}

// ── BUILD HTML NOTE ───────────────────────────────────────────────────────────
function buildNoteHTML({poc, agencyName, snName, date, timeIn, timeOut, vs, topic, intervention, lastBM, isLastNote, painLevel=4, phase="EARLY", painLoc="lower back"}) {
  const cbFont = "'Segoe UI Symbol','DejaVu Sans','Arial Unicode MS',sans-serif";
  const bh = v => `<span style="font-family:${cbFont};font-size:8.4pt;line-height:0">${v ? "&#9746;" : "&#9744;"}</span>`;
  const ms = poc.mentalStatus||{};
  const df = poc.deficits||{};
  const hbf = poc.homeboundFlags||{limitedEndurance:true,limitedStrength:true,assistADL:true,unevenSurfaces:true,confusion:false,unableToLeaveAlone:true,poorCoordination:false,taxingEffort:true};
  const painChar = getPainCharacter(poc.diagnoses);
  // Pain medication driven ONLY by 485/POC medication list
  const _painMed = findPainMed(poc.medications);
  const painMedText = _painMed==="Tylenol" ? "Tylenol / Acetaminophen as ordered"
                    : _painMed ? (_painMed + " as ordered")
                    : "pain management measures per MD orders";
  const painControlLine = `rest, repositioning, gentle activity, and ${painMedText}`;
  const hp = poc.hasPleurX||false;
  const isSOC = poc.stage==="SOC";
  const ul = (v,w) => `<span style="border-bottom:1px solid #000;display:inline-block;min-width:${w||60}px;padding-left:2px;vertical-align:bottom">${v||""}</span>`;

    // Caregiver-aware subject
  const cg = poc.hasCaregiver || false;
  const subj = cg ? "Patient/caregiver" : "Patient";
  const cgClause = cg ? " and caregiver is able to assist with ongoing care needs" : "";
  const cgAssist = cg ? " Patient continues to require caregiver assistance for safety and medication organization;" : "";

  // Phase-aware Response to Treatment (no contradictions, caregiver-aware)
  let responseText;
  if (phase === "FINAL_DISCHARGE") {
    // Conditional clauses — only if supported by 485/POC
    const dxAll = (poc.diagnoses||[]).join(" ").toLowerCase();
    const hasSeizure = dxAll.includes("seizure")||dxAll.includes("epilep")||pocSupports(poc,"seizure");
    const hasGU = dxAll.includes("bph")||dxAll.includes("prostat")||dxAll.includes("urinary")||dxAll.includes("retention")||dxAll.includes("frequency")||dxAll.includes("urgency");
    const items = ["discharge instructions","medication safety","fall precautions","medication regimen"];
    if (hasSeizure) items.push("seizure precautions");
    if (hasGU) items.push("urinary symptom reporting parameters");
    const itemList = items.join(", ") + ", and when to notify MD or call 911";
    if (cg) {
      responseText = `${bh(true)}Patient${bh(true)}PCG Patient/caregiver verbalized understanding of ${itemList}. Patient remains forgetful and requires caregiver support for safety and medication organization; however, skilled nursing goals have been met / maximum benefit achieved per plan of care, and caregiver is able to assist with ongoing care needs. Patient is appropriate for discharge from skilled nursing services at this time.`;
    } else {
      responseText = `${bh(true)}Patient${bh(false)}PCG Patient verbalized understanding of ${itemList}. Skilled nursing goals have been met / maximum benefit achieved per plan of care. Patient is appropriate for discharge from skilled nursing services at this time.`;
    }
  } else if (phase === "PRE_DISCHARGE") {
    responseText = `${bh(true)}Patient${bh(cg)}PCG ${subj} verbalized fair understanding of discharge planning instructions. Patient continues to require ${cg?"caregiver support and ":""}reinforcement due to forgetfulness and fall risk. Discharge readiness will be evaluated by RN.`;
  } else if (phase === "LATE") {
    responseText = `${bh(true)}Patient${bh(cg)}PCG ${subj} verbalized improved understanding of disease management, medication safety, and fall precautions.${cg?" Caregiver remains involved due to patient's forgetfulness and safety risk.":""} Patient continues to require skilled observation and reinforcement.`;
  } else if (phase === "MIDDLE") {
    responseText = `${bh(true)}Patient${bh(cg)}PCG ${subj} demonstrated improved recall of prior instructions but continued to require cueing and reinforcement due to forgetfulness and chronic disease complexity. Continued skilled teaching and follow-up indicated.`;
  } else {
    responseText = `${bh(true)}Patient${bh(cg)}PCG ${subj} verbalized fair understanding of instructions provided but required frequent repetition due to forgetfulness. Due to chronic disease complexity and fall risk, patient continues to require reinforcement, skilled observation, and follow-up teaching.`;
  }

  // Phase-aware Plan
  let planText;
  if (phase === "FINAL_DISCHARGE") {
    planText = `Discharge from skilled nursing services. ${subj} instructed to continue medications as ordered, follow prescribed diet, maintain fall precautions, use assistive device as needed, follow up with MD as scheduled, and report any change in condition promptly.`;
  } else if (phase === "PRE_DISCHARGE") {
    planText = "Continue plan of care as approved by MD. Discharge planning discussed; RN to assess discharge readiness as indicated.";
  } else {
    planText = "Continue plan of care as approved by MD.";
  }

  // Communication section (phase-aware)
  const isFinalDC = phase === "FINAL_DISCHARGE";
  // Discharge planning is triggered by phase OR by the teaching topic mentioning discharge
  const topicMentionsDischarge = String(topic||"").toUpperCase().includes("DISCHARGE");
  const isDischargePlanning = (isFinalDC || phase === "PRE_DISCHARGE" || topicMentionsDischarge);
  const commRN = isDischargePlanning;   // RN checked on any discharge planning / final discharge note
  const commSup = isDischargePlanning;  // Supervisor checked on any discharge planning / final discharge note
  const commRe = isDischargePlanning ? "DISCHARGE PLANNING / RN NOTIFIED" : "";

    return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Clinical Note – ${poc.patient?.name||""} – ${date}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
@page{size:A4 portrait;margin:10mm 8mm 10mm 8mm}
html,body{
  font-family:"Times New Roman","Liberation Serif",Times,serif;
  font-size:8.4pt;
  line-height:1.35;
  background:#fff;
  width:100%;
}
.wrap{width:100%}
.hdr{text-align:center;margin-bottom:3pt}
.hdr h1{font-size:14pt;font-weight:900;letter-spacing:0.5pt}
.hdr h2{font-size:10pt;font-weight:900;letter-spacing:2pt}
.cols{display:flex;border-top:2pt solid #000;padding-top:3pt}
.left{
  width:40%;
  padding-right:6pt;
  border-right:1pt solid #666;
  font-size:8.2pt;
  line-height:1.32;
}
.right{
  width:60%;
  padding-left:6pt;
  font-size:8.4pt;
  line-height:1.35;
}
.sec{margin-bottom:2.5pt;page-break-inside:avoid;break-inside:avoid}
.st{font-weight:900}
.intv{
  font-size:8pt;
  line-height:1.32;
  margin-bottom:2.5pt;
  page-break-inside:avoid;
  break-inside:avoid;
}
.sm{
  font-size:8pt;
  line-height:1.28;
  margin-bottom:2pt;
  page-break-inside:avoid;
  break-inside:avoid;
}
.bgrid{
  display:grid;
  grid-template-columns:1fr 1fr 1fr;
  gap:4pt;
  border-top:1pt solid #555;
  padding-top:2pt;
  margin-top:3pt;
}
.bgrid .lbl{font-weight:700;border-bottom:1pt solid #777;margin-bottom:1pt;font-size:8.5pt}
@media print{
  @page{size:A4 portrait;margin:10mm 8mm 10mm 8mm}
  html,body{width:100%;overflow:visible}
  .sec,.intv,.sm,.bgrid,.cols,.left,.right{
    page-break-inside:avoid !important;
    break-inside:avoid !important;
  }
}
</style>
</head>
</head>
<body>
<div class="wrap">
<div class="hdr"><h1>${agencyName}</h1><h2>CLINICAL NOTE</h2></div>

<div class="cols">
<!-- LEFT COLUMN -->
<div class="left">
<div class="sec"><div class="st">DEFICITS:</div>
<b>MENTAL: </b>${bh(ms.oriented!==false)}Oriented ${bh(ms.alert!==false)}Alert<br>
${bh(ms.disoriented||false)}Disoriented<br>
${bh(ms.forgetful||false)}Forgetful ${bh(ms.confusedAtTimes||false)} Confused at times &nbsp;${bh(ms.anxious||false)} Anxious at times<br>
${bh(ms.depressedControlled||false)} Depressed at times( controlled with medications)<br>
${bh(ms.agitated||false)}Agitated</div>

<div class="sec"><div class="st">INTEGUMENTARY:</div>
${bh(poc.hasWound||false)}Wound ${bh((poc.hasWound&&poc.woundIsPressure)||false)}Decub Stage${bh(poc.woundIsPressure&&poc.woundStage==="1")}1${bh(poc.woundIsPressure&&poc.woundStage==="2")}2${bh(poc.woundIsPressure&&poc.woundStage==="3")}3${bh(poc.woundIsPressure&&poc.woundStage==="4")}4 ${poc.hasWound&&poc.woundDesc?`<u>${poc.woundDesc}</u>`:""}<br>
${bh(false)}Infected ${bh(false)} Foul odor drainage<br>
${bh(false)}Rashes ${bh(false)}Sizes<span style="border-bottom:1px solid #000;display:inline-block;width:30px"></span><br>
${bh(hp)}Tubes ${hp?'<span style="border-bottom:1px solid #000;display:inline-block;width:50px;font-size:8.4pt">left chest rib</span>':''}<span style="border-bottom:1px solid #000;display:inline-block;width:${hp?'5':'30'}px"></span> ${bh(hp)}${hp?'Shunt pleural catheter':'Shunt'}<br>
Other:</div>

<div class="sec"><b>EENT: </b>${bh(df.poorVision||false)} poor vision ${bh(df.legallyBlind||false)}Legally blind &nbsp;${bh(false)}Epistaxis<br>
${bh(poc.hasDysphagia||false)}Dysphagia ${bh(df.deaf||false)}Deaf ${bh(df.hoh||false)} HOH R/L<br>
${bh(poc.proneToAspiration||false)}Prone to aspiration</div>

<div class="sec"><div class="st">RESPIRATORY: </div>
${bh(df.sob||false)}SOB ${bh(df.sob&&df.sobExertion==="rest")}Rest${bh(df.sob&&df.sobExertion==="minimal")}min. exer ${bh(df.sob&&(df.sobExertion==="moderate"||!df.sobExertion))}<br>
mod. exertion ${bh(false)}Cough ${bh(false)}Productive ${bh(false)}Non-productive ${bh(false)} Sputum Color:<span style="border-bottom:1px solid #000;display:inline-block;width:16px"></span> ${bh(false)}Amount<br>
Lung Sound: <u>${poc.lungSounds||"clear"}</u><br>
O2sat <u>${vs.o2||poc.o2Sat||"96"}% ${(poc.o2RoomAir!==false)?"RA":"O2"}</u> &nbsp;Other</div>

<div class="sec"><div class="st">MUSCULOSKELETAL: </div>
${bh(df.stiffJoints||false)}Stiff joints ${bh(df.weakness||false)}Weakness ${bh(df.limitedROM||false)}Limited ROM<br>
${bh(poc.hasCane||false)}cane ${bh(poc.hasWalker===true)}walker ${bh(poc.hasWheelchair||false)}W/C ${bh(poc.hasContracture||false)}Contractures ${bh(false)} Foot drop${bh(df.unsteadyBalance===true&&!poc.isBedbound)}Unsteady balance ${bh(false)}Other</div>

<div class="sec"><b>PAIN: </b>${bh(false)}No ${bh(true)} Yes Location: <u>${painLoc}</u><br>
Intensity: ${[1,2,3,4,5,6,7,8,9,10].map(n=>n===painLevel?`<u><b>${n}</b></u>`:n).join(" ")} &nbsp;<b>(${painLevel}/10)</b><br>
${bh(false)}Sharp ${bh(painChar==="dull")} Dull ${bh(painChar==="radiating")}Radiating ${bh(false)}Burning<br>
Controlled ${bh(false)}No ${bh(true)} Yes by: ${painControlLine}</div>

<div class="sec"><div class="st">GASTROINTESTINAL:</div>
${bh(false)}Nausea ${bh(false)}Vomiting ${bh(false)}Diarrhea<br>
${bh(false)}Constipation ${bh(false)}Impaction ${bh(false)}Abd. Dist.<br>
${bh(df.bowelIncontinence||false)}Incontinent ${bh(false)}Last BM: <u>${lastBM||""}</u><br>
Appetite ${bh(false)}Good ${bh(true)}Fair ${bh(false)}Poor<br>
Diet: <u>${poc.diet||"low fat, low cholesterol"}</u></div>

<div class="sec"><div class="st">NEUROLOGICAL:</div>
${bh(false)}Aphasic ${bh(false)}Slurred speech ${bh(false)}Seizures<br>
${bh(false)}Headache ${bh(poc.hasTremor||false)}Tremors ${bh(poc.hasVertigo||false)}Vertigo<br>
${bh(false)}Grips unequal ${bh(false)}Pupils unequal<br>
${bh(true)}PERRLA ${bh(false)}Weakness R${bh(false)} L${bh(false)}</div>

<div class="sec"><div class="st">CARDIOVASCULAR:</div>
${bh(false)}Chest pain ${bh(false)}Palpitations ${bh(false)}Dizziness<br>
Pedal pulses: ${bh(!poc.hasPVD)}Present ${bh(false)}Absent<br>
Edema: ${bh(false)}Pitting ${bh(df.edema||false)}Non-pitting ${bh(false)} Pacer.<br>
${bh(false)}1+ ${bh(false)}2+ ${bh(false)}3+ ${bh(false)}4+ ${bh(false)} Dependent<br>
Location: ${bh(df.edema||false)}BLE${bh(false)}Dorsum R/L</div>

<div class="sec"><div class="st">GENITOURINARY:</div>
${bh(df.urinaryIncontinence||false)}Incontinent ${bh(df.urinaryFrequency||false)}Frequency ${bh(df.urinaryUrgency||false)}Urgency<br>
${bh(false)}Pain ${bh(false)}Nocturia${bh(false)}Burning${bh(false)}Retention<br>
${bh(false)}Catheter ${bh(false)}Condom ${bh(false)}IFC${bh(false)}Suprapub<br>
${bh(false)}Foul odor ${bh(true)} clear yellow ${bh(false)} Cloudy<br>
${bh(true)} No foul odor reported ${bh(false)}Hematuria</div>

<div class="sec"><div class="st">ENDOCRINE:</div>
${bh(false)}Weak ${bh(false)}Diaphoretic ${bh(false)}Polyuria<br>
${bh(false)}polydipsia${bh(false)}Blurred vision ${bh(poc.isDiabetic||false)}diabetic foot exam.<br>
${bh(false)}sweats ${bh(false)}polyphagia &nbsp; ${bh(false)}Tremors ${bh(false)}Other:</div>

<div class="sec"><div class="st">IDENTIFICATION:</div>
${bh(true)} 2 Ways of identification<br>
${bh(true)} ID/insurance ,Face</div>

<div style="margin-top:3px"><b>ALLERGY: </b>${bh(true)} ${poc.allergies||"NKDA"}</div>
</div>

<!-- RIGHT COLUMN -->
<div class="right">
<div class="sec">
<b>Vital Signs</b>: T: <u>${vs.temp}</u> HR:<u>${vs.hr}</u>bpm &nbsp;RR: <u>${vs.rr}</u>/min BS ${poc.isDiabetic?`<u>${vs.bs}</u>mg/dL`:`<span style="border-bottom:1px solid #000;display:inline-block;width:22px"></span>`} F${bh(false)}R${bh(false)} Repeat <span style="border-bottom:1px solid #000;display:inline-block;width:22px"></span><br>
BP: <b>R / L</b> Lying <span style="border-bottom:1px solid #000;display:inline-block;width:16px"></span> Sitting <u>${vs.bp}</u>mmHg${poc.bpArmRestriction==="right"?" (L arm)":poc.bpArmRestriction==="left"?" (R arm)":""} &nbsp;Standing <span style="border-bottom:1px solid #000;display:inline-block;width:28px"></span> &nbsp;Repeat: <span style="border-bottom:1px solid #000;display:inline-block;width:18px"></span>mmHg &nbsp;Wt: <u>${poc.patient?.weight||poc.weight||""}</u>
</div>

<div class="sec">
<b>HOMEBOUND STATUS: </b>${bh(hbf.limitedEndurance!==false)}Poor/Limited Endurance ${bh(hbf.limitedStrength!==false)} Poor/Limited Strength<br>
${bh(df.sob||false)} SOBOE ${bh(!poc.isBedbound&&(df.unsteadyBalance===true||!!getAssistiveDevice(poc)))}Poor Unsteady Gait ${bh(hbf.assistADL!==false)}Requires Assist with ADL<br>
${bh(hbf.unevenSurfaces!==false)} Unable to Negotiate Uneven Surfaces or Steps ${bh(false)} Medical Restrictions<br>
${bh(poc.isBedbound||false)}Non-wt bearing &nbsp;${bh(poc.isBedbound||!!getAssistiveDevice(poc)||df.weakness===true)}Requires assist with transfer ${bh(!poc.isBedbound&&!!getAssistiveDevice(poc))}Requires assistive device to ambulate ${bh(hbf.confusion||ms.confusedAtTimes||false)} Confusion${bh(hbf.unableToLeaveAlone!==false)}<br>
Unable to leave home without assistance ${bh(poc.isBedbound||false)}Bedbound<br>
${bh(poc.hasParalysis||false)}Paralysis UE / LE / both ${bh(!poc.isBedbound&&(!!getAssistiveDevice(poc)||df.weakness===true))}Requires assist to ambulate ${bh(hbf.poorCoordination||df.unsteadyBalance||false)}Poor coordination or balance ${bh(false)}Partial wt bearing<br>
${bh(hbf.taxingEffort!==false)} Others: requires considerable and taxing efforts to leave home even with assistance from caregiver.
</div>

<div class="sec"><b>ASSESSMENTS:</b> (Problems/Significant Findings) Teaching done regarding <b>${phase==="FINAL_DISCHARGE"?"DISCHARGE FROM SKILLED NURSING SERVICES":topic}</b></div>

<div class="sec intv"><b>INTERVENTIONS:</b> <i>(Specific to problems identified and who was given the instructions)</i> ${intervention}</div>

<div class="sec"><b>RESPONSE TO TREATMENT/INSTRUCTIONS: </b>${responseText}</div>

<div class="sec"><b>PLAN</b> (for next visit). ${planText}</div>

<div class="sec sm">
<b>UNIVERSAL PRECAUTIONS UTILIZED: </b>${bh(true)}Medical waste disposal ${bh(true)}gloves ${bh(true)}mask ${bh(true)} hand washing ${bh(false)}goggles<br>
${bh(false)}gown ${bh(false)}sharps disposal ${bh(false)}red bagging ${bh(false)}double bagging ${bh(true)} Infection Control:<br>
${bh(true)} Knowledgeable ${bh(false)} SHARPS box in home &nbsp;observed/taught &nbsp;Safety:${bh(true)} Environment assessed for safety<br>
${bh(true)} Equipment inspected ${bh(false)} In Good Condition ${bh(true)} Yes ${bh(false)} No<br>
${bh(true)} Medication Regimen Reviewed &nbsp;${bh(true)} Patient has been identified with two forms of ID &nbsp;Comments: ${bh(true)}<br>
${bh(true)}Medication reconciliation</div>



<div class="sec sm">
<b>COMMUNICATION: </b>${bh(false)}MD ${bh(false)}PT ${bh(false)}OT ${bh(false)}ST ${bh(false)}MS ${bh(commRN)}RN ${bh(false)}LVN ${bh(false)}CHHA<br>
${bh(commSup)} Supervisor ${bh(false)} Pharmacist<br>
Re: ${commRe}</div>

<div style="display:flex;gap:12px;align-items:flex-end;margin-bottom:3px;margin-top:2px;font-size:8.4pt">
  <div style="flex:1"><b>SN NAME</b><br><span style="font-size:8.4pt">${stripNurseTitle(snName)}</span></div>
  <div style="flex:1"><b>SN SIGNATURE</b><br><span style="border-bottom:1px solid #000;display:inline-block;width:80px">&nbsp;</span></div>
  <div style="flex:1;text-align:right"><b>NEXT MD APPOINTMENT</b><br><span style="font-size:8.4pt">As scheduled</span></div>
</div>
<div style="font-size:8.4pt;font-weight:700;margin-bottom:3px">MR # ${poc.patient?.mrNumber||""}</div>


<div class="bgrid">
  <div><div class="lbl">PATIENT</div><div>${poc.patient?.name||""}</div></div>
  <div><div class="lbl">DATE</div><div>${date}</div></div>
  <div><div class="lbl">TIME IN/OUT</div><div>${timeIn}${timeIn&&timeOut?"-":""}${timeOut}</div></div>
</div>
</div></div>
</div>
</body></html>`;
}

// ── MAIN APP ──────────────────────────────────────────────────────────────────
export default function App() {
  const [poc,        setPoc]        = useState(null);
  const [file,       setFile]       = useState(null);
  const [filePreview,setFilePreview]= useState(null);
  const [extracting, setExtracting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genStatus,  setGenStatus]  = useState("");
  const [notes,      setNotes]      = useState([]);
  const [error,      setError]      = useState(null);
  const [drag,       setDrag]       = useState(false);
  const [agencyName, setAgencyName] = useState("CITYWIDE HOME HEALTH CARE, INC.");
  const [editAgency, setEditAgency] = useState(false);
  const [snName,     setSnName]     = useState("");
  const [dates,      setDates]      = useState([]);
  const [dateTimes,  setDateTimes]  = useState({});
  const [skippedDates, setSkippedDates] = useState([]); // visit dates outside the cert period (not generated)
  const [previewVS,  setPreviewVS]  = useState(()=>pickVS());
  const [bidPatient, setBidPatient] = useState(false);
  const [autoAMPM,   setAutoAMPM]   = useState(false);
  const [dischargeOn,setDischargeOn]= useState(false);
  const [bulkText,   setBulkText]   = useState("");
  const [bulkEntries,setBulkEntries]= useState([]); // parsed [{date,timeIn,timeOut}]
  const [file487,    setFile487]    = useState(null);
  const [woundMode,  setWoundMode]  = useState(false);
  const [emailSubject,setEmailSubject]= useState("");
  const [manualWound,setManualWound]= useState({location:"",careOrder:"",dressingType:"",frequency:""});
  const [showWoundFields,setShowWoundFields]=useState(false);
  // Email subject routing (spec §1): "Wound" → wound mode ON; "BID"/"PID" → BID logic ON.
  // Case-insensitive. Keywords only auto-ENABLE — they never uncheck a mode the user set manually.
  const applyEmailSubject = (subj) => {
    setEmailSubject(subj);
    if (/wound/i.test(subj)) setWoundMode(true);
    if (/\b(bid|pid)\b/i.test(subj)) setBidPatient(true);
  };

  const fileRef = useRef(null);
  const fileRef487 = useRef(null);

  const setTimeForDate=(dk,field,val)=>setDateTimes(prev=>({...prev,[dk]:{...(prev[dk]||{inH:null,inM:0,inAP:"AM",outH:null,outM:0,outAP:"AM"}),[field]:val}}));
  const getTime=dk=>dateTimes[dk]||{inH:null,inM:0,inAP:"AM",outH:null,outM:0,outAP:"AM"};

  const handleFile = f => {
    if(!f)return;
    setFile(f); setPoc(null); setNotes([]); setError(null);
    if(f.type.startsWith("image/")){ const r=new FileReader(); r.onload=e=>setFilePreview(e.target.result); r.readAsDataURL(f); }
    else setFilePreview(null);
  };

  // ── Extract 485 ────────────────────────────────────────────────────────────
  const extract485 = async () => {
    if(!file)return;
    setExtracting(true); setError(null); setPoc(null); setNotes([]);
    try {
      const base64 = await fileToBase64(file);
      const isImg = file.type.startsWith("image/");
      const block = isImg
        ? {type:"image",source:{type:"base64",media_type:file.type,data:base64}}
        : {type:"document",source:{type:"base64",media_type:"application/pdf",data:base64}};
      const content = [block];
      if (file487) {
        const b487 = await fileToBase64(file487);
        content.push(file487.type.startsWith("image/")
          ? {type:"image",source:{type:"base64",media_type:file487.type,data:b487}}
          : {type:"document",source:{type:"base64",media_type:"application/pdf",data:b487}});
      }
      content.push({type:"text",text: file487
        ? "Extract ALL information from this 485 Plan of Care AND the attached 487 addendum (additional medications/diagnoses). Merge both documents into ONE profile. Return ONLY the JSON."
        : "Extract ALL information from this 485 Plan of Care. Return ONLY the JSON."});
      const raw = await callAPI([{role:"user",content}], EXTRACT_PROMPT, 3000);
      const s=raw.indexOf("{"),e=raw.lastIndexOf("}");
      if(s===-1||e===-1) throw new Error("No JSON in response");
      const data = JSON.parse(raw.slice(s,e+1));
      setPoc(data);
    } catch(err){ setError("Extraction error: "+err.message); }
    finally { setExtracting(false); }
  };

  // ── Generate all notes ─────────────────────────────────────────────────────
  const generateAll = async () => {
    if(!poc) { setError("Please upload and analyze a 485 first."); return; }

    // Build the visit list: bulk entries take priority; else calendar dates; else AM/PM expansion
    let visits = [];
    if (bulkEntries.length > 0) {
      visits = bulkEntries.map(e => ({ date: e.date, dk: fmtDate(e.date), timeIn: e.timeIn, timeOut: e.timeOut }));
    } else if (dates.length > 0) {
      const sorted = [...dates].sort((a,b)=>a-b);
      if (autoAMPM) {
        // Expand each date into AM + PM
        sorted.forEach(d => {
          visits.push({ date:d, dk:fmtDate(d), timeIn:"07:00", timeOut:"07:45" });
          visits.push({ date:d, dk:fmtDate(d), timeIn:"19:00", timeOut:"19:45" });
        });
      } else {
        sorted.forEach(d => {
          const t = getTime(fmtDate(d));
          const tIn = t.inH ? fmtTime(t.inH,t.inM||0,t.inAP) : "";
          const tOut = t.outH ? fmtTime(t.outH,t.outM||0,t.outAP) : "";
          visits.push({ date:d, dk:fmtDate(d), timeIn:tIn, timeOut:tOut });
        });
      }
    }

    if (visits.length === 0) { setError("Add visit dates (calendar) or paste bulk dates/times."); return; }

    // Notes must always run oldest → newest.
    visits.sort((a, b) => a.date - b.date);

    // ── Certification-period gate: skip dates outside the 485 cert period ──
    const certStart = parseCertDate(poc.certPeriodStart);
    const certEnd   = parseCertDate(poc.certPeriodEnd);
    let skipped = [];
    if (certStart && certEnd) {
      certStart.setHours(0,0,0,0);
      certEnd.setHours(23,59,59,999);
      const inPeriod = [];
      for (const v of visits) {
        if (v.date < certStart || v.date > certEnd) skipped.push(v.dk || fmtDate(v.date));
        else inPeriod.push(v);
      }
      visits = inPeriod;
    }
    setSkippedDates(skipped);
    if (visits.length === 0) {
      setNotes([]); setGenStatus("");
      setError(`No notes generated — all visit date(s) fall outside the 485 certification period (${poc.certPeriodStart || "?"} – ${poc.certPeriodEnd || "?"}). Wrong 485 or wrong dates?`);
      return;
    }

    // Missing-time warning only applies to manual calendar use (never blocks automation/bulk).
    const missingTimes = visits.filter(v => !v.timeIn || !v.timeOut);
    if (missingTimes.length > 0 && bulkEntries.length === 0 && !autoAMPM) {
      const proceed = window.confirm(`${missingTimes.length} visit(s) have no Time In/Out set. Generate anyway with blank times?`);
      if (!proceed) { return; }
    }

    // WOUND MODE validation (spec §13/§21): wound order must exist from 485/487 or manual input
    if (woundMode) {
      const extractedOrder = (poc.woundCareOrder||"").trim();
      const manualOrder = (manualWound.careOrder||"").trim();
      const hasWoundData = poc.hasWound || (poc.wounds||[]).length > 0;
      if (!extractedOrder && !manualOrder && !hasWoundData) {
        setError("Wound mode was requested, but no wound care order was found in the uploaded 485/487. Please provide wound location, wound care order, dressing type, and frequency.");
        return;
      }
      // Nurse-name validation: every visit needs a nurse (inline, grouped, or the global SN Name field)
      if (!snName.trim()) {
        const missing = visits.filter(v => !(v.nurseName||"").trim());
        if (missing.length > 0) {
          setError(`Cannot generate wound notes: ${missing.length} visit(s) have no nurse name. Add "Nurse: Name" lines in bulk input or fill the SN Name field.`);
          return;
        }
      }
    }

    // BID with no injectable in the 485 → generate without injection docs
    // (useInjection already handles this). No blocking confirm — keeps the
    // headless automation from stalling.

    setGenerating(true); setError(null); setNotes([]);
    try {
      const topics = poc.teachingTopics||[];
      const total = visits.length;
      const generated = [];
      const prevTopics = [];
      const inj = poc.injectable || {};
      const useInjection = bidPatient && inj.found;
      // Same-day visits (AM+PM) share topic + intervention text — only time/vitals/site differ
      const dayCache = {};   // dateKey -> {topic, intervention}
      const uniqueDays = [...new Set(visits.map(v=>v.dk))];

      // WOUND MODE: merged wound data (manual input fills gaps; never overwrites extracted 485 data)
      const woundOrder = (poc.woundCareOrder||"").trim() || (manualWound.careOrder||"").trim() || "";
      const woundDressing = (poc.dressingType||"").trim() || (manualWound.dressingType||"").trim() || "not specified";
      const woundList = (poc.wounds&&poc.wounds.length) ? poc.wounds
        : (manualWound.location ? [{location:manualWound.location,type:"",stage:"",size:"",drainage:"",odor:"",periwound:"",woundBed:"",careOrder:manualWound.careOrder||""}]
        : (poc.hasWound ? [{location:poc.woundDesc||"per plan of care",type:"",stage:poc.woundStage||"",size:"",drainage:"",odor:"",periwound:"",woundBed:"",careOrder:woundOrder}] : []));
      const woundsStr = woundList.map((w,wi)=>{
        const parts=[`Wound #${wi+1}: ${w.location||"location per POC"}`];
        if(w.type) parts.push(w.type);
        if(w.stage) parts.push("stage "+w.stage);
        if(w.size) parts.push(w.size);
        if(w.drainage) parts.push("drainage: "+w.drainage);
        if(w.careOrder) parts.push("order: "+w.careOrder);
        return parts.join(", ");
      }).join(" | ") || "wound per plan of care (details not specified — use conservative wording)";

      for(let i=0;i<visits.length;i++){
        const v = visits[i];
        const date = v.date;
        const dk = v.dk;
        // Discharge ONLY on the last note, and only if dischargeOn
        const isLast = dischargeOn && (i === visits.length-1);
        const phase = getVisitPhase(i, total, dischargeOn, isLast);
        const dayIdx = uniqueDays.indexOf(dk);
        const painLevel = getPainLevelByVisit(dayIdx, uniqueDays.length, poc, phase);
        const obs = getObsForVisit(dayIdx, 3, poc);
        // Wound mode: teaching rotates through WOUND_TEACHING (skip BS topic for non-diabetics)
        // Wound stage band drives teaching + care wording (computed from the first wound's trajectory)
        const wprog0 = woundMode ? getWoundProgress(woundList[0]||{}, dayIdx, uniqueDays.length, dischargeOn) : null;
        const wband = wprog0 ? wprog0.band : "early";
        const wt = getWoundTeaching(wband, dayIdx, poc.isDiabetic);
        // Per-day wound trajectory (review fixes #1+#4): same-day AM/PM share the same findings
        let woundFindingsStr = "not applicable", necessityStr = "not applicable";
        if (woundMode) {
          woundFindingsStr = woundList.map((w, wi) => {
            const p = wi === 0 ? wprog0 : getWoundProgress(w, dayIdx, uniqueDays.length, dischargeOn);
            const parts = [`Wound #${wi+1} (${w.location||"per POC"})`];
            if (p.sizeStr) parts.push("measurement: " + p.sizeStr);
            parts.push("wound bed: " + p.bed);
            parts.push("drainage: " + p.drainage);
            parts.push("edges/periwound: " + p.edges);
            return parts.join("; ");
          }).join(" | ") || "qualitative assessment only — no measurements documented in POC";
          necessityStr = poc.caregiverPerformsWoundCare ? SN_NECESSITY[dayIdx % SN_NECESSITY.length] : "not applicable";
        }
        const topic = woundMode
          ? (isLast ? "WOUND CARE & DISCHARGE PLANNING" : "WOUND CARE — " + wt[0])
          : (isLast ? "MEDICATION SAFETY & DISCHARGE PLANNING"
              : (phase==="PRE_DISCHARGE" ? "DISCHARGE PLANNING & READINESS REVIEW"
              : (dayCache[dk]?.topic || topics[dayIdx%topics.length] || "DISEASE PROCESS & MANAGEMENT")));
        setGenStatus(`Generating note ${i+1}/${total}: ${topic}...`);

        const diagStr=(poc.diagnoses||[]).slice(0,8).join(", ");
        const medsStr=(poc.medications||[]).slice(0,8).join(", ");
        const subject = poc.hasCaregiver ? "patient/caregiver" : "patient";
        const subjectCap = poc.hasCaregiver ? "Patient/caregiver" : "Patient";
        const painLoc = getPainLocation(topic, poc.diagnoses);
        const painMed = findPainMed(poc.medications);
        const painMedPhrase = painMed ? (painMed + " as ordered") : "current pain management measures per MD orders";
        const hasResp = hasRespiratoryMed(poc.medications) ? "YES" : "NO";
        // Rule 1-4 normalized values — same data drives checkboxes AND narrative
        const device = getAssistiveDevice(poc) || "none";
        const dfx = poc.deficits||{};
        const edemaStatus = dfx.edema ? "non-pitting BLE" + (dayIdx===0?" (first documented this visit — say 'was noted', not 'remained')":" (documented previously — 'remained present' is allowed)") : "none documented";
        const sobLevel = dfx.sob ? (dfx.sobExertion||"moderate")+" exertion" : "not documented";
        const msx = poc.mentalStatus||{};
        const mentalStr = [msx.alert!==false?"alert":null, msx.oriented!==false?"oriented":null, msx.forgetful?"forgetful":null, msx.confusedAtTimes?"confused at times":null, msx.anxious?"anxious at times":null].filter(Boolean).join(", ");

        // Injection details for this visit
        let injInfo = "", injSentence = "", injSite = "", injText = "";
        if (useInjection) {
          injSite = getInjSite(i, poc.leftArmRestricted);
          // Deterministic injection documentation — matched to 485 order style (guaranteed in every note)
          const bidTeach = poc.isDiabetic ? " " + BID_TEACHING[dayIdx % BID_TEACHING.length] : "";
          injText = `SN prepared and administered ${inj.name} ${inj.dose} ${inj.route} at ${injSite} as ordered by MD, using aseptic technique with proper rotation of injection sites and proper disposal of sharps and contaminated materials. Injection site assessed before and after administration; no redness, swelling, bruising, skin breakdown, or adverse reaction noted.${poc.isDiabetic?" Blood sugar level monitored using patient's glucometer with aseptic technique, proper rotation of puncture sites, and proper sharps disposal; result recorded. Diabetic foot exam and care performed this visit.":""}${bidTeach}`;
          injInfo = `Injectable medication: ${inj.name} ${inj.dose} ${inj.route}, ${inj.frequency}. This visit's injection site: ${injSite}. NOTE: The injection documentation is inserted automatically — do NOT write your own injection sentence.`;
          injSentence = "";
        }

        const prevNote = prevTopics.length>0 ? ` Previously covered: ${prevTopics.slice(-3).join(", ")}. Use different phrasing.` : "";
        // BID notes add a ~80-word injection paragraph → shorter AI base keeps
        // the total ≈ a normal note (fits one page at full font size).
        const wordTarget = useInjection ? "120-190" : "180-320";
        const basePrompt = woundMode ? WOUND_NOTE_PROMPT : NOTE_PROMPT;
        const prompt=basePrompt
          .replace(/\{WORDS\}/g,wordTarget)
          .replace(/\{WTOPIC\}/g, wt[1])
          .replace(/\{WOUNDS\}/g, woundsStr)
          .replace(/\{WSTAGE\}/g, wprog0 ? wprog0.careMode : "not applicable")
          .replace(/\{WFINDINGS\}/g, woundFindingsStr)
          .replace(/\{WNECESSITY\}/g, necessityStr)
          .replace(/\{WORDER\}/g, woundOrder || "wound care per plan of care (no specific order text — use conservative wording)")
          .replace(/\{WDRESSING\}/g, woundDressing)
          .replace(/\{PHASE\}/g,phase)
          .replace(/\{PAIN\}/g,painLevel)
          .replace(/\{PAINLOC\}/g,painLoc)
          .replace(/\{PAINCHAR\}/g,getPainCharacter(poc.diagnoses))
          .replace(/\{PAINMED\}/g,painMed||"none")
          .replace(/\{PAINMED_PHRASE\}/g,painMedPhrase)
          .replace(/\{SUBJECT_CAP\}/g,subjectCap)
          .replace(/\{SUBJECT\}/g,subject)
          .replace(/\{HAS_RESP\}/g,hasResp)
          .replace(/\{MOBILITY\}/g,poc.isBedbound?"BEDBOUND":"AMBULATORY")
          .replace(/\{DEVICE\}/g,device)
          .replace(/\{EDEMA\}/g,edemaStatus)
          .replace(/\{SOBLEVEL\}/g,sobLevel)
          .replace(/\{MENTAL\}/g,mentalStr||"not documented")
          .replace("{TOPIC}",topic)
          .replace("{DIAGNOSES}",diagStr)
          .replace("{NUM}",i+1).replace("{TOTAL}",total)
          .replace("{MEDS}",medsStr)
          .replace("{OBS}",obs.join(" | "))
          .replace("{INJECTION_INFO}",injInfo)
          .replace("{INJECTION_SENTENCE}",injSentence) + prevNote;

        let intervention;
        if (dayCache[dk]?.intervention) {
          // Same-day 2nd visit (PM): reuse the AM intervention — only time/vitals/injection site differ
          intervention = dayCache[dk].intervention;
        } else {
          intervention = await callAPI([{role:"user",content:prompt}],"",1100);
          intervention = cleanNoteText(intervention);
        }
        // GUARANTEED injection documentation: insert after the opening block in every BID note
        if (useInjection && injText) {
          // Remove any AI-written injection sentence to avoid duplication
          intervention = intervention.replace(/SN (prepared and )?administered[^.]*\.(\s*Injection site[^.]*\.)?/gi, "").replace(/\s{2,}/g," ").trim();
          // Insert after first block (after "patient care." opening) or prepend if not found
          const anchor = "patient care.";
          const pos = intervention.indexOf(anchor);
          if (pos !== -1) {
            const insertAt = pos + anchor.length;
            intervention = intervention.slice(0, insertAt) + " " + injText + " " + intervention.slice(insertAt).trim();
          } else {
            intervention = injText + " " + intervention;
          }
        }
        // Safety net: remove ongoing-care contradictions from final discharge notes
        if (phase === "FINAL_DISCHARGE") {
          intervention = intervention
            .replace(/Patient continues to require skilled observation and reinforcement\.?/gi,"")
            .replace(/Continued skilled teaching and follow-up indicated\.?/gi,"")
            .replace(/Patient continues to require skilled observation\.?/gi,"")
            .replace(/Patient continues to require follow-up teaching\.?/gi,"")
            .replace(/[Nn]eeds further assessment[^.]*\.?/g,"")
            .replace(/[Nn]eeds further teaching on disease process and management\.?/g,"")
            .replace(/Continue plan of care as approved by MD\.?/gi,"")
            .replace(/\s{2,}/g," ").trim();
        }

        if (!dayCache[dk]) dayCache[dk] = { topic, intervention };

        const vs = pickVS();
        // §5: generated O2 must stay within the POC's safe range — never create an
        // abnormal value and ignore it. (Abnormals only via manual entry.)
        const o2th = parseInt(poc.o2Threshold);
        if (!isNaN(o2th) && parseInt(vs.o2) < o2th + 1) vs.o2 = String(Math.min(98, o2th + 2 + (dayIdx % 3)));
        setPreviewVS(vs);
        // BID diabetic BS logic: AM (fasting) lower, PM higher — always non-reportable
        if (poc.isDiabetic) {
          const tstr = v.timeIn||"";
          const isAM = /pm/i.test(tstr) ? false : (/am/i.test(tstr) ? true : (parseInt(tstr)||9) < 12);
          vs.bs = String(isAM ? Math.floor(110 + Math.random()*40)   // AM fasting 110-150
                              : Math.floor(135 + Math.random()*45)); // PM 135-180
        }
        // Constipation patients: BM 2-3 days back (daily BM contradicts K59.04); others: 1 day
        const hasConstipation = (poc.diagnoses||[]).join(" ").toLowerCase().includes("constipation");
        const bmDaysBack = hasConstipation ? (2 + (dayIdx % 2)) : 1; // same-day AM/PM notes share the same Last BM
        const bmDate = new Date(date); bmDate.setDate(bmDate.getDate()-bmDaysBack);
        generated.push({
          date, dk, topic, intervention:intervention.trim(), vs, isLast,
          lastBM:fmtDateDot(bmDate), poc,
          timeIn:v.timeIn, timeOut:v.timeOut, injSite,
          painLevel, phase, painLoc,
          nurseName: (v.nurseName||"").trim()
        });
        prevTopics.push(topic);
      }

      setNotes(generated);
      setGenStatus(`✅ ${total} note${total>1?"s":""} ready!${useInjection?` (${total} injections documented)`:""}`);
    } catch(err){ setError("Generation error: "+err.message); setGenStatus(""); }
    finally { setGenerating(false); }
  };

    // ── Download ───────────────────────────────────────────────────────────────
  const downloadNote = (note) => {
    const html = buildNoteHTML({poc:note.poc, agencyName, snName: note.nurseName||snName, date:note.dk, timeIn:note.timeIn||"", timeOut:note.timeOut||"", vs:note.vs, topic:note.topic, intervention:note.intervention, lastBM:note.lastBM, isLastNote:note.isLast, painLevel:note.painLevel, phase:note.phase, painLoc:note.painLoc});
    const blob = new Blob([html],{type:"text/html;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href=url;
    const tag = note.timeIn ? "-"+note.timeIn.replace(":","") : "";
    a.download=`Note-${(note.poc?.patient?.name||"patient").replace(/[\s,]+/g,"-")}-${note.dk.replace(/\//g,"-")}${tag}.html`;
    a.style.display="none";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(url),3000);
  };

  const downloadAll = () => {
    if(notes.length===0)return;
    notes.forEach((n,i)=>{
      setTimeout(()=>{
        const html=buildNoteHTML({poc:n.poc,agencyName,snName:n.nurseName||snName,date:n.dk,timeIn:n.timeIn||"",timeOut:n.timeOut||"",vs:n.vs,topic:n.topic,intervention:n.intervention,lastBM:n.lastBM,isLastNote:n.isLast,painLevel:n.painLevel,phase:n.phase,painLoc:n.painLoc});
        const blob=new Blob([html],{type:"text/html;charset=utf-8"});
        const url=URL.createObjectURL(blob);
        const a=document.createElement("a");
        a.href=url;
        const tag = n.timeIn ? "-"+n.timeIn.replace(":","") : "";
        a.download=`Note-${(n.poc?.patient?.name||"patient").replace(/[\s,]+/g,"-")}-${n.dk.replace(/\//g,"-")}${tag}.html`;
        a.style.display="none";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(()=>URL.revokeObjectURL(url),3000);
      }, i*700);
    });
  };

  // ── AUTOMATION BRIDGE ──────────────────────────────────────────────────────
  const noteToHTML = (n) => {
    const html = buildNoteHTML({poc:n.poc, agencyName, snName:n.nurseName||snName, date:n.dk, timeIn:n.timeIn||"", timeOut:n.timeOut||"", vs:n.vs, topic:n.topic, intervention:n.intervention, lastBM:n.lastBM, isLastNote:n.isLast, painLevel:n.painLevel, phase:n.phase, painLoc:n.painLoc});
    const tag = n.timeIn ? "-"+n.timeIn.replace(":","") : "";
    const filename = `Note-${(n.poc?.patient?.name||"patient").replace(/[\s,]+/g,"-")}-${n.dk.replace(/\//g,"-")}${tag}.html`;
    return { filename, html };
  };
  useEffect(() => {
    window.__automation = {
      version: 10, ready: true,
      setAgency: (name) => setAgencyName(name),
      setNurse: (name) => setSnName(name),
      setBID: (v) => setBidPatient(!!v),
      setWound: (v) => { setWoundMode(!!v); if (v) setShowWoundFields(true); },
      // Full visit list, duplicates allowed (AM+PM). Each visit may carry its
      // own nurseName — flows straight into the bulk entries the app uses.
      setVisits: (list) => {
        const entries = (list||[]).map(v => {
          const [m,d,y] = String(v.date).split("/").map(Number);
          const dt = new Date(y, m-1, d); dt.setHours(12,0,0,0);
          return { date: dt, timeIn: v.timeIn || "", timeOut: v.timeOut || "", nurseName: (v.nurseName||"").trim(), raw: `${v.date} ${v.timeIn||""}-${v.timeOut||""}${v.nurseName?" Nurse: "+v.nurseName:""}` };
        }).filter(e => !isNaN(e.date))
          .sort((a,b) => a.date - b.date || String(a.timeIn).localeCompare(String(b.timeIn)));
        setBulkText(entries.map(e => e.raw).join("\n"));
        setBulkEntries(entries);
      },
      extract: () => { extract485(); },
      generate: () => { generateAll(); },
      getState: () => ({
        hasFile: !!file, extracting, generating, hasPoc: !!poc,
        agency: agencyName, nurse: snName, dates: dates.map(fmtDate),
        bid: bidPatient, wound: woundMode, bulkCount: bulkEntries.length,
        certPeriod: { start: poc?.certPeriodStart || "", end: poc?.certPeriodEnd || "" },
        skippedDates, noteCount: notes.length, status: genStatus, error
      }),
      getNotesHTML: () => notes.map(noteToHTML)
    };
  }, [file, extracting, generating, poc, agencyName, snName, dates, dateTimes, skippedDates, bidPatient, woundMode, bulkEntries, notes, genStatus, error]);

  // Stage badge
  const stageBadge = poc ? {
    SOC:     {label:"Start of Care",  bg:"#dbeafe", color:"#1e40af"},
    RECERT:  {label:"Recertification",bg:"#d1fae5", color:"#065f46"},
    DISCHARGE:{label:"Discharge",     bg:"#fef3c7", color:"#92400e"}
  }[poc.stage]||{label:poc.stage,bg:"#f3f4f6",color:"#374151"} : null;

  const SL = () => <span style={{width:18,height:2,background:"#2b6cb0",display:"inline-block",borderRadius:2,marginRight:6}}/>;

  return (
    <div style={{background:"linear-gradient(135deg,#e8edf5,#d4dbe8)",minHeight:"100vh",padding:"12px",fontFamily:"'Segoe UI',system-ui,sans-serif"}}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        .dz:hover{border-color:#2b6cb0!important;background:#eff6ff!important}
        *{box-sizing:border-box}
        @media(max-width:480px){.two-col{grid-template-columns:1fr!important}}
      `}</style>

      {/* Header */}
      <div style={{maxWidth:640,margin:"0 auto 14px",display:"flex",alignItems:"center",gap:10}}>
        <div style={{width:42,height:42,background:"linear-gradient(135deg,#1a4f8a,#2b6cb0)",borderRadius:11,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,boxShadow:"0 4px 12px rgba(43,108,176,0.3)",flexShrink:0}}>🏥</div>
        <div>
          <div style={{fontWeight:800,fontSize:16,color:"#1a2f5a"}}>Clinical Note Generator</div>
          <div style={{fontSize:11,color:"#64748b"}}>Stage-Aware · AI-Powered · Sequential Notes</div>
        </div>
      </div>

      <div style={{maxWidth:640,margin:"0 auto",background:"white",borderRadius:16,boxShadow:"0 4px 24px rgba(0,0,0,0.1)"}}>

        {/* Agency Name */}
        <div style={{padding:"18px 22px 14px"}}>
          <div style={{fontSize:11,fontWeight:800,color:"#2b6cb0",letterSpacing:1,textTransform:"uppercase",marginBottom:10,display:"flex",alignItems:"center"}}><SL/>Agency Name</div>
          {editAgency
            ?<div style={{display:"flex",gap:8}}><input data-testid="agency-input" value={agencyName} onChange={e=>setAgencyName(e.target.value)} autoFocus style={{flex:1,padding:"9px 12px",border:"1.5px solid #2b6cb0",borderRadius:8,fontSize:14,fontWeight:700,fontFamily:"inherit",outline:"none",color:"#1a2f5a"}}/><button onClick={()=>setEditAgency(false)} style={{padding:"9px 14px",background:"#2b6cb0",color:"white",border:"none",borderRadius:8,fontWeight:700,cursor:"pointer",fontSize:13}}>✓ Done</button></div>
            :<div data-testid="agency-display" onClick={()=>setEditAgency(true)} style={{padding:"9px 14px",background:"#f0f7ff",border:"1.5px dashed #93c5fd",borderRadius:8,cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontWeight:800,fontSize:14,color:"#1a2f5a"}}>{agencyName}</span>
              <span style={{fontSize:11,color:"#2b6cb0",fontWeight:600}}>✏️ Edit</span>
            </div>
          }
        </div>

        <div style={{height:1,background:"#f1f5f9",margin:"0 22px"}}/>

        {/* Vital Signs status */}
        <div style={{padding:"10px 22px"}}>
          <div style={{background:"#f0fdf4",border:"1.5px solid #86efac",borderRadius:10,padding:"8px 12px",display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:18}}>🎲</span>
            <div>
              <div style={{fontWeight:700,fontSize:11,color:"#14532d"}}>Vital Signs: Auto-Random (160 entries built-in)</div>
              {previewVS&&<div style={{fontSize:10,color:"#166534",marginTop:1,fontFamily:"monospace"}}>T {previewVS.temp} · HR {previewVS.hr} · RR {previewVS.rr}/min · BP {previewVS.bp} mmHg</div>}
            </div>
            <button onClick={()=>setPreviewVS(pickVS())} style={{marginLeft:"auto",background:"white",border:"1px solid #86efac",borderRadius:6,color:"#166534",fontSize:10,padding:"3px 8px",cursor:"pointer",fontWeight:700}}>🔀 New</button>
          </div>
        </div>

        <div style={{height:1,background:"#f1f5f9",margin:"0 22px"}}/>

        {/* SN Name */}
        <div style={{padding:"14px 22px 0"}}>
          <div style={{fontSize:11,fontWeight:800,color:"#2b6cb0",letterSpacing:1,textTransform:"uppercase",marginBottom:10,display:"flex",alignItems:"center"}}><SL/>Visit Details</div>
          <div style={{marginBottom:12}}><NameAutocomplete value={snName} onChange={setSnName}/></div>

          {/* Email subject routing (spec §1) */}
          <div style={{marginBottom:10}}>
            <label style={{fontSize:11,fontWeight:700,color:"#475569",display:"block",marginBottom:4}}>📧 Email Subject <span style={{fontWeight:400,color:"#94a3b8"}}>(optional — auto-detects mode)</span></label>
            <input value={emailSubject} onChange={e=>applyEmailSubject(e.target.value)}
              placeholder={'e.g. "Makrui Uzunyan Wound BID Notes"'}
              style={{width:"100%",fontSize:12,padding:"7px 10px",border:"1.5px solid #e2e8f0",borderRadius:8,boxSizing:"border-box"}}/>
            {emailSubject && (
              <div style={{display:"flex",gap:6,marginTop:4}}>
                {/wound/i.test(emailSubject) && <span style={{fontSize:10,background:"#fee2e2",color:"#991b1b",padding:"2px 8px",borderRadius:10,fontWeight:700}}>🩹 WOUND MODE detected</span>}
                {/\b(bid|pid)\b/i.test(emailSubject) && <span style={{fontSize:10,background:"#dcfce7",color:"#166534",padding:"2px 8px",borderRadius:10,fontWeight:700}}>💉 BID detected</span>}
                {!/wound/i.test(emailSubject) && !/\b(bid|pid)\b/i.test(emailSubject) && <span style={{fontSize:10,color:"#94a3b8"}}>no mode keywords — regular notes</span>}
              </div>
            )}
          </div>

          {/* Options: BID / Auto AM-PM / Discharge */}
          <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:14,background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:10,padding:"12px 14px"}}>
            <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:12.5}}>
              <input type="checkbox" checked={bidPatient} onChange={e=>setBidPatient(e.target.checked)} style={{width:16,height:16,accentColor:"#2b6cb0",cursor:"pointer"}}/>
              <span><b>BID Patient</b> — document injection on each visit {poc?.injectable?.found && <span style={{fontSize:10,background:"#dcfce7",color:"#166534",padding:"1px 6px",borderRadius:8,fontWeight:600,marginLeft:4}}>💉 {poc.injectable.name} detected</span>}</span>
            </label>
            <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:12.5}}>
              <input type="checkbox" checked={woundMode} onChange={e=>{setWoundMode(e.target.checked); if(e.target.checked) setShowWoundFields(true);}} style={{width:16,height:16,accentColor:"#dc2626",cursor:"pointer"}}/>
              <span><b>Wound Patient / Wound Care Notes</b> — wound-focused visit notes {poc?.hasWound && <span style={{fontSize:10,background:"#fee2e2",color:"#991b1b",padding:"1px 6px",borderRadius:8,fontWeight:600,marginLeft:4}}>🩹 wound found in 485</span>}</span>
            </label>
            {woundMode && (
              <div style={{marginLeft:24,padding:"8px 10px",background:"#fff7ed",border:"1px solid #fed7aa",borderRadius:8}}>
                <div onClick={()=>setShowWoundFields(!showWoundFields)} style={{fontSize:11,fontWeight:700,color:"#9a3412",cursor:"pointer",marginBottom:showWoundFields?6:0}}>
                  {showWoundFields?"▾":"▸"} Manual wound fields (optional — fills gaps; 485 data has priority)
                </div>
                {showWoundFields && (
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                    <input placeholder="Wound location (e.g. left heel)" value={manualWound.location} onChange={e=>setManualWound({...manualWound,location:e.target.value})} style={{fontSize:11,padding:"5px 8px",border:"1px solid #fdba74",borderRadius:6}}/>
                    <input placeholder="Dressing type" value={manualWound.dressingType} onChange={e=>setManualWound({...manualWound,dressingType:e.target.value})} style={{fontSize:11,padding:"5px 8px",border:"1px solid #fdba74",borderRadius:6}}/>
                    <input placeholder="Wound care order" value={manualWound.careOrder} onChange={e=>setManualWound({...manualWound,careOrder:e.target.value})} style={{fontSize:11,padding:"5px 8px",border:"1px solid #fdba74",borderRadius:6,gridColumn:"1 / -1"}}/>
                    <input placeholder="Frequency (e.g. daily)" value={manualWound.frequency} onChange={e=>setManualWound({...manualWound,frequency:e.target.value})} style={{fontSize:11,padding:"5px 8px",border:"1px solid #fdba74",borderRadius:6}}/>
                  </div>
                )}
              </div>
            )}
            <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:12.5}}>
              <input type="checkbox" checked={autoAMPM} onChange={e=>setAutoAMPM(e.target.checked)} style={{width:16,height:16,accentColor:"#2b6cb0",cursor:"pointer"}}/>
              <span><b>Auto-create AM/PM</b> — 2 notes per calendar date (07:00 & 19:00)</span>
            </label>
            <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:12.5}}>
              <input type="checkbox" checked={dischargeOn} onChange={e=>setDischargeOn(e.target.checked)} style={{width:16,height:16,accentColor:"#d97706",cursor:"pointer"}}/>
              <span><b>Discharge</b> — make ONLY the last note a discharge note</span>
            </label>
          </div>

          {/* Bulk date/time input */}
          <div style={{marginBottom:12}}>
            <div style={{fontSize:11,fontWeight:700,color:"#374151",marginBottom:4,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span>Bulk Visit Dates / Times</span>
              {bulkEntries.length>0 && <span style={{fontSize:10,background:"#dbeafe",color:"#1e40af",padding:"1px 8px",borderRadius:10,fontWeight:600}}>{bulkEntries.length} visit{bulkEntries.length!==1?"s":""} parsed</span>}
            </div>
            <textarea value={bulkText} onChange={e=>{setBulkText(e.target.value);setBulkEntries(parseBulkInput(e.target.value));}}
              placeholder={"Paste one visit per line, e.g.\n03/25/2026 11:00-11:45\n03/25/2026 19:00-19:45\n03/26/2026 11:00-11:45"}
              rows={4}
              style={{width:"100%",padding:"9px 12px",border:"1.5px solid #d1d5db",borderRadius:8,fontSize:12,fontFamily:"monospace",outline:"none",resize:"vertical",lineHeight:1.5}}/>
            <div style={{fontSize:10,color:"#94a3b8",marginTop:3}}>One line = one note{bidPatient?" + one injection":""}. Same date twice = 2 separate notes. Leave empty to use the calendar below instead.</div>

            {/* Bulk analysis panel */}
            {bulkEntries.length>0 && (()=>{ 
              const byDay = {};
              bulkEntries.forEach(e=>{ const k=fmtDate(e.date); (byDay[k]=byDay[k]||[]).push(e); });
              const days = Object.keys(byDay);
              const twoPerDay = days.filter(d=>byDay[d].length===2).length;
              const onePerDay = days.filter(d=>byDay[d].length===1).length;
              const withTimes = bulkEntries.filter(e=>e.timeIn).length;
              return (
                <div style={{marginTop:8,background:"#eff6ff",border:"1.5px solid #bfdbfe",borderRadius:10,padding:"10px 14px",fontSize:11,color:"#1e40af"}}>
                  <div style={{fontWeight:800,marginBottom:6,display:"flex",alignItems:"center",gap:6}}>📊 Analysis</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"4px 12px",lineHeight:1.6}}>
                    <span>📋 Total notes: <b>{bulkEntries.length}</b></span>
                    <span>📅 Unique days: <b>{days.length}</b></span>
                    <span>🌗 2 visits/day: <b>{twoPerDay}</b></span>
                    <span>☀️ 1 visit/day: <b>{onePerDay}</b></span>
                    {bidPatient && poc?.injectable?.found && <span>💉 Injections: <b>{bulkEntries.length}</b></span>}
                    <span>🕐 With times: <b>{withTimes}/{bulkEntries.length}</b></span>
                  </div>
                  <div style={{marginTop:6,paddingTop:6,borderTop:"1px solid #bfdbfe",fontSize:10.5}}>
                    Range: <b>{fmtDate(bulkEntries[0].date)}</b> → <b>{fmtDate(bulkEntries[bulkEntries.length-1].date)}</b>
                    {dischargeOn && <span> · 🏁 Last note (<b>{fmtDate(bulkEntries[bulkEntries.length-1].date)} {bulkEntries[bulkEntries.length-1].timeIn}</b>) = Discharge</span>}
                  </div>
                  {bidPatient && poc?.injectable?.found && (
                    <div style={{marginTop:6,paddingTop:6,borderTop:"1px solid #bfdbfe",fontSize:10.5}}>
                      💉 <b>{poc.injectable.name}</b> {poc.injectable.dose} {poc.injectable.route} — sites rotate{poc.leftArmRestricted?" (left arm avoided — mastectomy)":""}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Calendar (used only when bulk box is empty) */}
          {bulkEntries.length===0 && <div style={{marginBottom:12,position:"relative",zIndex:30}}><CalendarPicker dates={dates} onChange={setDates}/></div>}

          {/* Per-date time pickers - sorted once, stable keys prevent lag */}
          {bulkEntries.length===0 && !autoAMPM && dates.length>0&&<div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:4}}>
            {dates.map((date,idx)=>{
              const dk=fmtDate(date);
              const t=getTime(dk);
              return (
                <div key={dk} style={{background:"#f8fafc",border:"1.5px solid #e2e8f0",borderRadius:10,padding:"10px 14px"}}>
                  <div style={{fontSize:11,fontWeight:800,color:"#1e40af",marginBottom:8,display:"flex",alignItems:"center",gap:6}}>
                    <span style={{background:"#2b6cb0",color:"white",borderRadius:"50%",width:18,height:18,display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:900}}>{idx+1}</span>
                    📅 {dk}
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                    <TimePicker label="Time In"  hour={t.inH}  minute={t.inM}  ampm={t.inAP}  onChange={(h,m,a)=>{setTimeForDate(dk,"inH",h);setTimeForDate(dk,"inM",m);setTimeForDate(dk,"inAP",a);}}/>
                    <TimePicker label="Time Out" hour={t.outH} minute={t.outM} ampm={t.outAP} onChange={(h,m,a)=>{setTimeForDate(dk,"outH",h);setTimeForDate(dk,"outM",m);setTimeForDate(dk,"outAP",a);}}/>
                  </div>
                </div>
              );
            })}
          </div>}
        </div>

        <div style={{height:1,background:"#f1f5f9",margin:"12px 22px 0"}}/>

        {/* Plan of Care Upload */}
        <div style={{padding:"14px 22px 22px"}}>
          <div style={{fontSize:11,fontWeight:800,color:"#2b6cb0",letterSpacing:1,textTransform:"uppercase",marginBottom:10,display:"flex",alignItems:"center"}}><SL/>Plan of Care (485 Document)</div>

          <div className="dz" onClick={()=>fileRef.current?.click()}
            onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)}
            onDrop={e=>{e.preventDefault();setDrag(false);handleFile(e.dataTransfer.files[0]);}}
            style={{border:`2px dashed ${drag?"#2b6cb0":"#cbd5e0"}`,borderRadius:10,padding:18,textAlign:"center",cursor:"pointer",background:drag?"#eff6ff":"#f8fafc",transition:"all 0.2s",marginBottom:12}}>
            <input data-testid="file-input" ref={fileRef} type="file" accept="image/*,application/pdf" style={{display:"none"}} onChange={e=>handleFile(e.target.files[0])}/>
            {file
              ?<div>{filePreview&&<img src={filePreview} alt="" style={{maxHeight:55,borderRadius:4,marginBottom:6,display:"block",margin:"0 auto 6px"}}/>}
                <div style={{color:"#2b6cb0",fontWeight:700,fontSize:13}}>📄 {file.name}</div>
                <div style={{color:"#94a3b8",fontSize:11,marginTop:2}}>Click to change</div>
              </div>
              :<div><div style={{fontSize:28,marginBottom:4}}>📂</div>
                <div style={{color:"#475569",fontWeight:600,fontSize:13}}>Drop 485 Plan of Care here</div>
                <div style={{color:"#94a3b8",fontSize:11,marginTop:2}}>PDF or image · Click to browse</div>
              </div>
            }
          </div>

          {/* Optional 487 addendum */}
          {file && (
            <div onClick={()=>fileRef487.current?.click()}
              style={{border:"1.5px dashed #cbd5e0",borderRadius:8,padding:"8px 12px",textAlign:"center",cursor:"pointer",background:file487?"#f0fdf4":"#fafafa",marginBottom:10,fontSize:12}}>
              <input ref={fileRef487} type="file" accept="image/*,application/pdf" style={{display:"none"}} onChange={e=>{setFile487(e.target.files[0]);setPoc(null);}}/>
              {file487
                ? <span style={{color:"#166534",fontWeight:600}}>📎 487 attached: {file487.name} <span onClick={e=>{e.stopPropagation();setFile487(null);setPoc(null);}} style={{color:"#ef4444",fontWeight:700,marginLeft:6}}>✕</span></span>
                : <span style={{color:"#94a3b8"}}>📎 Optional: attach 487 / med-list addendum (click) — recommended when 485 says "See 487"</span>}
            </div>
          )}

          {/* Extract button */}
          {file&&!poc&&(
            <button data-testid="extract-btn" onClick={extract485} disabled={extracting}
              style={{width:"100%",padding:11,background:extracting?"#93c5fd":"#0ea5e9",color:"white",border:"none",borderRadius:9,fontSize:14,fontWeight:700,cursor:extracting?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginBottom:10,transition:"all 0.2s"}}>
              {extracting?<><div style={{width:15,height:15,border:"2.5px solid rgba(255,255,255,0.3)",borderTopColor:"white",borderRadius:"50%",animation:"spin 0.7s linear infinite"}}/>Reading 485 document...</>:"🔍 Read & Analyze 485"}
            </button>
          )}

          {/* POC loaded info */}
          {poc&&(
            <div style={{marginBottom:12,padding:"10px 14px",background:"#f0fdf4",border:"1.5px solid #86efac",borderRadius:10,animation:"fadeIn 0.3s ease"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                <span style={{fontWeight:700,fontSize:13,color:"#14532d"}}>✅ 485 Loaded</span>
                {stageBadge&&<span style={{fontSize:11,background:stageBadge.bg,color:stageBadge.color,padding:"2px 8px",borderRadius:10,fontWeight:700}}>{stageBadge.label}</span>}
                <button onClick={()=>{setPoc(null);setNotes([]);}} style={{marginLeft:"auto",fontSize:10,color:"#6b7280",background:"none",border:"none",cursor:"pointer"}}>✕ Clear</button>
              </div>
              <div style={{fontSize:11,color:"#374151",lineHeight:1.8}}>
                <strong>{poc.patient?.name}</strong> · MR# {poc.patient?.mrNumber} · Cert: {poc.certPeriodStart} – {poc.certPeriodEnd}<br/>
                <span style={{color:"#6b7280"}}>Diag: {(poc.diagnoses||[]).length} · Meds: {(poc.medications||[]).length} · Topics: {(poc.teachingTopics||[]).length}</span>
              </div>
              {/* Clinical Profile chips — everything analyzed from THIS 485 */}
              <div style={{display:"flex",flexWrap:"wrap",gap:4,marginTop:6}}>
                {[
                  poc.isBedbound?["🛏 Bedbound","#fef3c7","#92400e"]:["🚶 Ambulatory","#dbeafe","#1e40af"],
                  poc.hasWalker&&["🦯 Walker","#e0e7ff","#3730a3"],
                  poc.hasCane&&["🦯 Cane","#e0e7ff","#3730a3"],
                  poc.hasWheelchair&&["♿ W/C","#e0e7ff","#3730a3"],
                  poc.hasWound&&[`🩹 Wound${poc.woundStage?" St."+poc.woundStage:""}`,"#fee2e2","#991b1b"],
                  poc.isDiabetic&&["🩸 Diabetic","#fce7f3","#9d174d"],
                  poc.injectable?.found&&[`💉 ${poc.injectable.name||"Injectable"}`,"#fce7f3","#9d174d"],
                  [`⚡ Pain: ${getPainLocation("",poc.diagnoses)}${findPainMed(poc.medications)?" · "+findPainMed(poc.medications):" · no analgesic listed"}`,"#fef9c3","#854d0e"],
                  poc.hasCaregiver&&["👥 Caregiver","#d1fae5","#065f46"],
                  poc.hasParalysis&&["⚠️ Paralysis","#fee2e2","#991b1b"],
                  poc.hasVertigo&&["💫 Vertigo","#fef3c7","#92400e"],
                  poc.hasTremor&&["👋 Tremor","#fef3c7","#92400e"],
                  poc.hasDysphagia&&["🍽 Dysphagia","#fee2e2","#991b1b"],
                  poc.deficits?.hoh&&["👂 HOH","#f3f4f6","#374151"],
                  poc.deficits?.poorVision&&["👁 Poor vision","#f3f4f6","#374151"],
                  poc.deficits?.sob&&["💨 SOB","#f3f4f6","#374151"],
                  (poc.deficits?.urinaryIncontinence||poc.deficits?.bowelIncontinence)&&["🚽 Incontinence","#f3f4f6","#374151"],
                ].filter(Boolean).map(([label,bg,col],i)=>(
                  <span key={i} style={{fontSize:10,background:bg,color:col,padding:"2px 8px",borderRadius:10,fontWeight:600}}>{label}</span>
                ))}
              </div>
              {/* Warnings from analysis */}
              {(poc.referencesExternal487 && !file487) && (
                <div style={{marginTop:6,fontSize:10.5,background:"#fef3c7",border:"1px solid #fcd34d",borderRadius:6,padding:"5px 9px",color:"#92400e"}}>
                  ⚠️ This 485 references a <b>487 addendum</b> that isn't attached — medication/diagnosis list may be incomplete. Attach the 487 above and re-extract for full accuracy.
                </div>
              )}
              <div style={{fontSize:10,color:"#2b6cb0",fontWeight:600,marginTop:6}}>Topics: {(poc.teachingTopics||[]).join(" → ")}</div>
              {file&&<button onClick={()=>{setPoc(null);extract485();}} style={{marginTop:6,fontSize:10,color:"#2b6cb0",background:"#eff6ff",border:"1px solid #bfdbfe",borderRadius:5,padding:"2px 8px",cursor:"pointer",fontWeight:600}}>🔄 Re-extract</button>}
            </div>
          )}

          {error&&<div data-testid="error-box" style={{padding:"10px 14px",background:"#fef2f2",border:"1px solid #fecaca",borderRadius:8,color:"#b91c1c",fontSize:12,marginBottom:10}}>{error}</div>}

          {/* Generate button */}
          {poc&&(dates.length>0||bulkEntries.length>0)&&(
            <button data-testid="generate-btn" onClick={generateAll} disabled={generating}
              style={{width:"100%",padding:13,background:generating?"#93c5fd":"#2b6cb0",color:"white",border:"none",borderRadius:10,fontSize:14,fontWeight:700,cursor:generating?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginBottom:notes.length?10:0,boxShadow:"0 4px 12px rgba(43,108,176,0.25)"}}>
              {generating?<><div style={{width:16,height:16,border:"2.5px solid rgba(255,255,255,0.3)",borderTopColor:"white",borderRadius:"50%",animation:"spin 0.7s linear infinite"}}/>{genStatus}</>:(()=>{ const n = bulkEntries.length>0 ? bulkEntries.length : (autoAMPM ? dates.length*2 : dates.length); return `✨ Generate ${n} Clinical Note${n>1?"s":""}${bidPatient&&poc?.injectable?.found?` + ${n} Injection${n>1?"s":""}`:""}`; })()}
            </button>
          )}

          {/* Notes list + download */}
          {notes.length>0&&(
            <div data-testid="notes-ready" style={{animation:"fadeIn 0.4s ease"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <span style={{fontSize:12,fontWeight:700,color:"#166534"}}>📋 {notes.length} Notes Ready</span>
                <button onClick={downloadAll} style={{background:"#166534",color:"white",border:"none",borderRadius:7,padding:"6px 14px",fontSize:12,fontWeight:700,cursor:"pointer"}}>⬇️ Download All</button>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:10}}>
                {notes.map((note,i)=>{
                  const tIn = note.timeIn || "--:--";
                  const tOut = note.timeOut || "--:--";
                  return (
                    <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:note.isLast?"#fef3c7":"#f0fdf4",border:`1px solid ${note.isLast?"#fcd34d":"#86efac"}`,borderRadius:8,padding:"8px 12px"}}>
                      <div>
                        <div style={{fontWeight:700,fontSize:12,color:note.isLast?"#92400e":"#166534"}}>{note.isLast?"🏁 ":"📝 "}{i+1}. {note.dk}</div>
                        <div style={{fontSize:10,color:"#6b7280"}}>⏰ {note.timeIn||"(no time)"}{note.timeIn&&note.timeOut?`–${note.timeOut}`:""} · {note.topic}{note.injSite?` · 💉 ${note.injSite}`:""}</div>
                      </div>
                      <button onClick={()=>downloadNote(note)} style={{background:note.isLast?"#d97706":"#166534",color:"white",border:"none",borderRadius:6,padding:"6px 14px",fontSize:12,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>⬇️ #{i+1}</button>
                    </div>
                  );
                })}
              </div>
              <div style={{background:"#fffbeb",border:"1px solid #fcd34d",borderRadius:8,padding:"10px 14px",fontSize:11,color:"#78350f"}}>
                <strong>To save as PDF:</strong> Open downloaded .html → Chrome/Edge → Ctrl+P / Cmd+P → Save as PDF
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
