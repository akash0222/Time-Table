import React, {useEffect, useState} from "react";
import axios from "axios";
import {API} from "../core/api";
import {Input} from "../components/SharedComponents.jsx";

export default function AcademicSessions({sessions,programs,semesters=[],activeSession,setSessions,setActiveSession,setMessage}){
  const activePrograms=(programs||[]).filter(p=>p.active!==false);
  const defaultStartYear=new Date().getFullYear();
  const sessionNameForYear=year=>/^\d{4}$/.test(String(year))?String(Number(year))+"-"+String(Number(year)+1):"";
  const dateRangeForYear=year=>({startDate:String(year)+"-04-01",endDate:String(Number(year)+1)+"-03-31"});
  const blankForm=(year=defaultStartYear)=>{
    const range=dateRangeForYear(year);
    return {startYear:String(year),name:sessionNameForYear(year),description:"",sessionStartDate:range.startDate,sessionEndDate:range.endDate,programDates:activePrograms.map(p=>({program:p._id,semester:"",...range}))};
  };
  const [form,setForm]=useState(()=>blankForm());
  const [editingId,setEditingId]=useState(null);
  const [saving,setSaving]=useState(false);

  useEffect(()=>{
    if(editingId)return;
    setForm(f=>{
      const rows=Array.isArray(f.programDates)?[...f.programDates]:[];
      for(const p of activePrograms){
        if(!rows.some(row=>String(row.program?._id||row.program)===String(p._id))){
          rows.push({program:p._id,semester:"",startDate:f.sessionStartDate||"",endDate:f.sessionEndDate||""});
        }
      }
      return {...f,programDates:rows};
    });
  },[programs,editingId]);

  function dateValue(v){return v?String(v).slice(0,10):""}
  function changeStartYear(value){
    const year=String(value||"").replace(/[^0-9]/g,"").slice(0,4);
    if(!year){setForm(f=>({...f,startYear:"",name:""}));return;}
    const range=dateRangeForYear(year);
    setForm(f=>({
      ...f,
      startYear:year,
      name:sessionNameForYear(year),
      sessionStartDate:range.startDate,
      sessionEndDate:range.endDate,
      // Only move calendars that still follow the previous overall dates.
      // Preserve program/semester-specific overrides already entered by the user.
      programDates:(f.programDates||[]).map(row=>({
        ...row,
        startDate:row.startDate===f.sessionStartDate?range.startDate:row.startDate,
        endDate:row.endDate===f.sessionEndDate?range.endDate:row.endDate
      }))
    }));
  }
  function updateGlobalDate(field,value){
    setForm(f=>{
      const previous=f[field];
      const rowField=field==="sessionStartDate"?"startDate":"endDate";
      return {...f,[field]:value,programDates:(f.programDates||[]).map(row=>row[rowField]===previous?{...row,[rowField]:value}:row)};
    });
  }
  function updateProgramDate(index,field,value){
    setForm(f=>({...f,programDates:(f.programDates||[]).map((x,i)=>i===index?{...x,[field]:value}:x)}));
  }
  function addSemesterCalendar(){
    setForm(f=>({...f,programDates:[...(f.programDates||[]),{
      program:activePrograms[0]?._id||"",semester:"",startDate:f.sessionStartDate||"",endDate:f.sessionEndDate||""
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
      if(row.startDate<form.sessionStartDate || row.endDate>form.sessionEndDate){
        setMessage("Overall session dates must include every program/semester calendar date range. Expand the overall dates or adjust this calendar row.");
        return false;
      }
    }
    return true;
  }
  async function saveSession(){
    if(!/^\d{4}$/.test(String(form.startYear||""))||Number(form.startYear)<1900||Number(form.startYear)>9998)return setMessage("Enter a valid four-digit Session Start Year.");
    if(form.name!==sessionNameForYear(form.startYear))return setMessage("Academic Session name must match the selected start year.");
    if(!form.sessionStartDate||!form.sessionEndDate||form.sessionEndDate<form.sessionStartDate)return setMessage("Overall session End Date must be on or after the Start Date.");
    if(!validateProgramDates())return;
    const dates=form.programDates.filter(x=>x.startDate&&x.endDate);
    const body={
      name:sessionNameForYear(form.startYear),
      description:form.description||"",
      programDates:dates,
      startDate:form.sessionStartDate,
      endDate:form.sessionEndDate
    };
    setSaving(true);
    try{
      if(editingId) await axios.put(`${API}/sessions/${editingId}`,body);
      else await axios.post(`${API}/sessions`,body);
      const r=await axios.get(`${API}/sessions`);setSessions(r.data||[]);
      setMessage(editingId?"Program-wise session dates updated.":"Academic session created with program-wise dates.");
      setForm(blankForm());setEditingId(null);
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
    const parsedYear=String(s.name||"").match(/^(\d{4})/);
    const startYear=parsedYear?parsedYear[1]:String(new Date(s.startDate||Date.now()).getFullYear());
    setForm({startYear,name:sessionNameForYear(startYear),description:s.description||"",sessionStartDate:dateValue(s.startDate)||dateRangeForYear(startYear).startDate,sessionEndDate:dateValue(s.endDate)||dateRangeForYear(startYear).endDate,programDates:rows});
    window.scrollTo({top:0,behavior:"smooth"});
  }
  function reset(){setEditingId(null);setForm(blankForm())}
  async function activate(id){
    try{
      const r=await axios.post(`${API}/sessions/${id}/activate`);setActiveSession(r.data);
      const all=await axios.get(`${API}/sessions`);setSessions(all.data||[]);setMessage(`Active session: ${r.data.name}`);
    }catch(e){setMessage(e.response?.data?.message||e.message)}
  }
  return <div className="panel">
    <div className="panel-head"><div><h3>Create Academic Session</h3><p>Set the session year and overall dates, then configure program/semester calendar overrides.</p></div>{activeSession&&<span className="status-badge approved">Active: {activeSession.name}</span>}</div>
    <div className="form-grid academic-session-form-grid">
      <div className="field"><label htmlFor="session-start-year">Session Start Year</label><input id="session-start-year" type="number" min="1900" max="9998" step="1" inputMode="numeric" value={form.startYear||""} onChange={e=>changeStartYear(e.target.value)} placeholder="e.g. 2026"/></div>
      <div className="field"><label htmlFor="session-generated-name">Academic Session</label><input id="session-generated-name" value={form.name||""} readOnly disabled placeholder="Generated from start year"/></div>
      <div className="field"><label htmlFor="session-start-date">Overall Start Date</label><input id="session-start-date" type="date" value={form.sessionStartDate||""} onChange={e=>updateGlobalDate("sessionStartDate",e.target.value)}/></div>
      <div className="field"><label htmlFor="session-end-date">Overall End Date</label><input id="session-end-date" type="date" value={form.sessionEndDate||""} min={form.sessionStartDate||undefined} onChange={e=>updateGlobalDate("sessionEndDate",e.target.value)}/></div>
      <Input label="Description (optional)" value={form.description} onChange={v=>setForm({...form,description:v})}/>
    </div>
    <div className="message success" style={{marginTop:14}}><strong>Automatic session naming:</strong> Entering 2026 generates 2026-2027. Overall dates default to 1 April through 31 March; adjust them as needed. Each Program and Semester calendar below can still use its own start and end dates, independent of the shared session.</div>
    <div className="table-wrap" style={{marginTop:14}}><table><thead><tr><th>Program</th><th>Semester (optional)</th><th>Start Date</th><th>End Date</th><th>Action</th></tr></thead><tbody>
      {(form.programDates||[]).map((x,index)=>(
        <tr key={index}>
          <td><select value={String(x.program?._id||x.program||"")} onChange={e=>updateProgramDate(index,"program",e.target.value)}>
            <option value="">Select program</option>
            {activePrograms.map(p=><option value={p._id} key={p._id}>{p.name}{p.code?" ("+p.code+")":""}</option>)}
          </select></td>
          <td><select value={x.semester||""} onChange={e=>updateProgramDate(index,"semester",e.target.value)} disabled={!editingId}><option value="">Program-wide default</option>{semesters.filter(s=>String(s.academicSession?._id||s.academicSession)===String(editingId)&&String(s.program?._id||s.program)===String(x.program?._id||x.program)&&s.active!==false).map(s=><option key={s._id} value={s.name}>{s.name}</option>)}</select>{!editingId&&<small className="muted">Create session first, then add semester calendars.</small>}</td>
          <td><input type="date" value={x.startDate||""} onChange={e=>updateProgramDate(index,"startDate",e.target.value)}/></td>
          <td><input type="date" value={x.endDate||""} onChange={e=>updateProgramDate(index,"endDate",e.target.value)}/></td>
          <td><button type="button" className="secondary" onClick={()=>removeCalendarRow(index)} disabled={(form.programDates||[]).filter(row=>String(row.program?._id||row.program)===String(x.program?._id||x.program)).length<=1}>Remove</button></td>
        </tr>
      ))}
      {!activePrograms.length&&<tr><td colSpan="5">No active programs found. Add Programs first.</td></tr>}
    </tbody></table></div>
    <div className="form-actions" style={{marginTop:10}}>
      <button type="button" className="secondary" onClick={addSemesterCalendar} disabled={!activePrograms.length||!editingId}>+ Add Semester Calendar</button>
      {!editingId&&activePrograms.length>0&&<small className="muted">Create the session first, then use Edit Dates to add semester-specific calendars.</small>}
    </div>
    <div className="form-actions" style={{marginTop:14}}><button className="primary add" onClick={saveSession} disabled={saving}>{saving?(editingId?"Updating...":"Creating..."):(editingId?"Update Academic Session":"+ Add Academic Session")}</button>{editingId&&<button className="secondary" onClick={reset}>Cancel Edit</button>}</div>
    <div className="table-wrap" style={{marginTop:24}}><table><thead><tr><th>Session</th><th>Program Calendars</th><th>Overall Range</th><th>Status</th><th>Actions</th></tr></thead>
    <tbody>{sessions.map(s=><tr key={s._id}><td><strong>{s.name}</strong><div className="muted">{s.description||""}</div></td><td>{(s.programDates||[]).length} program(s) configured</td><td>{s.startDate?dateValue(s.startDate):"—"} → {s.endDate?dateValue(s.endDate):"—"}</td><td>{s.active?<span className="status-badge approved">ACTIVE</span>:"Inactive"}</td><td style={{display:"flex",gap:8,flexWrap:"wrap"}}><button className="secondary" onClick={()=>editSession(s)}>Edit Dates</button>{!s.active&&<button className="secondary" onClick={()=>activate(s._id)}>Set Active</button>}</td></tr>)}</tbody></table></div>
  </div>
}
