import React, {useEffect, useState} from "react";
import axios from "axios";
import {API} from "../core/api";
import {Metric} from "../components/SharedComponents.jsx";
import {X, RotateCcw, Activity} from "lucide-react";

export default function GenerationReadiness({activeSession,onNavigate}){
  const [report,setReport]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState("");
  async function load(){
    if(!activeSession?._id){setReport(null);setLoading(false);return;}
    setLoading(true);setError("");
    try{setReport((await axios.get(`${API}/timetable/readiness?sessionId=${encodeURIComponent(activeSession._id)}`)).data)}catch(e){setError(e.response?.data?.message||e.message);setReport(null)}finally{setLoading(false)}
  }
  useEffect(()=>{load()},[activeSession?._id]);

  function destinationFor(category){
    const value=String(category||"").toLowerCase();
    if(/section coverage|subject mapping|weekly load|duration/.test(value))return "Subject & Faculty Mapping";
    if(/section/.test(value))return "Program & Section Mapping";
    if(/faculty availability|faculty workload/.test(value))return "Availability";
    if(/holiday|calendar/.test(value))return "Holiday Management";
    if(/faculty|room|time slot|room capacity/.test(value))return "Master Data Settings";
    return "Generation Readiness";
  }

  function openFix(category){
    const destination=destinationFor(category);
    if(onNavigate)onNavigate(destination);
    else document.querySelector('[data-nav="'+destination+'"]')?.click();
  }
  if(loading)return <div className="panel"><h3>Generation Readiness</h3><p>Checking academic mappings, workload and available resources...</p></div>;
  if(!activeSession)return <div className="panel"><h3>Generation Readiness</h3><div className="empty-state"><h3>No active academic session</h3><p>Set an active Academic Session before running the pre-generation checks.</p></div></div>;
  if(error)return <div className="panel"><h3>Generation Readiness</h3><div className="message error">{error}</div><button className="primary" onClick={load}>Retry</button></div>;
  const r=report?.summary||{}; const items=report?.issues||[];
  return <div>
    <div className="analytics-toolbar"><div><h2>Generation Readiness</h2><p>Pre-generation check for <b>{report?.session?.name||activeSession.name}</b>. Fix errors before generating the timetable.</p></div><button className="secondary" onClick={load}><RotateCcw size={15}/> Re-check</button></div>
    <div className="cards analytics-cards"><Metric label="Status" value={report?.status||"—"}/><Metric label="Required Sessions" value={r.requiredSessions||0}/><Metric label="Subject Mappings" value={r.subjects||0}/><Metric label="Sections" value={r.sections||0}/><Metric label="Errors" value={r.errors||0}/><Metric label="Warnings" value={r.warnings||0}/></div>
    <section className="panel"><div className="panel-head"><div><h3>Resource Summary</h3></div></div><div className="generation-quality-grid"><div><span>Faculty</span><strong>{r.faculty||0}</strong></div><div><span>Rooms</span><strong>{r.rooms||0}</strong></div><div><span>Usable Slots</span><strong>{r.usableSlots||0}</strong></div><div><span>Working Days</span><strong>{r.workingDays||0}</strong></div><div><span>Invalid Mappings</span><strong>{r.invalidSubjects||0}</strong></div><div><span>Coverage</span><strong>{r.sections?`${Math.max(0,r.sections-(items.filter(x=>x.category==="Section Coverage").length))}/${r.sections}`:"—"}</strong></div></div></section>
    <section className="panel"><div className="panel-head"><div><h3>{items.length?`${items.length} readiness finding${items.length===1?"":"s"}`:"Ready to generate"}</h3><p>{items.length?"Resolve the errors and review warnings before generating.":"The academic mappings and configured resources pass the pre-generation checks."}</p></div></div>
      {items.length?<div className="validation-list">{items.map((x,i)=><div className={`validation-item ${(x.severity||"WARNING").toLowerCase()}`} key={`${x.category}-${i}`}><div className="validation-icon">{x.severity==="ERROR"?<X size={16}/>:<Activity size={16}/>}</div><div className="readiness-issue-copy"><strong>{x.category}</strong><p>{x.message}</p></div><button type="button" className="readiness-fix-button" onClick={()=>openFix(x.category)}>Fix issue <span aria-hidden="true">→</span></button></div>)}</div>:<div className="empty-state"><h3>✓ Generation checks passed</h3><p>You can proceed to Generate Timetable for the active academic session.</p></div>}
    </section>
  </div>;
}
