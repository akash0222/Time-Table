import React, {useEffect, useState} from "react";
import axios from "axios";
import {API} from "../core/api";
import {Input, Select} from "../components/SharedComponents.jsx";
import {refId} from "../core/utils.js";

export default function AcademicStructure({sessions=[],activeSession,programs=[],data,reload,setMessage}){
  const [sessionId,setSessionId]=useState(activeSession?._id||"");
  const [structure,setStructure]=useState({programs:[],sections:[]});
  const [loading,setLoading]=useState(false);
  const [editing,setEditing]=useState(null);
  const [form,setForm]=useState(()=>({academicSession:activeSession?._id||sessionId||"",programId:"",semester:"",name:"",maxClassesPerDay:6,capacity:0}));
  // Keep the original default-to-active-session behavior, but don't let a
  // selected ID survive after that session disappears from the server.
  useEffect(()=>{
    if(activeSession?._id&&!sessionId)setSessionId(activeSession._id);
    if(activeSession?._id&&!form.academicSession&&!editing)setForm(current=>({...current,academicSession:activeSession._id}));
  },[activeSession?._id]);
  useEffect(()=>{
    const sessionRows=Array.isArray(sessions)?sessions:[];
    if(sessionId&&!sessionRows.some(item=>String(item._id)===String(sessionId))){
      const activeId=activeSession?._id&&sessionRows.some(item=>String(item._id)===String(activeSession._id))
        ?String(activeSession._id):"";
      setSessionId(activeId);
    }
  },[sessions,activeSession?._id]);
  async function loadStructure(){
    setLoading(true);
    try{const r=await axios.get(`${API}/academic-structure${sessionId?`?sessionId=${sessionId}`:""}`);setStructure(r.data||{programs:[],sections:[]});}
    catch(e){setMessage(e.response?.data?.message||e.message)}finally{setLoading(false)}
  }
  useEffect(()=>{loadStructure()},[sessionId,programs]);
  const session=sessions.find(x=>String(x._id)===String(sessionId));
  const activePrograms=(programs||[]).filter(p=>p.active!==false);
  function reset(){setEditing(null);setForm({academicSession:sessionId||activeSession?._id||"",programId:"",semester:"",name:"",maxClassesPerDay:6,capacity:0})}
  function editSection(s){setEditing(s._id);setForm({academicSession:refId(s.academicSession),programId:String(s.programId?._id||s.programId||""),semester:s.semester||"",name:s.name||"",maxClassesPerDay:s.maxClassesPerDay||6,capacity:s.capacity||0});window.scrollTo({top:0,behavior:"smooth"})}
  async function save(){
    if(!form.academicSession||!form.programId||!form.semester||!form.name.trim())return setMessage("Academic Session, Program, configured Semester and Section Name are required.");
    const dailyLimit=Number(form.maxClassesPerDay);
    const studentCapacity=Number(form.capacity);
    if(!Number.isInteger(dailyLimit)||dailyLimit<1)return setMessage("Max Classes / Day must be a whole number greater than zero.");
    if(!Number.isInteger(studentCapacity)||studentCapacity<0)return setMessage("Student Capacity must be zero (unlimited) or a positive whole number.");
    const masterSemester=(data.semesters||[]).some(s=>s.active!==false&&refId(s.academicSession)===String(form.academicSession)&&refId(s.program)===String(form.programId)&&String(s.name)===String(form.semester));
    const currentSection=(structure.sections||[]).find(s=>String(s._id)===String(editing));
    const keepingLegacySemester=Boolean(currentSection&&String(currentSection.semester||"")===String(form.semester||"")&&refId(currentSection.academicSession)===String(form.academicSession)&&refId(currentSection.programId)===String(form.programId));
    if(!masterSemester&&!keepingLegacySemester)return setMessage("Select a configured semester for this Program and Academic Session. Create it under Master Data Settings → Semesters first.");
    setLoading(true);
    try{
      const body={...form,maxClassesPerDay:Number(form.maxClassesPerDay||6),capacity:Number(form.capacity||0)};
      if(editing) await axios.put(`${API}/academic-structure/sections/${editing}`,body); else await axios.post(`${API}/academic-structure/sections`,body);
      setMessage(editing?"Section mapping updated successfully.":"Section mapped successfully.");reset();await loadStructure();await reload();
    }catch(e){setMessage(e.response?.data?.message||e.message)}finally{setLoading(false)}
  }
  async function remove(id){
    if(!confirm("Delete this section mapping? Active students must be moved first."))return;
    try{await axios.delete(`${API}/academic-structure/sections/${id}`);setMessage("Section mapping deleted.");await loadStructure();await reload();}catch(e){setMessage(e.response?.data?.message||e.message)}
  }
  const sections=structure.sections||[];
  const currentSectionForDisplay=sections.find(s=>String(s._id)===String(editing));
  const keepingLegacySemesterForDisplay=Boolean(currentSectionForDisplay&&String(currentSectionForDisplay.semester||"")===String(form.semester||"")&&refId(currentSectionForDisplay.academicSession)===String(form.academicSession)&&refId(currentSectionForDisplay.programId)===String(form.programId));
  return <div>
    <section className="panel">
      <div className="panel-head"><div><h3>Academic Structure</h3></div><span className="status-badge approved">{sections.length} Sections</span></div>
      <div className="form-grid">
        <Select label="Academic Session" value={form.academicSession} options={[["","Select Academic Session"],...sessions.map(s=>[s._id,s.name+(s.active?" · Active":"")])]} onChange={v=>setForm(f=>({...f,academicSession:v,programId:"",semester:""}))}/>
        <Select label="Program" value={form.programId} options={[["","Select Program"],...activePrograms.filter(p=>(sessions.find(s=>String(s._id)===String(form.academicSession))?.programDates||[]).some(d=>refId(d.program)===String(p._id))).map(p=>[p._id,p.name+(p.code?" · "+p.code:"")])]} onChange={v=>setForm(f=>({...f,programId:v,semester:""}))}/>
        <Select label="Semester" disabled={!form.academicSession||!form.programId} value={form.semester} options={[["",form.programId?"Select configured Semester":"Select Program first"],...(data.semesters||[]).filter(s=>s.active!==false&&refId(s.academicSession)===String(form.academicSession)&&refId(s.program)===String(form.programId)).map(s=>[s.name,s.name]),...((editing&&currentSectionForDisplay&&keepingLegacySemesterForDisplay&&!((data.semesters||[]).some(s=>refId(s.academicSession)===String(form.academicSession)&&refId(s.program)===String(form.programId)&&String(s.name)===String(form.semester))))?[[form.semester,form.semester+" (legacy — unchanged)"]]:[])]} onChange={v=>setForm(f=>({...f,semester:v}))}/>
        <Input label="Section Name" value={form.name} onChange={v=>setForm(f=>({...f,name:v}))} placeholder="e.g. A, B, CB (Gr A)"/>
        <Input label="Max Classes / Day" type="number" min={1} step={1} required value={form.maxClassesPerDay} onChange={v=>setForm(f=>({...f,maxClassesPerDay:v}))}/><Input label="Student Capacity (0 = unlimited)" type="number" min={0} step={1} required value={form.capacity} onChange={v=>setForm(f=>({...f,capacity:v}))}/>
        <div className="form-actions"><button className="primary" onClick={save} disabled={loading}>{loading?(editing?"Updating...":"Saving..."):(editing?"Update Section":"Add Section")}</button>{editing&&<button className="secondary" onClick={reset}>Cancel</button>}</div>
      </div>
      <div className="message success" style={{marginTop:14}}><strong>Mapping rule:</strong> Program and Section are stored by ID. Semester and Section Name are labels. Students are mapped to Section, so their Program/Semester follows the Section automatically.</div>
    </section>

    <section className="panel">
      <div className="panel-head"><div><h3>Program → Semester → Section</h3><p>{session?`Academic Session: ${session.name}`:"Showing all sections"}</p></div><Select label="Filter Sections by Session" value={sessionId} options={[["","All Sessions"],...sessions.map(s=>[s._id,s.name+(s.active?" · Active":"")])]} onChange={setSessionId}/></div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))',gap:14}}>
        {activePrograms.map(p=>{
          const rows=sections.filter(s=>String(s.programId?._id||s.programId||'')===String(p._id) || String(s.program||'').toLowerCase()===String(p.name||'').toLowerCase());
          const semesters=[...new Set(rows.map(s=>s.semester))];
          return <article key={p._id} style={{border:'1px solid #e2e8f0',borderRadius:14,padding:16,background:'#fff'}}><div style={{display:'flex',justifyContent:'space-between',gap:8}}><div><strong>{p.name}</strong><div className="muted">{p.code||'—'} · {rows.length} section(s)</div></div><span className="status-badge approved">{semesters.length} Sem</span></div>{semesters.map(sem=><div key={sem} style={{marginTop:12}}><b>Semester {sem}</b><div style={{display:'flex',gap:7,flexWrap:'wrap',marginTop:7}}>{rows.filter(s=>s.semester===sem).map(s=><span key={s._id} style={{display:'inline-flex',alignItems:'center',gap:6,padding:'7px 9px',borderRadius:9,background:'#f8fafc',border:'1px solid #e2e8f0'}}><span>{s.name}</span><small className="muted">{s.studentCount||0}/{s.capacity||"∞"} students</small><button className="secondary" style={{padding:'3px 7px'}} onClick={()=>editSection(s)}>Edit</button><button className="secondary" style={{padding:'3px 7px'}} onClick={()=>remove(s._id)}>×</button></span>)}</div></div>)}</article>
        })}
        {!activePrograms.length&&<div className="empty-state">Create an active Program first.</div>}
      </div>
    </section>
  </div>;
}
