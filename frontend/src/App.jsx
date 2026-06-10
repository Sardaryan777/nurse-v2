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
  return { temp: t?.[1]||"98.0", hr: hr?.[1]||"76", rr: rr?.[1]||"18", bp: bp?.[1]||"128/80" };
}
function parseVL(line) { return pickVS(); } // compat
function fmtDate(d) { if(!d)return""; return `${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}/${d.getFullYear()}`; }
function fmtDateDot(d) { if(!d)return""; return `${String(d.getMonth()+1).padStart(2,"0")}.${String(d.getDate()).padStart(2,"0")}.${String(d.getFullYear()).slice(2)}`; }
function fmtTime(h,m,ap) { return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")} ${ap}`; }

const MONTHS=["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS=["Su","Mo","Tu","We","Th","Fr","Sa"];

// ── SYSTEM PROMPT — extract POC info ─────────────────────────────────────────
const EXTRACT_PROMPT = `You are an expert LVN. Extract ALL information from this CMS-485 Plan of Care and return ONLY valid compact JSON (no markdown, no backticks, no explanation).

Detect stage automatically:
- If "Start of Care", "SOC", "Admit" → stage = "SOC"
- If "Recertif" → stage = "RECERT"
- If "Discharge" → stage = "DISCHARGE"

Return this exact structure:
{"stage":"SOC","patient":{"name":"","mrNumber":"","weight":"","dob":""},"agency":{"name":"","phone":""},"physician":{"name":""},"pcg":{"name":"","phone":""},"certPeriodStart":"","certPeriodEnd":"","snvFrequency":"","diagnoses":[],"medications":[],"diet":"low fat, low cholesterol","allergies":"NKDA","fallRiskScore":"","weight":"","hasPleurX":false,"hasWheelchair":false,"hasWalker":true,"hasCane":false,"o2Sat":"96","mentalStatus":{"oriented":true,"alert":true,"forgetful":true,"confusedAtTimes":true,"anxious":true,"depressedControlled":true,"agitated":false},"teachingTopics":[],"homebound":""}

RULES:
- stage: exactly "SOC", "RECERT", or "DISCHARGE"
- diagnoses: ["CODE - Description", ...]
- medications: ["full medication string", ...]
- teachingTopics: ordered list of 9 SHORT ALL-CAPS topic labels (2-5 words each). Derived from diagnoses, most acute first. For RECERT/DISCHARGE: last topic = "MEDICATION SAFETY & DISCHARGE PLANNING". Examples: "ACUTE RESPIRATORY FAILURE", "HOME SAFETY & FALL PRECAUTIONS", "ANXIETY & LORAZEPAM MEDICATION", "BENIGN PROSTATIC HYPERPLASIA", "BIPOLAR DISORDER", "DEPRESSION & CITALOPRAM MEDICATION", "DIFFICULTY IN WALKING", "HYPERLIPIDEMIA & ROSUVASTATIN", "PAIN MANAGEMENT & TYLENOL"
- hasPleurX: true if PleurX catheter mentioned in document`;

// ── NOTE GENERATION PROMPT ────────────────────────────────────────────────────
const NOTE_PROMPT = `You are an LVN writing a concise home health clinical note intervention paragraph.

Stage: {STAGE} | Topic: {TOPIC} | Note #{NUM}/{TOTAL}
Diagnoses: {DIAGNOSES}
Prev topics: {PREV}
Meds: {MEDS}

Write ONE paragraph. ALWAYS start with this fixed opening (copy exactly):
"Patient/caregiver was contacted prior to visit. Homebound status and safety measures assessed. Skilled nursing evaluation and assessment done of all body systems. Vitals signs taken and recorded. Lung and heart sounds auscultated. Pain level assessed. Assessed patients' compliance to the prescribed medications and diet. Reminded patient to take daily medications as ordered by M.D. Hand washing done before and after patient's care."
THEN write 5-6 sentences of clinical education about {TOPIC}: (1) explain the disease/condition in detail, (2) describe signs and symptoms patient should know, (3) outline management and treatment strategies, (4) include medication details if relevant, (5) state clearly when to notify MD or call 911, (6) reinforce self-care or lifestyle measures. Aim for 130-160 words. Be thorough and educational. Do NOT repeat the same idea twice.
RULES: Different wording from prior notes. Vary synonyms. {STAGE} focus: SOC=acute, RECERT=progression, DISCHARGE=independence. Return ONLY the paragraph, no labels.`;

// ── VARIATION PROMPT ──────────────────────────────────────────────────────────
const VARIATION_PROMPT = `Rewrite this nursing intervention paragraph with COMPLETELY DIFFERENT wording, sentence structure, and phrasing. Keep ALL the same clinical meaning and actions. Use synonyms throughout. Change sentence order. Must sound like a different nurse wrote it on a different day. Return ONLY the rewritten text, nothing else.

Original:
{TEXT}`;

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

// ── API HELPER (routed through server-side proxy; key never reaches browser) ──
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
function buildNoteHTML({poc, agencyName, snName, date, timeIn, timeOut, vs, topic, intervention, lastBM, isLastNote}) {
  // Checkbox = real font glyph (☐ empty / ☒ checked). Font metrics handle the
  // alignment so it looks clean. We force a font-family that exists both in the
  // browser (Segoe UI Symbol on Windows) AND in the robot's Linux container
  // (DejaVu Sans, installed via the automation Dockerfile), so it renders the
  // same everywhere.
  const cbFont = "'Segoe UI Symbol','DejaVu Sans','Arial Unicode MS',sans-serif";
  const bh = v => `<span style="font-family:${cbFont}">${v ? "&#9746;" : "&#9744;"}</span>`;
  const ms = poc.mentalStatus||{};
  const hp = poc.hasPleurX||false;
  const isSOC = poc.stage==="SOC";
  const ul = (v,w) => `<span style="border-bottom:1px solid #000;display:inline-block;min-width:${w||60}px;padding-left:2px;vertical-align:bottom">${v||""}</span>`;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Clinical Note – ${poc.patient?.name||""} – ${date}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
@page{size:A4 portrait;margin:10mm 8mm 10mm 8mm}
html,body{
  font-family:"Times New Roman",Times,serif;
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
<body>
<div class="wrap">
<div style="font-size:8.4pt;font-weight:900;margin-bottom:1px">0</div>
<div class="hdr"><h1>${agencyName}</h1><h2>CLINICAL NOTE</h2></div>

<div class="cols">
<!-- LEFT COLUMN -->
<div class="left">
<div class="sec"><div class="st">DEFICITS:</div>
<b>MENTAL: </b>${bh(ms.oriented!==false)}Oriented ${bh(ms.alert!==false)}Alert<br>
${bh(ms.disoriented||false)}Disoriented<br>
${bh(ms.forgetful!==false)}Forgetful ${bh(ms.confusedAtTimes!==false)} Confused at times &nbsp;${bh(ms.anxious!==false)} Anxious at times<br>
${bh(ms.depressedControlled!==false)} Depressed at times( controlled with medications)<br>
${bh(ms.agitated||false)}Agitated</div>

<div class="sec"><div class="st">INTEGUMENTARY:</div>
${bh(false)}Wound ${bh(false)}Decub Stage${bh(false)}1${bh(false)}2${bh(false)}3${bh(false)}4<br>
${bh(false)}Infected ${bh(false)} Foul odor drainage<br>
${bh(false)}Rashes ${bh(false)}Sizes<span style="border-bottom:1px solid #000;display:inline-block;width:30px"></span><br>
${bh(hp)}Tubes ${hp?'<span style="border-bottom:1px solid #000;display:inline-block;width:50px;font-size:8.4pt">left chest rib</span>':''}<span style="border-bottom:1px solid #000;display:inline-block;width:${hp?'5':'30'}px"></span> ${bh(hp)}${hp?'Shunt pleural catheter':'Shunt'}<br>
Other:</div>

<div class="sec"><b>EENT: </b>${bh(true)} poor vision ${bh(false)}Legally blind &nbsp;${bh(false)}Epistaxis<br>
${bh(false)}Dysphagia ${bh(false)}Deaf ${bh(true)} HOH R/L<br>
${bh(false)}Prone to aspiration</div>

<div class="sec"><div class="st">RESPIRATORY: </div>
${bh(true)}SOB ${bh(false)}Rest${bh(true)}min. exer ${bh(false)}<br>
mod. exertion ${bh(false)}Cough ${bh(false)}Productive ${bh(false)}Non-productive ${bh(false)} Sputum Color:<span style="border-bottom:1px solid #000;display:inline-block;width:16px"></span> ${bh(false)}Amount<br>
Lung Sound: <span style="border-bottom:1px solid #000;display:inline-block;width:35px;font-size:8.4pt">${isSOC?"":"clear"}</span><br>
O2sat <u>${poc.o2Sat||"96"}%</u> LPM &nbsp;Other ${isSOC?'<span style="font-size:8.4pt;text-decoration:underline">Acute Respiratory failure with hypoxia</span>':''}</div>

<div class="sec"><div class="st">MUSCULOSKELETAL: </div>
${bh(true)}Stiff joints ${bh(true)}Weakness ${bh(true)}Limited ROM<br>
${bh(poc.hasCane||false)}cane ${bh(poc.hasWalker!==false)}walker ${bh(poc.hasWheelchair||false)}W/C ${bh(false)}Contractures ${bh(false)} Foot drop${bh(true)}Unsteady balance ${bh(false)}Other</div>

<div class="sec"><b>PAIN: </b>${bh(false)}No ${bh(true)} Yes Location: <u>back</u><br>
Intensity: 1 2 3 <u>4</u> 5 6 7 8 9 10<br>
${bh(false)}Sharp ${bh(true)} Dull ${bh(false)}Radiating ${bh(false)}Burning<br>
Controlled ${bh(false)}No ${bh(true)} Yes by: rest, repositioning,<br>exercise: Tylenol 500 mg, 1 tab orally every 6 hours as needed for pain</div>

<div class="sec"><div class="st">GASTROINTESTINAL:</div>
${bh(false)}Nausea ${bh(false)}Vomiting ${bh(false)}Diarrhea<br>
${bh(false)}Constipation ${bh(false)}Impaction ${bh(false)}Abd. Dist.<br>
${bh(true)}Incontinent ${bh(false)}Last BM: <u>${lastBM||""}</u><br>
Appetite ${bh(false)}Good ${bh(true)}Fair ${bh(false)}Poor<br>
Diet: <u>${poc.diet||"low fat, low cholesterol"}</u></div>

<div class="sec"><div class="st">NEUROLOGICAL:</div>
${bh(false)}Aphasic ${bh(false)}Slurred speech ${bh(false)}Seizures<br>
${bh(false)}Headache ${bh(false)}Tremors ${bh(false)}Vertigo<br>
${bh(false)}Grips unequal ${bh(false)}Pupils unequal<br>
${bh(true)}PERRLA ${bh(false)}Weakness R${bh(false)} L${bh(false)}</div>

<div class="sec"><div class="st">CARDIOVASCULAR:</div>
${bh(false)}Chest pain ${bh(false)}Palpitations ${bh(false)}Dizziness<br>
Pedal pulses: ${bh(true)}Present ${bh(false)}Absent<br>
Edema: ${bh(false)}Pitting ${bh(true)}Non-pitting ${bh(false)} Pacer.<br>
${bh(false)}1+ ${bh(false)}2+ ${bh(false)}3+ ${bh(false)}4+ ${bh(false)} Dependent<br>
Location: ${bh(true)}BLE${bh(true)}Dorsum R/L</div>

<div class="sec"><div class="st">GENITOURINARY:</div>
${bh(true)}Incontinent ${bh(true)}Frequency ${bh(true)}Urgency<br>
${bh(false)}Pain ${bh(false)}Nocturia${bh(false)}Burning${bh(false)}Retention<br>
${bh(false)}Catheter ${bh(false)}Condom ${bh(false)}IFC${bh(false)}Suprapub<br>
${bh(false)}Odor ${bh(true)} clear ${bh(false)} Cloudy ${bh(true)}color: yellow &nbsp;${bh(false)}<br>
Hematuria</div>

<div class="sec"><div class="st">ENDOCRINE:</div>
${bh(false)}Weak ${bh(false)}Diaphoretic ${bh(false)}Polyuria<br>
${bh(false)}polydipsia${bh(false)}Blurred vision ${bh(false)}diabetic foot exam.<br>
${bh(false)}sweats ${bh(false)}polyphagia &nbsp; ${bh(false)}Tremors ${bh(false)}Other:</div>

<div class="sec"><div class="st">IDENTIFICATION:</div>
${bh(true)} 2 Ways of identification<br>
${bh(true)} ID/insurance ,Face</div>

<div style="margin-top:3px"><b>ALLERGY: </b>${bh(true)} ${poc.allergies||"NKDA"}</div>
</div>

<!-- RIGHT COLUMN -->
<div class="right">
<div class="sec">
<b>Vital Signs</b>: T: <u>${vs.temp}</u> HR:<u>${vs.hr}</u>bpm &nbsp;RR: <u>${vs.rr}</u>/min BS <span style="border-bottom:1px solid #000;display:inline-block;width:22px"></span> F${bh(false)}R${bh(false)} Repeat <span style="border-bottom:1px solid #000;display:inline-block;width:22px"></span><br>
BP: <b>R / L</b> Lying <span style="border-bottom:1px solid #000;display:inline-block;width:16px"></span> Sitting <u>${vs.bp}</u>mmHg &nbsp;Standing <span style="border-bottom:1px solid #000;display:inline-block;width:28px"></span> &nbsp;Repeat: <span style="border-bottom:1px solid #000;display:inline-block;width:18px"></span>mmHg &nbsp;Wt: <u>${poc.patient?.weight||poc.weight||""}</u>
</div>

<div class="sec">
<b>HOMEBOUND STATUS: </b>${bh(true)}Poor/Limited Endurance ${bh(true)} Poor/Limited Strength<br>
${bh(true)} SOBOE ${bh(true)}Poor Unsteady Gait ${bh(true)}Requires Assist with ADL<br>
${bh(true)} Unable to Negotiate Uneven Surfaces or Steps ${bh(false)} Medical Restrictions<br>
${bh(false)}Non-wt bearing &nbsp;${bh(true)}Requires assist with transfer ${bh(true)}Requires assistive device to ambulate ${bh(true)} Confusion${bh(true)}<br>
Unable to leave home without assistance ${bh(false)}Bedbound<br>
${bh(true)}Paralysis UE / LE / both ${bh(true)}Requires assist to ambulate ${bh(true)}Poor coordination or balance ${bh(false)}Partial wt bearing<br>
${bh(true)} Others: requires considerable and taxing efforts to leave home even with assistance from caregiver.
</div>

<div class="sec"><b>ASSESSMENTS:</b> (Problems/Significant Findings) Teaching done regarding <b>${topic}</b></div>

<div class="sec intv"><b>INTERVENTIONS:</b> <i>(Specific to problems identified and who was given the instructions)</i> ${intervention}</div>

<div class="sec"><b>RESPONSE TO TREATMENT/INSTRUCTIONS: </b>${bh(true)}Patient${bh(true)}PCG Patient asked appropriate questions and verbalizes fair understanding on given instructions. However, due to forgetfulness unable to retain all information and requires further instruction and repetition of information on regular basis. Needs further assessment of all body systems, vital signs, and teaching on disease process and management.</div>

<div class="sec"><b>PLAN</b> (for next visit). ${isLastNote?"Implementation of plan of care. RN to assess patient for possible discharge.":"Continue plan of care approved by MD."}</div>

<div class="sec sm">
<b>UNIVERSAL PRECAUTIONS UTILIZED: </b>${bh(true)}Medical waste disposal ${bh(true)}gloves ${bh(true)}mask ${bh(true)} hand washing ${bh(false)}goggles<br>
${bh(false)}gown ${bh(false)}sharps disposal ${bh(false)}red bagging ${bh(false)}double bagging ${bh(true)} Infection Control:<br>
${bh(true)} Knowledgeable ${bh(false)} SHARPS box in home &nbsp;observed/taught &nbsp;Safety:${bh(true)} Environment assessed for safety<br>
${bh(true)} Equipment inspected ${bh(false)} In Good Condition ${bh(true)} Yes ${bh(false)} No<br>
${bh(true)} Medication Regimen Reviewed &nbsp;${bh(true)} Patient has been identified with two forms of ID &nbsp;Comments: ${bh(true)}<br>
${bh(true)}Medication reconciliation</div>



<div class="sec sm">
<b>COMMUNICATION: </b>${bh(false)}MD ${bh(false)}PT ${bh(false)}OT ${bh(false)}ST ${bh(false)}MS ${bh(false)}RN ${bh(false)}LVN ${bh(false)}CHHA<br>
${bh(isLastNote)} Supervisor ${bh(false)} Pharmacist<br>
Re: ${isLastNote?"POSSIBLE DISCHARGE":""}</div>

<div style="display:flex;gap:12px;align-items:flex-end;margin-bottom:3px;margin-top:2px;font-size:8.4pt">
  <div style="flex:1"><b>SN NAME</b><br><span style="font-size:8.4pt">${snName||""}</span></div>
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
  const [previewVS,  setPreviewVS]  = useState(()=>pickVS());
  const fileRef = useRef(null);

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
      const raw = await callAPI([{role:"user",content:[block,{type:"text",text:"Extract ALL information from this 485 Plan of Care. Return ONLY the JSON."}]}], EXTRACT_PROMPT, 3000);
      const s=raw.indexOf("{"),e=raw.lastIndexOf("}");
      if(s===-1||e===-1) throw new Error("No JSON in response");
      const data = JSON.parse(raw.slice(s,e+1));
      setPoc(data);
    } catch(err){ setError("Extraction error: "+err.message); }
    finally { setExtracting(false); }
  };

  // ── Generate all notes ─────────────────────────────────────────────────────
  const generateAll = async () => {
    if(!poc||dates.length===0)return;
    setGenerating(true); setError(null); setNotes([]);
    try {
      const sorted = [...dates].sort((a,b)=>a-b);
      const topics = poc.teachingTopics||[];
      const total = sorted.length;
      const generated = [];
      const prevTopics = [];

      for(let i=0;i<sorted.length;i++){
        const date = sorted[i];
        const dk = fmtDate(date);
        const isLast = i===sorted.length-1 && (poc.stage==="RECERT"||poc.stage==="DISCHARGE");
        const topic = isLast ? "MEDICATION SAFETY & DISCHARGE PLANNING" : (topics[i%topics.length]||"DISEASE PROCESS & MANAGEMENT");
        setGenStatus(`Generating note ${i+1}/${total}: ${topic}...`);

        const diagStr=(poc.diagnoses||[]).slice(0,6).join(", ");
        const medsStr=(poc.medications||[]).slice(0,4).join(", ");
        const prevNote = prevTopics.length>0 ? ` Previously covered: ${prevTopics.slice(-3).join(", ")}. Use different phrasing.` : "";
        const prompt=NOTE_PROMPT
          .replace(/\{STAGE\}/g,poc.stage||"SOC")
          .replace("{TOPIC}",topic)
          .replace("{DIAGNOSES}",diagStr)
          .replace("{NUM}",i+1).replace("{TOTAL}",total)
          .replace("{PREV}",prevTopics.slice(-3).join(", ")||"none")
          .replace("{MEDS}",medsStr) + prevNote;

        const intervention = await callAPI([{role:"user",content:prompt}],"",800);

        const vs = pickVS();
        setPreviewVS(vs);
        // Last BM = day before visit
        const bmDate = new Date(date); bmDate.setDate(bmDate.getDate()-1);
        generated.push({date, dk, topic, intervention:intervention.trim(), vs, isLast, lastBM:fmtDateDot(bmDate), poc});
        prevTopics.push(topic);
      }

      setNotes(generated);
      setGenStatus(`✅ ${total} note${total>1?"s":""} ready!`);
    } catch(err){ setError("Generation error: "+err.message); setGenStatus(""); }
    finally { setGenerating(false); }
  };

  // ── Build full HTML for a note (shared by download + automation bridge) ──────
  const noteToHTML = (note) => {
    const t = getTime(note.dk);
    const tIn  = t.inH  ? fmtTime(t.inH,  t.inM||0,  t.inAP)  : "";
    const tOut = t.outH ? fmtTime(t.outH, t.outM||0, t.outAP) : "";
    const html = buildNoteHTML({poc:note.poc, agencyName, snName, date:note.dk, timeIn:tIn, timeOut:tOut, vs:note.vs, topic:note.topic, intervention:note.intervention, lastBM:note.lastBM, isLastNote:note.isLast});
    const filename = `Note-${(note.poc?.patient?.name||"patient").replace(/[\s,]+/g,"-")}-${note.dk.replace(/\//g,"-")}.html`;
    return { filename, html };
  };

  // ── Download ───────────────────────────────────────────────────────────────
  const downloadNote = (note) => {
    const { filename, html } = noteToHTML(note);
    const blob = new Blob([html],{type:"text/html;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href=url;
    a.download=filename;
    a.style.display="none";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(url),3000);
  };

  const downloadAll = () => {
    if(notes.length===0)return;
    notes.forEach((n,i)=>{
      setTimeout(()=>downloadNote(n), i*700);
    });
  };

  // ── AUTOMATION BRIDGE ────────────────────────────────────────────────────────
  // Stable programmatic API used by the Puppeteer worker. Human UI is unchanged.
  useEffect(() => {
    window.__automation = {
      version: 1,
      ready: true,
      setAgency: (name) => setAgencyName(name),
      setNurse: (name) => setSnName(name),
      setDates: (dateStrs) => {
        const ds = (dateStrs||[]).map(s => {
          const [m,d,y] = String(s).split("/").map(Number);
          const dt = new Date(y, m-1, d); dt.setHours(12,0,0,0); return dt;
        }).filter(d=>!isNaN(d)).sort((a,b)=>a-b);
        setDates(ds);
      },
      setTimes: (map) => {
        setDateTimes(prev => {
          const next = { ...prev };
          for (const k of Object.keys(map||{})) next[k] = { ...(next[k]||{}), ...map[k] };
          return next;
        });
      },
      extract: () => { extract485(); },
      generate: () => { generateAll(); },
      getState: () => ({
        hasFile: !!file,
        extracting, generating,
        hasPoc: !!poc,
        agency: agencyName,
        nurse: snName,
        dates: dates.map(fmtDate),
        noteCount: notes.length,
        status: genStatus,
        error
      }),
      getNotesHTML: () => notes.map(noteToHTML)
    };
  }, [file, extracting, generating, poc, agencyName, snName, dates, dateTimes, notes, genStatus, error]);

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

          {/* Calendar */}
          <div style={{marginBottom:12,position:"relative",zIndex:30}}><CalendarPicker dates={dates} onChange={setDates}/></div>

          {/* Per-date time pickers - sorted once, stable keys prevent lag */}
          {dates.length>0&&<div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:4}}>
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
                <strong>{poc.patient?.name}</strong> · MR# {poc.patient?.mrNumber}<br/>
                <span style={{color:"#6b7280"}}>Diag: {(poc.diagnoses||[]).length} · Meds: {(poc.medications||[]).length} · Topics: {(poc.teachingTopics||[]).length}</span><br/>
                <span style={{fontSize:10,color:"#2b6cb0",fontWeight:600}}>Topics: {(poc.teachingTopics||[]).join(" → ")}</span>
              </div>
              {file&&<button onClick={()=>{setPoc(null);extract485();}} style={{marginTop:6,fontSize:10,color:"#2b6cb0",background:"#eff6ff",border:"1px solid #bfdbfe",borderRadius:5,padding:"2px 8px",cursor:"pointer",fontWeight:600}}>🔄 Re-extract</button>}
            </div>
          )}

          {error&&<div data-testid="error-box" style={{padding:"10px 14px",background:"#fef2f2",border:"1px solid #fecaca",borderRadius:8,color:"#b91c1c",fontSize:12,marginBottom:10}}>{error}</div>}

          {/* Generate button */}
          {poc&&dates.length>0&&(
            <button data-testid="generate-btn" onClick={generateAll} disabled={generating}
              style={{width:"100%",padding:13,background:generating?"#93c5fd":"#2b6cb0",color:"white",border:"none",borderRadius:10,fontSize:14,fontWeight:700,cursor:generating?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginBottom:notes.length?10:0,boxShadow:"0 4px 12px rgba(43,108,176,0.25)"}}>
              {generating?<><div style={{width:16,height:16,border:"2.5px solid rgba(255,255,255,0.3)",borderTopColor:"white",borderRadius:"50%",animation:"spin 0.7s linear infinite"}}/>{genStatus}</>:`✨ Generate ${dates.length} Clinical Note${dates.length>1?"s":""}`}
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
                  const t=getTime(note.dk);
                  const tIn=t.inH?fmtTime(t.inH,t.inM||0,t.inAP):"--:--";
                  const tOut=t.outH?fmtTime(t.outH,t.outM||0,t.outAP):"--:--";
                  return (
                    <div key={note.dk} style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:note.isLast?"#fef3c7":"#f0fdf4",border:`1px solid ${note.isLast?"#fcd34d":"#86efac"}`,borderRadius:8,padding:"8px 12px"}}>
                      <div>
                        <div style={{fontWeight:700,fontSize:12,color:note.isLast?"#92400e":"#166534"}}>{note.isLast?"🏁 ":"📝 "}{i+1}. {note.dk}</div>
                        <div style={{fontSize:10,color:"#6b7280"}}>⏰ {tIn}–{tOut} · {note.topic}</div>
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
