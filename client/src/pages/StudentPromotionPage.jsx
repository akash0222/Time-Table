import React, {useEffect, useState} from "react";
import axios from "axios";
import {API} from "../core/api";
import {RotateCcw, History, Search, ArrowRight} from "lucide-react";

export default function StudentPromotion({data,sessions,activeSession,reload,setMessage}){
  const [sessionId,setSessionId]=useState(activeSession?._id||"");
  const [sourceSessionId,setSourceSessionId]=useState("");
  const [fromSection,setFromSection]=useState("");
  const [toSection,setToSection]=useState("");
  const [students,setStudents]=useState([]);
  const [selected,setSelected]=useState([]);
  const [action,setAction]=useState("PROMOTED");
  const [remarks,setRemarks]=useState("");
  const [q,setQ]=useState("");
  const [saving,setSaving]=useState(false);
  const [previewing,setPreviewing]=useState(false);
  const [preview,setPreview]=useState(null);
  const [history,setHistory]=useState([]);

  useEffect(()=>{if(!sessionId&&activeSession?._id)setSessionId(activeSession._id)},[activeSession?._id]);
  useEffect(()=>{loadStudents();setPreview(null)},[fromSection]);
  useEffect(()=>{loadHistory();},[sessionId]);

  const sourceSections=(data.sections||[]).filter(s=>!sourceSessionId||String(s.academicSession?._id||s.academicSession||"")===String(sourceSessionId));
  const targetSections=(data.sections||[]).filter(s=>!sessionId||String(s.academicSession?._id||s.academicSession||"")===String(sessionId)).filter(s=>s._id!==fromSection);

  async function loadStudents(){
    try{
      const r=await axios.get(`${API}/students?active=true${fromSection?`&sectionId=${fromSection}`:""}`);
      setStudents(r.data||[]);setSelected([]);
    }catch(e){setMessage(e.response?.data?.message||e.message)}
  }
  async function loadHistory(){
    try{const r=await axios.get(`${API}/student-promotions/history${sessionId?`?sessionId=${sessionId}&limit=100`:"?limit=100"}`);setHistory(r.data||[])}catch(e){setMessage(e.response?.data?.message||e.message)}
  }
  const filtered=students.filter(s=>!sourceSessionId||String(s.section?.academicSession?._id||s.section?.academicSession||"")===String(sourceSessionId)).filter(s=>`${s.name} ${s.admissionNo} ${s.rollNo}`.toLowerCase().includes(q.toLowerCase()));
  const toggle=id=>{setSelected(a=>a.includes(id)?a.filter(x=>x!==id):[...a,id]);setPreview(null)};
  const selectAll=()=>{setSelected(selected.length===filtered.length?[]:filtered.map(s=>s._id));setPreview(null)};

  async function runPreview(){
    if(!sourceSessionId)return setMessage("Select the source academic session.");
    if(!sessionId)return setMessage("Select the target academic session.");
    if(!toSection)return setMessage("Select a target section.");
    if(!selected.length)return setMessage("Select at least one student.");
    setPreviewing(true);
    try{
      const r=await axios.post(`${API}/student-promotions/preview`,{studentIds:selected,toSection,academicSessionId:sessionId,sourceAcademicSessionId:sourceSessionId,action});
      setPreview(r.data);
      if(r.data?.issues?.length)setMessage(`Preview found ${r.data.issues.length} issue(s).`); else setMessage("Promotion preview is ready. Review it before applying.");
    }catch(e){setMessage(e.response?.data?.message||e.message)}finally{setPreviewing(false)}
  }

  async function submit(){
    if(!preview) return runPreview();
    if(preview.issues?.length)return setMessage("Resolve the preview issues before applying the movement.");
    if(!sessionId||!toSection||!selected.length)return setMessage("Complete the promotion selection first.");
    setSaving(true);
    try{
      const r=await axios.post(`${API}/student-promotions/bulk`,{studentIds:selected,toSection,academicSessionId:sessionId,sourceAcademicSessionId:sourceSessionId,action,remarks});
      setMessage(r.data?.message||"Student movement completed.");
      setSelected([]);setRemarks("");setPreview(null);await reload();await loadStudents();await loadHistory();
    }catch(e){setMessage(e.response?.data?.message||e.message)}finally{setSaving(false)}
  }

  async function rollback(id){
    if(!window.confirm("Rollback this student movement? The student will be restored to the previous section."))return;
    try{const r=await axios.post(`${API}/student-promotions/rollback/${id}`);setMessage(r.data?.message||"Movement rolled back.");await reload();await loadStudents();await loadHistory();}
    catch(e){setMessage(e.response?.data?.message||e.message)}
  }

  const target=targetSections.find(s=>String(s._id)===String(toSection));
  const source=sourceSections.find(s=>String(s._id)===String(fromSection));

  return <div className="promotion-page">
    <section className="promotion-hero">
      <div><span className="promotion-eyebrow">ACADEMIC OPERATIONS · PHASE 2</span><h2>Student Promotion & Section Transfer</h2></div>
      <div className="promotion-stat"><strong>{students.length}</strong><span>students in selected source</span></div>
    </section>

    <section className="promotion-flow">
      <div className="promotion-step"><span>1</span><div><small>Source Academic Session</small><select value={sourceSessionId} onChange={e=>{setSourceSessionId(e.target.value);setFromSection("");setSelected([]);setPreview(null)}}><option value="">Select source session</option>{(sessions||[]).map(s=><option key={s._id} value={s._id}>{s.name}</option>)}</select></div></div>
      <ArrowRight className="promotion-arrow" size={20}/>
      <div className="promotion-step"><span>2</span><div><small>Target Academic Session</small><select value={sessionId} onChange={e=>{setSessionId(e.target.value);setToSection("");setPreview(null)}}><option value="">Select target session</option>{(sessions||[]).map(s=><option key={s._id} value={s._id}>{s.name}{s.active?" · Active":""}</option>)}</select></div></div>
      <ArrowRight className="promotion-arrow" size={20}/>
      <div className="promotion-step"><span>3</span><div><small>From Section</small><select value={fromSection} onChange={e=>setFromSection(e.target.value)}><option value="">All Sections</option>{sourceSections.map(s=><option key={s._id} value={s._id}>{s.program} · {s.semester} · {s.name}</option>)}</select></div></div>
      <ArrowRight className="promotion-arrow" size={20}/>
      <div className="promotion-step target"><span>4</span><div><small>Move To Section</small><select value={toSection} onChange={e=>{setToSection(e.target.value);setPreview(null)}}><option value="">Select target section</option>{targetSections.map(s=><option key={s._id} value={s._id}>{s.program} · {s.semester} · {s.name}</option>)}</select></div></div>
    </section>

    <section className="promotion-panel">
      <div className="promotion-toolbar"><div><h3>Select Students</h3><p>{selected.length} selected · {filtered.length} available{source?` · ${source.program} · ${source.semester} · ${source.name}`:""}</p></div><div className="promotion-actions"><button className="secondary" onClick={selectAll}>{selected.length===filtered.length&&filtered.length?"Clear Selection":"Select All"}</button></div></div>
      <div className="promotion-search"><Search size={17}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search student name, admission no. or roll no..."/></div>
      <div className="student-card-grid">
        {filtered.map(s=><button type="button" key={s._id} className={`student-select-card ${selected.includes(s._id)?"selected":""}`} onClick={()=>toggle(s._id)}><span className="student-avatar">{(s.name||"S").slice(0,1).toUpperCase()}</span><span className="student-card-main"><b>{s.name}</b><small>{s.admissionNo} · Roll {s.rollNo}</small><em>{s.section?.program||""} · {s.section?.semester||""} · {s.section?.name||""}</em></span><span className="student-check">{selected.includes(s._id)?"✓":""}</span></button>)}
        {!filtered.length&&<div className="promotion-empty">No active students found for the selected source section.</div>}
      </div>
    </section>

    <section className="promotion-action-panel">
      <div className="promotion-action-fields"><label><span>Action</span><select value={action} onChange={e=>{setAction(e.target.value);setPreview(null)}}><option value="PROMOTED">Promote to next academic structure</option><option value="TRANSFERRED">Transfer section / program</option></select></label><label className="wide"><span>Remarks</span><input value={remarks} onChange={e=>setRemarks(e.target.value)} placeholder="Optional note for this movement..."/></label></div>
      <div style={{display:"flex",gap:10,flexWrap:"wrap",justifyContent:"flex-end"}}><button className="secondary" onClick={runPreview} disabled={previewing}>{previewing?"Checking...":"Preview Changes"}</button><button className="primary promotion-submit" onClick={submit} disabled={saving||!selected.length}>{saving?"Processing...":`${action==="PROMOTED"?"Promote":"Transfer"} ${selected.length||0} Student${selected.length===1?"":"s"}`}</button></div>
    </section>

    {preview&&<section className="promotion-panel" style={{border:preview.issues?.length?"1px solid #f59e0b":"1px solid #22c55e"}}><div className="promotion-toolbar"><div><h3>Promotion Preview</h3><p>{preview.summary?.valid||0} students checked · Target: {preview.target?.label||"—"}</p></div><span className={`status-badge ${preview.issues?.length?"":"approved"}`}>{preview.issues?.length?`${preview.issues.length} issue(s)`:"Ready to apply"}</span></div>{preview.issues?.length>0&&<div className="empty-state" style={{textAlign:"left",marginBottom:12}}><strong>Issues</strong><ul>{preview.issues.map((x,i)=><li key={i}>{x}</li>)}</ul></div>}{preview.warnings?.length>0&&<div className="empty-state" style={{textAlign:"left",marginBottom:12}}><strong>Warnings</strong><ul>{preview.warnings.slice(0,8).map((x,i)=><li key={i}>{x}</li>)}</ul></div>}<div className="cards" style={{marginTop:12}}>{[["Selected",preview.summary?.selected||0],["Target Capacity",preview.summary?.capacity||"Unlimited"],["Available",preview.summary?.available??"Unlimited"],["Target",target?.name||"—"]].map(([n,v])=><div className="card" key={n}><div><span>{n}</span><strong>{v}</strong></div></div>)}</div></section>}

    <section className="promotion-panel"><div className="promotion-toolbar"><div><h3>Movement History</h3><p>Completed movements are retained. Administrators can safely roll back a record only when the student's current section has not changed since that movement.</p></div><span className="status-badge approved">{history.length} records</span></div><div className="promotion-history-grid">{history.slice(0,20).map(h=><article className="promotion-history-card" key={h._id}><div className="history-avatar"><History size={16}/></div><div><b>{h.student?.name||"Student"}</b><small>{h.student?.admissionNo||""} · Roll {h.student?.rollNo||""}</small><p>{h.fromSection?.name||"—"} <ArrowRight size={14}/> {h.toSection?.name||"—"}</p><span>{h.action} · {h.academicSession?.name||""} · {h.status||"COMPLETED"}</span></div><time>{h.createdAt?new Date(h.createdAt).toLocaleDateString():""}</time>{h.status!=="ROLLED_BACK"&&<button className="secondary" onClick={()=>rollback(h._id)} title="Rollback movement"><RotateCcw size={15}/></button>}</article>)}{!history.length&&<div className="promotion-empty">No promotion or transfer history yet.</div>}</div></section>
  </div>
}
