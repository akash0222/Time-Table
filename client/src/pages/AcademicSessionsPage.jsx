import React, {useEffect, useState} from "react";
import axios from "axios";
import {API} from "../core/api";
import {Input} from "../components/SharedComponents.jsx";

export default function AcademicSessions({sessions,programs,activeSession,setSessions,setActiveSession,setMessage}){
  const activePrograms=(programs||[]).filter(p=>p.active!==false);
  const blankDates=()=>activePrograms.map(p=>({program:p._id,startDate:"",endDate:""}));
  const [form,setForm]=useState({name:"",description:"",programDates:blankDates()});
  const [editingId,setEditingId]=useState(null);
  const [saving,setSaving]=useState(false);

  useEffect(()=>{
    if(!editingId)setForm(f=>({...f,programDates:activePrograms.map(p=>{
      const old=(f.programDates||[]).find(x=>String(x.program)===String(p._id));
      return old||{program:p._id,startDate:"",endDate:""};
    })}));
  },[programs?.length,editingId]);

  function dateValue(v){return v?String(v).slice(0,10):""}
  function updateProgramDate(program,field,value){
    setForm(f=>({...f,programDates:(f.programDates||[]).map(x=>String(x.program)===String(program)?{...x,[field]:value}:x)}));
  }
  function validateProgramDates(){
    if(!activePrograms.length){setMessage("Add at least one active Program before creating an academic session.");return false;}
    const missing=activePrograms.filter(p=>{
      const x=(form.programDates||[]).find(d=>String(d.program)===String(p._id));
      return !x?.startDate||!x?.endDate;
    });
    if(missing.length){setMessage(`Set Start Date and End Date for: ${missing.map(p=>p.name).join(", ")}.`);return false;}
    const invalid=(form.programDates||[]).filter(x=>x.startDate&&x.endDate&&x.endDate<x.startDate);
    if(invalid.length){setMessage("A program End Date cannot be before its Start Date.");return false;}
    return true;
  }
  async function saveSession(){
    if(!form.name.trim())return setMessage("Session name is required.");
    if(!validateProgramDates())return;
    const dates=form.programDates.filter(x=>x.startDate&&x.endDate);
    const start=dates.map(x=>x.startDate).sort()[0];
    const end=dates.map(x=>x.endDate).sort().slice(-1)[0];
    const body={name:form.name.trim(),description:form.description||"",programDates:dates,startDate:start,endDate:end};
    setSaving(true);
    try{
      if(editingId) await axios.put(`${API}/sessions/${editingId}`,body);
      else await axios.post(`${API}/sessions`,body);
      const r=await axios.get(`${API}/sessions`);setSessions(r.data||[]);
      setMessage(editingId?"Program-wise session dates updated.":"Academic session created with program-wise dates.");
      setForm({name:"",description:"",programDates:blankDates()});setEditingId(null);
    }catch(e){setMessage(e.response?.data?.message||e.message)}finally{setSaving(false)}
  }
  function editSession(s){
    setEditingId(s._id);
    setForm({
      name:s.name||"",description:s.description||"",
      programDates:activePrograms.map(p=>{
        const x=(s.programDates||[]).find(d=>String(d.program?._id||d.program)===String(p._id));
        // Backward compatibility: older sessions stored one global start/end date.
        // When editing such a session, use those dates for each active program so
        // the administrator can save it into the new programDates structure.
        return {
          program:p._id,
          startDate:dateValue(x?.startDate ?? s.startDate),
          endDate:dateValue(x?.endDate ?? s.endDate)
        };
      })
    });
    window.scrollTo({top:0,behavior:"smooth"});
  }
  function reset(){setEditingId(null);setForm({name:"",description:"",programDates:blankDates()})}
  async function activate(id){
    try{
      const r=await axios.post(`${API}/sessions/${id}/activate`);setActiveSession(r.data);
      const all=await axios.get(`${API}/sessions`);setSessions(all.data||[]);setMessage(`Active session: ${r.data.name}`);
    }catch(e){setMessage(e.response?.data?.message||e.message)}
  }
  return <div className="panel">
    <div className="panel-head"><div><h3>Academic Sessions</h3><p>Session dates are configured independently for each Program. The overall session range is calculated from the earliest program start to the latest program end.</p></div>{activeSession&&<span className="status-badge approved">Active: {activeSession.name}</span>}</div>
    <div className="form-grid">
      <Input label="Academic Session Name" value={form.name} onChange={v=>setForm({...form,name:v})}/>
      <Input label="Description" value={form.description} onChange={v=>setForm({...form,description:v})}/>
    </div>
    <div className="message success" style={{marginTop:14}}><strong>Program-wise academic calendar:</strong> Each program can start and end on different dates. Full-session generation will use the date window of the program assigned to each section/subject.</div>
    <div className="table-wrap" style={{marginTop:14}}><table><thead><tr><th>Program</th><th>Code</th><th>Session Start</th><th>Session End</th></tr></thead><tbody>
      {activePrograms.map(p=>{const x=(form.programDates||[]).find(d=>String(d.program)===String(p._id))||{};return <tr key={p._id}><td><strong>{p.name}</strong></td><td>{p.code||"—"}</td><td><input type="date" value={x.startDate||""} onChange={e=>updateProgramDate(p._id,"startDate",e.target.value)}/></td><td><input type="date" value={x.endDate||""} onChange={e=>updateProgramDate(p._id,"endDate",e.target.value)}/></td></tr>})}
      {!activePrograms.length&&<tr><td colSpan="4">No active programs found. Add Programs first.</td></tr>}
    </tbody></table></div>
    <div className="form-actions" style={{marginTop:14}}><button className="primary add" onClick={saveSession} disabled={saving}>{saving?(editingId?"Updating...":"Creating..."):(editingId?"Update Academic Session":"+ Add Academic Session")}</button>{editingId&&<button className="secondary" onClick={reset}>Cancel Edit</button>}</div>
    <div className="table-wrap" style={{marginTop:24}}><table><thead><tr><th>Session</th><th>Program Calendars</th><th>Overall Range</th><th>Status</th><th>Actions</th></tr></thead>
    <tbody>{sessions.map(s=><tr key={s._id}><td><strong>{s.name}</strong><div className="muted">{s.description||""}</div></td><td>{(s.programDates||[]).length} program(s) configured</td><td>{s.startDate?dateValue(s.startDate):"—"} → {s.endDate?dateValue(s.endDate):"—"}</td><td>{s.active?<span className="status-badge approved">ACTIVE</span>:"Inactive"}</td><td style={{display:"flex",gap:8,flexWrap:"wrap"}}><button className="secondary" onClick={()=>editSession(s)}>Edit Dates</button>{!s.active&&<button className="secondary" onClick={()=>activate(s._id)}>Set Active</button>}</td></tr>)}</tbody></table></div>
  </div>
}
