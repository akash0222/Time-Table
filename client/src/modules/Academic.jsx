import React, {useEffect, useMemo, useState} from "react";
import axios from "axios";
import {CalendarDays, Users, BookOpen, DoorOpen, Clock3, WandSparkles, Database, Trash2, Settings2, Check, X, FileSpreadsheet, Upload, Lock, Send, RotateCcw, ShieldCheck, BarChart3, Activity, Bell, UserCheck, RefreshCw, Copy, QrCode, History, ClipboardCheck, UserPlus, DollarSign, GraduationCap, Search, ArrowRight, UsersRound} from "lucide-react";
import {API, days, apiName, refId} from "../core/api";
import {Input, Select} from "../components/FormControls";
import {Metric, Progress} from "../components/Metrics";
import {localToday, authRole} from "../core/helpers";

export function AcademicSessions({sessions,programs,activeSession,setSessions,setActiveSession,setMessage}){
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
        return {program:p._id,startDate:dateValue(x?.startDate),endDate:dateValue(x?.endDate)};
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


export function TimetableTemplates({sessions,activeSession,setLatest,setMessage}){
  const [sourceSessionId,setSourceSessionId]=useState("");
  const [sourceVersions,setSourceVersions]=useState([]);
  const [sourceId,setSourceId]=useState("");
  const [targetSessionId,setTargetSessionId]=useState("");
  const [label,setLabel]=useState("");
  const [notes,setNotes]=useState("");
  const [loading,setLoading]=useState(false);

  const targetSessions=(sessions||[]).filter(s=>String(s._id)!==String(sourceSessionId));
  async function loadVersions(sessionId){
    setSourceSessionId(sessionId);setSourceId("");setSourceVersions([]);
    if(!sessionId)return;
    try{const r=await axios.get(`${API}/timetable/versions?sessionId=${sessionId}`);const rows=r.data||[];setSourceVersions(rows);const current=rows.find(x=>x.isCurrent)||rows[0];if(current)setSourceId(current._id);}
    catch(e){setMessage(e.response?.data?.message||e.message)}
  }
  async function clone(){
    if(!sourceId||!targetSessionId)return setMessage("Select a source timetable version and target academic session.");
    if(String(sourceSessionId)===String(targetSessionId))return setMessage("Source and target academic sessions must be different.");
    if(!confirm("Clone this timetable as a new Draft in the target academic session?"))return;
    setLoading(true);setMessage("");
    try{const r=await axios.post(`${API}/timetable/clone`,{sourceTimetableId:sourceId,targetSessionId:targetSessionId,versionLabel:label,notes});setLatest(r.data);setMessage(`Timetable cloned successfully as ${r.data.versionLabel||`Version ${r.data.version}`} in ${r.data.academicSession?.name||"the target session"}.`);setLabel("");setNotes("");}
    catch(e){setMessage(e.response?.data?.message||e.message)}finally{setLoading(false)}
  }
  return <div>
    <div className="analytics-toolbar"><div><h2>Timetable Templates & Clone</h2><p>Use a previous timetable version as the starting point for a new academic session.</p></div></div>
    <section className="panel template-clone-panel">
      <div className="template-flow"><div className="template-step"><span>1</span><div><strong>Source Academic Session</strong><small>Select the session containing the timetable you want to reuse.</small></div><select value={sourceSessionId} onChange={e=>loadVersions(e.target.value)}><option value="">Select source session</option>{(sessions||[]).map(s=><option key={s._id} value={s._id}>{s.name}{s.active?" (Active)":""}</option>)}</select></div>
      <div className="template-step"><span>2</span><div><strong>Source Timetable Version</strong><small>Choose a current or historical version.</small></div><select value={sourceId} onChange={e=>setSourceId(e.target.value)} disabled={!sourceVersions.length}><option value="">Select version</option>{sourceVersions.map(v=><option key={v._id} value={v._id}>{v.versionLabel||`Version ${v.version}`} · {v.status} · {v.createdAt?new Date(v.createdAt).toLocaleDateString():""}</option>)}</select></div>
      <div className="template-step"><span>3</span><div><strong>Target Academic Session</strong><small>The cloned timetable will be created as Draft.</small></div><select value={targetSessionId} onChange={e=>setTargetSessionId(e.target.value)}><option value="">Select target session</option>{targetSessions.map(s=><option key={s._id} value={s._id}>{s.name}{s.active?" (Active)":""}</option>)}</select></div></div>
      <div className="form-grid template-extra"><Input label="New Version Label (optional)" value={label} onChange={setLabel}/><Input label="Notes (optional)" value={notes} onChange={setNotes}/></div>
      <div className="template-warning">Cloning copies scheduled classes and optimization metadata, but it does not copy Faculty, Subject, Section, Room, or Time Slot master records. The target session must use compatible master data.</div>
      <div className="form-actions"><button className="primary" onClick={clone} disabled={loading||!sourceId||!targetSessionId}><Copy size={15}/> {loading?"Cloning...":"Clone as Draft"}</button></div>
    </section>
    {sourceVersions.length>0&&<section className="panel"><div className="panel-head"><div><h3>Available Source Versions</h3><p>{sourceVersions.length} version(s) available in the selected source session.</p></div></div><div className="table-wrap"><table><thead><tr><th>Version</th><th>Status</th><th>Current</th><th>Created</th><th>Notes</th></tr></thead><tbody>{sourceVersions.map(v=><tr key={v._id}><td>{v.versionLabel||`Version ${v.version}`}</td><td><span className={`status-badge ${String(v.status||"").toLowerCase()}`}>{v.status}</span></td><td>{v.isCurrent?"YES":"NO"}</td><td>{v.createdAt?new Date(v.createdAt).toLocaleString():"—"}</td><td>{v.notes||"—"}</td></tr>)}</tbody></table></div></section>}
  </div>;
}


export function TimetableVersions({activeSession,versionList,setVersionList,setLatest,setMessage}){
  if(!activeSession)return <div className="panel"><div className="message warn">Activate an Academic Session to manage timetable versions.</div></div>;
  async function refresh(){const r=await axios.get(`${API}/timetable/versions?sessionId=${activeSession._id}`);setVersionList(r.data||[])}
  async function restore(id){
    if(!confirm("Restore this version as a new Draft?"))return;
    try{const r=await axios.post(`${API}/timetable/${id}/restore`);setLatest(r.data);await refresh();setMessage(`Restored as Version ${r.data.version}.`)}
    catch(e){setMessage(e.response?.data?.message||e.message)}
  }
  return <div className="panel">
    <div className="panel-head"><div><h3>Timetable Versions</h3><p>{activeSession.name}</p></div><button className="secondary" onClick={refresh}>Refresh</button></div>
    <div className="table-wrap"><table><thead><tr><th>Version</th><th>Status</th><th>Current</th><th>Created</th><th>Action</th></tr></thead>
    <tbody>{versionList.map(v=><tr key={v._id}><td>{v.versionLabel||`Version ${v.version}`}</td><td>{v.status}</td><td>{v.isCurrent?"YES":"NO"}</td><td>{v.createdAt?new Date(v.createdAt).toLocaleString():"—"}</td><td>{!v.isCurrent&&<button className="secondary" onClick={()=>restore(v._id)}>Restore</button>}</td></tr>)}</tbody></table></div>
  </div>
}



export function FullSessionTimetable({sessions,activeSession,role}){
  const [sessionId,setSessionId]=useState(activeSession?._id||"");
  const [holidays,setHolidays]=useState("");
  const [holidayDate,setHolidayDate]=useState("");
  const [plans,setPlans]=useState([]);
  const [plan,setPlan]=useState(null);
  const [weekIndex,setWeekIndex]=useState(0);
  const [sectionId,setSectionId]=useState("");
  const [facultyId,setFacultyId]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  useEffect(()=>{if(activeSession?._id&&!sessionId)setSessionId(activeSession._id)},[activeSession?._id]);
  useEffect(()=>{setPlan(null);setWeekIndex(0);if(!sessionId)return;Promise.all([axios.get(`${API}/session-plans?sessionId=${sessionId}`),axios.get(`${API}/academic-sessions/${sessionId}`)]).then(([r,sr])=>{setPlans(r.data||[]);setHolidays((sr.data?.holidayDates||[]).join(', '))}).catch(e=>setError(e.response?.data?.message||e.message))},[sessionId]);
  async function openPlan(id){setBusy(true);setError("");try{const r=await axios.get(`${API}/session-plans/${id}`);setPlan(r.data);setWeekIndex(0)}catch(e){setError(e.response?.data?.message||e.message)}finally{setBusy(false)}}
  async function generateFull(){if(!window.confirm('Generate and save a new full academic session plan? Existing plans will be preserved.'))return;setBusy(true);setError("");try{const dates=holidays.split(/[\s,;]+/).map(x=>x.trim()).filter(Boolean);const r=await axios.post(`${API}/session-plans/generate`,{sessionId,holidays:dates});const p=await axios.get(`${API}/session-plans?sessionId=${sessionId}`);setPlans(p.data||[]);await openPlan(r.data.id)}catch(e){setError(e.response?.data?.message||e.message)}finally{setBusy(false)}}
  async function publish(){if(!plan||!window.confirm('Publish this full-session timetable version?'))return;setBusy(true);try{await axios.patch(`${API}/session-plans/${plan._id}/publish`);const r=await axios.get(`${API}/session-plans?sessionId=${sessionId}`);setPlans(r.data||[]);await openPlan(plan._id)}catch(e){setError(e.response?.data?.message||e.message)}finally{setBusy(false)}}
  const week=plan?.weeks?.[weekIndex];
  const entries=(week?.entries||[]).filter(e=>(!sectionId||refId(e.section)===sectionId)&&(!facultyId||refId(e.faculty)===facultyId)).sort((a,b)=>a.date.localeCompare(b.date)||a.startTime.localeCompare(b.startTime));
  const sectionOptions=[...new Map((plan?.weeks||[]).flatMap(w=>w.entries||[]).filter(e=>e.section).map(e=>[refId(e.section),e.section])).values()];
  const facultyOptions=[...new Map((plan?.weeks||[]).flatMap(w=>w.entries||[]).filter(e=>e.faculty).map(e=>[refId(e.faculty),e.faculty])).values()];
  const timeColumns=[...new Map(entries.map(e=>[`${e.startTime}|${e.endTime}|${e.order}`,{startTime:e.startTime,endTime:e.endTime,order:Number(e.order||0)}])).values()].sort((a,b)=>a.order-b.order);
  const entryAt=(date,col)=>entries.find(e=>e.date===date&&String(e.startTime)===String(col.startTime)&&String(e.endTime)===String(col.endTime));
  return <div>
    <section className="panel" style={{padding:22,marginBottom:18}}>
      <h2>Full Academic Session Timetable</h2><p>Generate and store the complete date-wise timetable for the academic session. Each week may have a different arrangement, while subject totals are controlled for the entire session.</p>
      <div style={{display:'flex',gap:12,flexWrap:'wrap',alignItems:'end'}}>
        <label>Academic Session<br/><select value={sessionId} onChange={e=>setSessionId(e.target.value)}><option value="">Select session</option>{sessions.map(s=><option key={s._id} value={s._id}>{s.name} ({String(s.startDate||'').slice(0,10)} to {String(s.endDate||'').slice(0,10)})</option>)}</select></label>
        {['ADMIN','SCHEDULER'].includes(role)&&<>
          <div style={{display:'flex',flexDirection:'column',gap:8,minWidth:320}}>
            <label>Holiday date</label>
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              <input type="date" value={holidayDate} onChange={e=>setHolidayDate(e.target.value)} />
              <button className="secondary" type="button" disabled={!holidayDate||new Date(`${holidayDate}T00:00:00Z`).getUTCDay()===0} onClick={()=>{if(!holidayDate)return;const vals=holidays.split(/[,;\s]+/).map(x=>x.trim()).filter(Boolean);if(!vals.includes(holidayDate)){vals.push(holidayDate);vals.sort();setHolidays(vals.join(', '));}setHolidayDate('')}}>Add Holiday</button>
            </div>
            <small style={{color:'#64748b'}}>Sunday is automatically a holiday and cannot be added as a separate date.</small>
            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
              {holidays.split(/[,;\s]+/).map(x=>x.trim()).filter(Boolean).map(d=><span key={d} style={{padding:'5px 9px',borderRadius:999,background:'#fff7ed',color:'#9a3412',fontSize:12}}>{d} <button type="button" onClick={()=>setHolidays(holidays.split(/[,;\s]+/).map(x=>x.trim()).filter(Boolean).filter(v=>v!==d).join(', '))} style={{border:0,background:'transparent',cursor:'pointer',color:'#9a3412'}}>×</button></span>)}
            </div>
          </div>
          <button className="primary" disabled={!sessionId||busy} onClick={generateFull}>{busy?'Generating...':'Generate Full Session'}</button>
        </>}
      </div>
      {error&&<p style={{color:'#b91c1c',whiteSpace:'pre-wrap'}}>{error}</p>}
      <p style={{fontSize:12,color:'#64748b'}}>The generator does not repeat one fixed weekly timetable. It distributes each subject’s Total Sessions across the academic weeks, respects Max Classes / Week, handles holidays, and saves every dated class in the session plan. No partial plan is saved.</p>
    </section>
    <section className="panel" style={{padding:22,marginBottom:18}}><h3>Saved Full-Session Versions</h3><div style={{display:'flex',gap:10,flexWrap:'wrap'}}>{plans.map(p=><button key={p._id} className={plan?._id===p._id?'primary':'secondary'} onClick={()=>openPlan(p._id)}>Version {p.version} · {p.status} · {p.weeks?.length||0} weeks</button>)}{!plans.length&&<p>No session-wide plans generated yet.</p>}</div></section>
    {plan&&<section className="panel" style={{padding:22}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,flexWrap:'wrap'}}><h3>Version {plan.version} · {plan.status} · {plan.weeks.length} academic weeks · {plan.totalEntries} classes</h3>{plan.status==='DRAFT'&&['ADMIN','SCHEDULER'].includes(role)&&<button className="primary" disabled={busy} onClick={publish}>Publish Full Session</button>}</div>
      <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap',margin:'12px 0'}}><button className="secondary" disabled={weekIndex===0} onClick={()=>setWeekIndex(i=>i-1)}>← Previous Week</button><select value={weekIndex} onChange={e=>setWeekIndex(Number(e.target.value))}>{plan.weeks.map((w,i)=><option key={i} value={i}>Week {w.weekNumber}: {w.startDate} – {w.endDate}</option>)}</select><button className="secondary" disabled={weekIndex>=plan.weeks.length-1} onClick={()=>setWeekIndex(i=>i+1)}>Next Week →</button></div>
      <div style={{display:'flex',gap:12,flexWrap:'wrap',marginBottom:14}}><label>Section<br/><select value={sectionId} onChange={e=>setSectionId(e.target.value)}><option value="">All sections</option>{sectionOptions.map(s=><option key={s._id} value={s._id}>{s.name}</option>)}</select></label><label>Faculty<br/><select value={facultyId} onChange={e=>setFacultyId(e.target.value)}><option value="">All faculty</option>{facultyOptions.map(f=><option key={f._id} value={f._id}>{f.name}</option>)}</select></label></div>
      <p>{week?.workingDates?.length||0} working days · {week?.entries?.length||0} classes · {week?.variationPercent||0}% placement variation vs preceding week</p>
      <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',minWidth:760}}><thead><tr><th style={{padding:10,borderBottom:'1px solid #ddd',textAlign:'left'}}>Week / Date</th><th style={{padding:10,borderBottom:'1px solid #ddd',textAlign:'left'}}>Day</th>{timeColumns.map(col=><th key={`${col.startTime}-${col.endTime}`} style={{padding:10,borderBottom:'1px solid #ddd',textAlign:'left',whiteSpace:'nowrap'}}>{col.startTime}–{col.endTime}</th>)}</tr></thead><tbody>{(week?.calendarDates||((week?.workingDates||[]).map(date=>({date,day:new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US',{weekday:'long',timeZone:'UTC'}),status:'WORKING'})))).map(item=>{const date=item.date;const day=item.day;const holiday=item.status==='HOLIDAY';return <tr key={date} style={holiday?{background:'#fff7ed'}:{}}><td style={{padding:10,borderBottom:'1px solid #eee',fontWeight:700,whiteSpace:'nowrap'}}>{date}</td><td style={{padding:10,borderBottom:'1px solid #eee'}}>{day}</td>{timeColumns.map(col=>{const e=holiday?null:entryAt(date,col);return <td key={`${date}-${col.startTime}`} style={{padding:8,borderBottom:'1px solid #eee',verticalAlign:'top',minWidth:150}}>{holiday?<div style={{padding:8,borderRadius:8,background:'#ffedd5',fontWeight:700,color:'#9a3412'}}>Holiday</div>:e?<div style={{padding:8,borderRadius:8,background:'#eff6ff'}}><strong>{e.subject?.code||e.subject?.name||'Subject'}</strong><div style={{fontSize:12,color:'#475569'}}>{e.subject?.name||''}</div><div style={{fontSize:12}}>{e.faculty?.name||'Faculty'}</div><div style={{fontSize:12}}>{e.section?.name||'Section'} · {e.room?.name||'Room'}</div>{Number(e.duration||1)>1&&<small>{e.duration} periods</small>}</div>:<span style={{color:'#94a3b8'}}>—</span>}</td>})}</tr>})}</tbody></table>{!entries.length&&<p>No entries for selected filters or this week.</p>}</div>
    </section>}
  </div>;
}
