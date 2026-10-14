import React, {useEffect, useState} from "react";
import axios from "axios";
import {API} from "../core/api";
import {Input} from "../components/SharedComponents.jsx";

export default function AcademicSessions({sessions,programs,activeSession,setSessions,setActiveSession,setMessage}){
  const activePrograms=(programs||[]).filter(p=>p.active!==false);
  const blankDates=()=>activePrograms.map(p=>({program:p._id,semester:"",startDate:"",endDate:""}));
  const [form,setForm]=useState({name:"",description:"",programDates:blankDates()});
  const [editingId,setEditingId]=useState(null);
  const [saving,setSaving]=useState(false);

  useEffect(()=>{
    if(editingId)return;
    setForm(f=>{
      const rows=Array.isArray(f.programDates)?[...f.programDates]:[];
      for(const p of activePrograms){
        if(!rows.some(row=>String(row.program?._id||row.program)===String(p._id))){
          rows.push({program:p._id,semester:"",startDate:"",endDate:""});
        }
      }
      return {...f,programDates:rows};
    });
  },[programs?.length,editingId]);

  function dateValue(v){return v?String(v).slice(0,10):""}
  function updateProgramDate(index,field,value){
    setForm(f=>({...f,programDates:(f.programDates||[]).map((x,i)=>i===index?{...x,[field]:value}:x)}));
  }
  function addSemesterCalendar(){
    setForm(f=>({...f,programDates:[...(f.programDates||[]),{
      program:activePrograms[0]?._id||"",semester:"Semester I",startDate:"",endDate:""
    }]}));
  }
  function removeCalendarRow(index){
    const rows=form.programDates||[];
    const row=rows[index];
    const sameProgramRows=rows.filter(x=>String(x.program?._id||x.program)===String(row?.program));
    if(sameProgramRows.length===1){
      setMessage("Keep at least one date range for each configured program.");
      return;
    }
    setForm(f=>({...f,programDates:(f.programDates||[]).filter((_,i)=>i!==index)}));
  }
  function validateProgramDates(){
    if(!activePrograms.length){setMessage("Add at least one active Program before creating an academic session.");return false;}
    const rows=form.programDates||[];
    const missingPrograms=activePrograms.filter(p=>!rows.some(d=>String(d.program?._id||d.program)===String(p._id)));
    if(missingPrograms.length){
      setMessage("Add at least one calendar date range for: "+missingPrograms.map(p=>p.name).join(", ")+".");
      return false;
    }
    const incomplete=rows.find(x=>!x.program||!x.startDate||!x.endDate);
    if(incomplete){
      setMessage("Each program/semester calendar row must have a Program, Start Date and End Date.");
      return false;
    }
    const combinations=new Set();
    for(const row of rows){
      const key=String(row.program?._id||row.program)+"|"+String(row.semester||"").trim().toLowerCase();
      if(combinations.has(key)){
        setMessage("A program can have only one date range for the same semester. Leave Semester blank for the program-wide default.");
        return false;
      }
      combinations.add(key);
      if(row.endDate<row.startDate){
        setMessage("A program/semester End Date cannot be before its Start Date.");
        return false;
      }
    }
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
    const existing=(s.programDates||[]).map(d=>({
      program:String(d.program?._id||d.program||""),
      semester:d.semester||"",
      startDate:dateValue(d.startDate??s.startDate),
      endDate:dateValue(d.endDate??s.endDate)
    }));
    const rows=existing.length?existing:activePrograms.map(p=>({
      program:p._id,semester:"",startDate:dateValue(s.startDate),endDate:dateValue(s.endDate)
    }));
    for(const p of activePrograms){
      if(!rows.some(row=>String(row.program)===String(p._id))){
        rows.push({program:p._id,semester:"",startDate:"",endDate:""});
      }
    }
    setForm({name:s.name||"",description:s.description||"",programDates:rows});
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
    <div className="panel-head"><div><h3>Academic Sessions</h3><p>Configure session dates for each program.</p></div>{activeSession&&<span className="status-badge approved">Active: {activeSession.name}</span>}</div>
    <div className="form-grid">
      <Input label="Academic Session Name" value={form.name} onChange={v=>setForm({...form,name:v})}/>
      <Input label="Description" value={form.description} onChange={v=>setForm({...form,description:v})}/>
    </div>
    <div className="message success" style={{marginTop:14}}><strong>Shared academic session, separate calendars:</strong> Keep one session such as 2026–27, then add date ranges for each Program and Semester. A Semester-specific range overrides the program-wide default for sections in that semester.</div>
    <div className="table-wrap" style={{marginTop:14}}><table><thead><tr><th>Program</th><th>Semester (optional)</th><th>Start Date</th><th>End Date</th><th>Action</th></tr></thead><tbody>
      {(form.programDates||[]).map((x,index)=>(
        <tr key={index}>
          <td><select value={String(x.program?._id||x.program||"")} onChange={e=>updateProgramDate(index,"program",e.target.value)}>
            <option value="">Select program</option>
            {activePrograms.map(p=><option value={p._id} key={p._id}>{p.name}{p.code?" ("+p.code+")":""}</option>)}
          </select></td>
          <td><input type="text" value={x.semester||""} placeholder="Blank = program default" onChange={e=>updateProgramDate(index,"semester",e.target.value)}/></td>
          <td><input type="date" value={x.startDate||""} onChange={e=>updateProgramDate(index,"startDate",e.target.value)}/></td>
          <td><input type="date" value={x.endDate||""} onChange={e=>updateProgramDate(index,"endDate",e.target.value)}/></td>
          <td><button type="button" className="secondary" onClick={()=>removeCalendarRow(index)} disabled={(form.programDates||[]).filter(row=>String(row.program?._id||row.program)===String(x.program?._id||x.program)).length<=1}>Remove</button></td>
        </tr>
      ))}
      {!activePrograms.length&&<tr><td colSpan="5">No active programs found. Add Programs first.</td></tr>}
    </tbody></table></div>
    <div className="form-actions" style={{marginTop:10}}><button type="button" className="secondary" onClick={addSemesterCalendar} disabled={!activePrograms.length}>+ Add Semester Calendar</button></div>
    <div className="form-actions" style={{marginTop:14}}><button className="primary add" onClick={saveSession} disabled={saving}>{saving?(editingId?"Updating...":"Creating..."):(editingId?"Update Academic Session":"+ Add Academic Session")}</button>{editingId&&<button className="secondary" onClick={reset}>Cancel Edit</button>}</div>
    <div className="table-wrap" style={{marginTop:24}}><table><thead><tr><th>Session</th><th>Program Calendars</th><th>Overall Range</th><th>Status</th><th>Actions</th></tr></thead>
    <tbody>{sessions.map(s=><tr key={s._id}><td><strong>{s.name}</strong><div className="muted">{s.description||""}</div></td><td>{(s.programDates||[]).length} program(s) configured</td><td>{s.startDate?dateValue(s.startDate):"—"} → {s.endDate?dateValue(s.endDate):"—"}</td><td>{s.active?<span className="status-badge approved">ACTIVE</span>:"Inactive"}</td><td style={{display:"flex",gap:8,flexWrap:"wrap"}}><button className="secondary" onClick={()=>editSession(s)}>Edit Dates</button>{!s.active&&<button className="secondary" onClick={()=>activate(s._id)}>Set Active</button>}</td></tr>)}</tbody></table></div>
  </div>
}
