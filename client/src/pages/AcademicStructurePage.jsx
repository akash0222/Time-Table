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
    if(!Number.isInteger(dailyLimit)||dailyLimit<1||dailyLimit>12)return setMessage("Max Classes / Day must be a whole number between 1 and 12.");
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
  const formSession=sessions.find(s=>String(s._id)===String(form.academicSession));
  const formPrograms=activePrograms.filter(p=>(formSession?.programDates||[]).some(d=>refId(d.program)===String(p._id)));
  const formSemesters=(data.semesters||[]).filter(s=>s.active!==false&&refId(s.academicSession)===String(form.academicSession)&&refId(s.program)===String(form.programId));
  return <div>
    <section className="panel">
      <div className="panel-head"><div><h3>Academic Structure</h3></div><span className="status-badge approved">{sections.length} Sections</span></div>
      <div className="form-grid">
        <Select label="Academic Session" value={form.academicSession} options={[["","Select Academic Session"],...sessions.map(s=>[s._id,s.name+(s.active?" · Active":"")])]} onChange={v=>setForm(f=>({...f,academicSession:v,programId:"",semester:""}))}/>
        <Select label="Program" value={form.programId} options={[["","Select Program"],...formPrograms.map(p=>[p._id,p.name+(p.code?" · "+p.code:"")])]} onChange={v=>setForm(f=>({...f,programId:v,semester:""}))}/>
        <Select label="Semester" disabled={!form.academicSession||!form.programId} value={form.semester} options={[["",form.programId?"Select configured Semester":"Select Program first"],...formSemesters.map(s=>[s.name,s.name]),...((editing&&currentSectionForDisplay&&keepingLegacySemesterForDisplay&&!formSemesters.some(s=>String(s.name)===String(form.semester)))?[[form.semester,form.semester+" (legacy — unchanged)"]]:[])]} onChange={v=>setForm(f=>({...f,semester:v}))}/>
        <Input label="Section Name" value={form.name} onChange={v=>setForm(f=>({...f,name:v}))} placeholder="e.g. A, B, CB (Gr A)"/>
        <Input label="Max Classes / Day" type="number" min={1} max={12} step={1} required value={form.maxClassesPerDay} onChange={v=>setForm(f=>({...f,maxClassesPerDay:v}))}/><Input label="Student Capacity (0 = unlimited)" type="number" min={0} step={1} required value={form.capacity} onChange={v=>setForm(f=>({...f,capacity:v}))}/>
        <div className="form-actions"><button className="primary" onClick={save} disabled={loading}>{loading?(editing?"Updating...":"Saving..."):(editing?"Update Section":"Add Section")}</button>{editing&&<button className="secondary" onClick={reset}>Cancel</button>}</div>
      </div>
      {form.academicSession&&!formPrograms.length&&<div className="message" role="status" style={{marginTop:14}}>No active Programs are linked to this Academic Session. Link a Program under Academic Sessions first.</div>}
      {form.academicSession&&form.programId&&!formSemesters.length&&!keepingLegacySemesterForDisplay&&<div className="message" role="status" style={{marginTop:14}}>No active Semester is configured for this Program and Academic Session. Add it under Master Data Settings → Semesters before mapping a Section.</div>}
    </section>

    <section className="panel">
      <div className="panel-head"><div><h3>Program → Semester → Section</h3><p>{session?`Academic Session: ${session.name}`:"Showing all sections"}</p></div><Select label="Filter Sections by Session" value={sessionId} options={[["","All Sessions"],...sessions.map(s=>[s._id,s.name+(s.active?" · Active":"")])]} onChange={setSessionId}/></div>
      <div className="academic-structure-table-wrap">
        <table className="academic-structure-table">
          <thead><tr><th>Program</th><th>Semester</th><th>Section</th><th>Students</th><th>Capacity</th><th>Actions</th></tr></thead>
          <tbody>
            {activePrograms.flatMap(p=>{
              const rows=sections.filter(s=>String(s.programId?._id||s.programId||'')===String(p._id) || String(s.program||'').toLowerCase()===String(p.name||'').toLowerCase());
              return rows.map(s=><tr key={s._id}>
                <td><strong>{p.name}</strong><small className="academic-structure-muted">{p.code||"—"}</small></td>
                <td>{s.semester||"—"}</td><td><strong>{s.name}</strong></td>
                <td>{s.studentCount||0}</td><td>{s.capacity||"Unlimited"}</td>
                <td><div className="academic-structure-actions"><button className="secondary" onClick={()=>editSection(s)}>Edit</button><button className="secondary" onClick={()=>remove(s._id)} aria-label={`Delete section ${s.name}`}>Delete</button></div></td>
              </tr>);
            })}
            {!activePrograms.some(p=>sections.some(s=>String(s.programId?._id||s.programId||'')===String(p._id) || String(s.program||'').toLowerCase()===String(p.name||'').toLowerCase()))&&<tr><td colSpan={6} className="academic-structure-empty">No sections configured for the selected session.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  </div>;
}
