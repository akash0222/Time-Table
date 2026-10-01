import React, {useEffect, useMemo, useState} from "react";
import axios from "axios";
import {CalendarDays, Users, BookOpen, DoorOpen, Clock3, WandSparkles, Database, Trash2, Settings2, Check, X, FileSpreadsheet, Upload, Lock, Send, RotateCcw, ShieldCheck, BarChart3, Activity, Bell, UserCheck, RefreshCw, Copy, QrCode, History, ClipboardCheck, UserPlus, DollarSign, GraduationCap, Search, ArrowRight, UsersRound} from "lucide-react";
import {API, days, apiName, refId} from "../core/api";
import {Input, Select} from "../components/FormControls";
import {Metric, Progress} from "../components/Metrics";
import {localToday, authRole} from "../core/helpers";

export function FacultyPortal(){
  const [report,setReport]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(""),[day,setDay]=useState("ALL");
  async function load(){setLoading(true);setError("");try{setReport((await axios.get(`${API}/faculty-portal`)).data)}catch(e){setError(e.response?.data?.message||e.message)}finally{setLoading(false)}}
  useEffect(()=>{load()},[]);
  if(loading)return <div className="panel"><h2>Faculty Portal</h2><p>Loading your timetable and workload...</p></div>;
  if(error)return <div className="panel"><h2>Faculty Portal</h2><div className="message error">{error}</div><button className="primary" onClick={load}>Retry</button></div>;
  const rows=(report?.timetableRows||[]).filter(x=>day==="ALL"||x.day===day);
  const daysWithClasses=(report?.daily||[]).filter(x=>x.classes>0).length;
  const status=report?.timetable?.status||"DRAFT";
  return <div>
    <div className="faculty-portal-head"><div><h2>Faculty Portal</h2><p>Your assigned classes, workload, availability and timetable notifications.</p></div><button className="secondary" onClick={load}><RefreshCw size={15}/> Refresh</button></div>
    <section className="faculty-profile panel"><div className="faculty-avatar"><UserCheck size={26}/></div><div className="faculty-profile-main"><strong>{report.faculty.name}</strong><span>{report.faculty.code||"Faculty"}</span><small>{report.session?.name||"No active academic session"}</small></div><div className="faculty-status"><span className={`status-badge ${status.toLowerCase()}`}>{status}</span><small>{report.timetable?.versionLabel||"Current timetable"}</small></div></section>
    <div className="cards faculty-metrics"><Metric label="Assigned Classes" value={report.summary.scheduledClasses}/><Metric label="Weekly Periods" value={report.summary.weeklyPeriods}/><Metric label="Working Days" value={`${daysWithClasses}/${report.faculty.maxWorkingDays||"—"}`}/><Metric label="Weekly Utilization" value={`${report.summary.utilization}%`}/></div>
    <div className="faculty-portal-grid"><section className="panel"><div className="panel-head"><div><h3><Bell size={17}/> Notifications</h3><p>Items relevant to your faculty assignment.</p></div></div>{(report.notifications||[]).length?<div className="portal-notifications">{report.notifications.map((n,i)=><div className={`portal-note ${n.type||"info"}`} key={i}><Bell size={15}/><span>{n.message}</span></div>)}</div>:<div className="empty-state"><h3>No notifications</h3><p>There are no faculty-specific notifications right now.</p></div>}</section><section className="panel"><div className="panel-head"><div><h3>Availability</h3><p>Your configured working availability.</p></div></div><div className="availability-summary"><div><span>Available days</span><strong>{(report.availability.availableDays||[]).join(", ")||"Not configured"}</strong></div><div><span>Unavailable slots</span><strong>{(report.availability.unavailableSlots||[]).length}</strong></div><div><span>Max classes/day</span><strong>{report.faculty.maxClassesPerDay||"—"}</strong></div></div></section></div>
    <section className="panel"><div className="panel-head"><div><h3>My Weekly Timetable</h3><p>Only classes assigned to {report.faculty.name} are shown.</p></div><select className="portal-day-filter" value={day} onChange={e=>setDay(e.target.value)}><option value="ALL">All Days</option>{days.map(d=><option key={d}>{d}</option>)}</select></div>{rows.length?<div className="faculty-class-grid">{rows.map(r=><div className="faculty-class-card" key={r.id}><div className="faculty-class-time"><strong>{r.day}</strong><span>{r.startTime} – {r.endTime}</span></div><div><h4>{r.subject}</h4>{r.subjectCode&&<small>{r.subjectCode}</small>}<p>{r.program} {r.semester} · {r.section}</p><span className="class-room">Room: {r.room}</span></div></div>)}</div>:<div className="empty-state"><h3>No assigned classes</h3><p>No classes are scheduled for the selected day.</p></div>}</section>
    <section className="panel"><div className="panel-head"><div><h3>Daily Workload</h3><p>Scheduled periods and configured daily limit.</p></div></div><div className="faculty-daily-grid">{(report.daily||[]).map(d=><div className="faculty-day-card" key={d.day}><strong>{d.day}</strong><span>{d.classes} class{d.classes===1?"":"es"}</span><b>{d.periods} period{d.periods===1?"":"s"}</b>{d.max>0&&<div className="bar"><span style={{width:`${Math.min(100,(d.classes/d.max)*100)}%`}}></span></div>}</div>)}</div></section>
    {(report.conflicts||[]).length>0&&<section className="panel"><div className="panel-head"><div><h3>My Conflict Report</h3><p>Conflicts detected within your assigned timetable.</p></div></div><div className="validation-list">{report.conflicts.map((c,i)=><div className="validation-item error" key={i}><div className="validation-icon"><X size={16}/></div><div><strong>{c.type}</strong><p>{c.message}</p></div></div>)}</div></section>}
  </div>;
}



export function SectionPortal(){
  const [sections,setSections]=useState([]),[selected,setSelected]=useState(""),[report,setReport]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(""),[day,setDay]=useState("ALL");
  async function loadSections(){
    const r=await axios.get(`${API}/section-portal/sections`); const list=r.data||[]; setSections(list); if(!selected && list[0]) setSelected(String(list[0].id)); return list;
  }
  async function load(sectionId=selected){
    if(!sectionId)return; setLoading(true);setError("");
    try{setReport((await axios.get(`${API}/section-portal?sectionId=${sectionId}`)).data)}catch(e){setError(e.response?.data?.message||e.message)}finally{setLoading(false)}
  }
  useEffect(()=>{loadSections().then(list=>{if(list[0]) load(String(list[0].id))}).catch(e=>{setError(e.response?.data?.message||e.message);setLoading(false)})},[]);
  if(loading && !report)return <div className="panel"><h2>Section Portal</h2><p>Loading section timetable...</p></div>;
  if(error && !report)return <div className="panel"><h2>Section Portal</h2><div className="message error">{error}</div><button className="primary" onClick={()=>load()}>Retry</button></div>;
  const rows=(report?.timetableRows||[]).filter(x=>day==="ALL"||x.day===day);
  const status=report?.timetable?.status||"DRAFT";
  return <div>
    <div className="section-portal-head"><div><h2>Student / Section Timetable</h2><p>View the complete weekly schedule for a selected section.</p></div><button className="secondary" onClick={()=>load()}><RefreshCw size={15}/> Refresh</button></div>
    <section className="panel section-selector"><div><strong>Select Section</strong><p className="muted">Only timetable viewing is available here. Faculty and scheduling administration remains protected by role.</p></div><select value={selected} onChange={e=>{setSelected(e.target.value);setDay("ALL");load(e.target.value)}}>{sections.map(x=><option key={x.id} value={x.id}>{x.program} · {x.semester} · {x.name}</option>)}</select></section>
    {report && <>
      <section className="section-profile panel"><div className="section-avatar"><Users size={26}/></div><div className="section-profile-main"><strong>{report.section.name}</strong><span>{report.section.program} · Semester {report.section.semester}</span><small>{report.session?.name||"No active academic session"}</small></div><div className="faculty-status"><span className={`status-badge ${status.toLowerCase()}`}>{status}</span><small>{report.timetable?.versionLabel||"Current timetable"}</small></div></section>
      <div className="cards section-metrics"><Metric label="Scheduled Classes" value={report.summary.scheduledClasses}/><Metric label="Weekly Periods" value={report.summary.weeklyPeriods}/><Metric label="Working Days" value={report.summary.workingDays}/><Metric label="Daily Limit" value={report.section.maxClassesPerDay||"—"}/></div>
      <div className="section-portal-grid"><section className="panel"><div className="panel-head"><div><h3><Bell size={17}/> Notifications</h3><p>Timetable information for this section.</p></div></div>{(report.notifications||[]).length?<div className="portal-notifications">{report.notifications.map((n,i)=><div className={`portal-note ${n.type||"info"}`} key={i}><Bell size={15}/><span>{n.message}</span></div>)}</div>:<div className="empty-state"><h3>No notifications</h3><p>No section-specific notifications right now.</p></div>}</section><section className="panel"><div className="panel-head"><div><h3>Section Summary</h3><p>Current timetable status and workload.</p></div></div><div className="availability-summary"><div><span>Program</span><strong>{report.section.program}</strong></div><div><span>Semester</span><strong>{report.section.semester}</strong></div><div><span>Working days</span><strong>{report.summary.workingDays}</strong></div></div></section></div>
      <section className="panel"><div className="panel-head"><div><h3>Weekly Timetable</h3><p>Complete schedule including subject, faculty and room.</p></div><select className="portal-day-filter" value={day} onChange={e=>setDay(e.target.value)}><option value="ALL">All Days</option>{days.map(d=><option key={d}>{d}</option>)}</select></div>{rows.length?<div className="section-class-grid">{rows.map(r=><div className="section-class-card" key={r.id}><div className="section-class-time"><strong>{r.day}</strong><span>{r.startTime} – {r.endTime}</span></div><div><h4>{r.subject}</h4>{r.subjectCode&&<small>{r.subjectCode}</small>}<p>Faculty: {r.faculty}</p><span className="class-room">Room: {r.room}</span>{r.duration>1&&<span className="class-duration">{r.duration} periods</span>}</div></div>)}</div>:<div className="empty-state"><h3>No classes</h3><p>No classes are scheduled for the selected day.</p></div>}</section>
      <section className="panel"><div className="panel-head"><div><h3>Daily Workload</h3><p>Classes scheduled for the selected section.</p></div></div><div className="faculty-daily-grid">{(report.daily||[]).map(d=><div className="faculty-day-card" key={d.day}><strong>{d.day}</strong><span>{d.classes} class{d.classes===1?"":"es"}</span><b>{d.periods} period{d.periods===1?"":"s"}</b>{d.max>0&&<div className="bar"><span style={{width:`${Math.min(100,(d.classes/d.max)*100)}%`}}></span></div>}</div>)}</div></section>
      {(report.conflicts||[]).length>0&&<section className="panel"><div className="panel-head"><div><h3>Section Conflict Report</h3><p>Potential overlapping classes detected for this section.</p></div></div><div className="validation-list">{report.conflicts.map((c,i)=><div className="validation-item error" key={i}><div className="validation-icon"><X size={16}/></div><div><strong>{c.type}</strong><p>{c.message}</p></div></div>)}</div></section>}
    </>}
  </div>;
}


export function PersonalTimetable({auth,data}){
  const canSelect = ["ADMIN","SCHEDULER"].includes(auth.role);
  const defaultType = auth.role === "FACULTY" ? "FACULTY" : "SECTION";
  const [type,setType]=useState(defaultType),[id,setId]=useState(auth.role==="FACULTY"?refId(auth.faculty):refId(auth.section)),[report,setReport]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(""),[day,setDay]=useState("ALL");
  async function load(t=type,target=id){setLoading(true);setError("");try{const q=t?`?type=${encodeURIComponent(t)}${target?`&id=${encodeURIComponent(target)}`:""}`:"";setReport((await axios.get(`${API}/personal-timetable${q}`)).data)}catch(e){setError(e.response?.data?.message||e.message);setReport(null)}finally{setLoading(false)}}
  useEffect(()=>{load()},[]);
  const rows=(report?.rows||[]).filter(r=>day==="ALL"||r.day===day);
  const today=report?.today?.rows||[];
  const targetLabel=report?.type==="FACULTY"?report?.target?.name:`${report?.target?.program||""} · ${report?.target?.semester||""} · ${report?.target?.name||"Section"}`;
  if(loading&&!report)return <div className="panel"><h2>My Timetable</h2><p>Loading your personal timetable...</p></div>;
  return <div>
    <div className="personal-head"><div><h2>My Timetable</h2><p>Your personal weekly schedule, today's classes and next upcoming class.</p></div><button className="secondary" onClick={()=>load()}><RefreshCw size={15}/> Refresh</button></div>
    {canSelect&&<section className="panel"><div className="personal-selector"><label>View<select value={type} onChange={e=>{setType(e.target.value);setId("");setReport(null)}}><option value="FACULTY">Faculty timetable</option><option value="SECTION">Section timetable</option></select></label><label>{type==="FACULTY"?"Faculty":"Section"}<select value={id} onChange={e=>setId(e.target.value)}><option value="">Select...</option>{(type==="FACULTY"?data.faculty:data.sections).map(x=><option key={x._id} value={x._id}>{type==="FACULTY"?`${x.name}${x.code?` · ${x.code}`:""}`:`${x.program} · ${x.semester} · ${x.name}`}</option>)}</select></label><button className="primary" onClick={()=>load(type,id)} disabled={!id}>Load Timetable</button></div></section>}
    {error&&<div className="message error">{error}</div>}
    {report&&<>
      <div className="cards personal-metrics"><Metric label="Classes" value={report.summary?.classes||0}/><Metric label="Periods" value={report.summary?.periods||0}/><Metric label="Working Days" value={report.summary?.workingDays||0}/><Metric label="Status" value={report.timetable?.status||"—"}/></div>
      <section className="panel"><div className="personal-profile"><div><strong>{targetLabel||"Personal schedule"}</strong><span>{report.session?.name||"Academic session"} · {report.timetable?.versionLabel||`Version ${report.timetable?.version||""}`}</span></div>{report.upcoming&&<div className="upcoming-card"><small>Upcoming / Current</small><b>{report.upcoming.subject}</b><span>{report.upcoming.startTime} – {report.upcoming.endTime} · {report.upcoming.room}</span></div>}</div></section>
      <section className="panel"><div className="panel-head"><div><h3>Today's Schedule — {report.today?.day}</h3><p>Classes scheduled for today.</p></div></div>{today.length?<div className="personal-today">{today.map(r=><div className="personal-class-card" key={String(r.id)}><div><strong>{r.startTime} – {r.endTime}</strong><span>{r.room}</span></div><div><h4>{r.subject}</h4>{r.subjectCode&&<small>{r.subjectCode}</small>}<p>{report.type==="FACULTY"?r.section:r.faculty}</p></div></div>)}</div>:<div className="empty-state"><h3>No classes today</h3><p>You have no timetable entries scheduled for today.</p></div>}</section>
      <section className="panel"><div className="panel-head"><div><h3>Weekly Timetable</h3><p>Use the filter to focus on one day.</p></div><select value={day} onChange={e=>setDay(e.target.value)}><option value="ALL">All Days</option>{days.map(d=><option key={d}>{d}</option>)}</select></div>{rows.length?<div className="personal-week-grid">{rows.map(r=><div className="personal-week-card" key={String(r.id)}><div className="personal-time"><b>{r.day}</b><span>{r.startTime} – {r.endTime}</span></div><div><h4>{r.subject}</h4>{r.subjectCode&&<small>{r.subjectCode}</small>}<p>{report.type==="FACULTY"?r.section:r.faculty}</p><span className="class-room">Room: {r.room}</span></div></div>)}</div>:<div className="empty-state"><h3>No classes</h3><p>No timetable classes match the selected day.</p></div>}</section>
      <section className="panel"><div className="panel-head"><div><h3>Weekly Overview</h3><p>At-a-glance workload by day.</p></div></div><div className="faculty-daily-grid">{(report.weekly||[]).map(d=><div className="faculty-day-card" key={d.day}><strong>{d.day}</strong><span>{d.classes} class{d.classes===1?"":"es"}</span><b>{d.periods} period{d.periods===1?"":"s"}</b></div>)}</div></section>
    </>}
  </div>;
}


export function Notifications({auth,data,setMessage}){
  const canManage=["ADMIN","SCHEDULER"].includes(auth.role);
  const [items,setItems]=useState([]);
  const [changes,setChanges]=useState([]);
  const [users,setUsers]=useState([]);
  const [sectionId,setSectionId]=useState("");
  const [loading,setLoading]=useState(true);
  const [form,setForm]=useState({title:"",message:"",priority:"NORMAL",audience:"ALL",faculty:"",section:"",user:"",published:true,startAt:"",endAt:""});

  async function load(){
    setLoading(true);
    try{
      const query=sectionId?`?sectionId=${sectionId}`:"";
      const [r,c]=await Promise.all([axios.get(`${API}/notifications/mine${query}`),axios.get(`${API}/notifications/timetable-changes${query}`)]);
      setItems(r.data||[]); setChanges(c.data||[]);
      if(canManage){try{const u=await axios.get(`${API}/auth/users`);setUsers(u.data||[])}catch{}}
    }catch(e){setMessage(e.response?.data?.message||e.message)}finally{setLoading(false)}
  }
  useEffect(()=>{load()},[sectionId]);

  async function create(){
    if(!form.title.trim()||!form.message.trim()) return setMessage("Notification title and message are required.");
    try{await axios.post(`${API}/notifications`,form);setForm({title:"",message:"",priority:"NORMAL",audience:"ALL",faculty:"",section:"",user:"",published:true,startAt:"",endAt:""});setMessage("Announcement published.");await load();}
    catch(e){setMessage(e.response?.data?.message||e.message)}
  }
  async function remove(id){if(!confirm("Delete this announcement?"))return;try{await axios.delete(`${API}/notifications/${id}`);setMessage("Announcement deleted.");await load()}catch(e){setMessage(e.response?.data?.message||e.message)}}
  async function markRead(id){try{await axios.post(`${API}/notifications/${id}/read`);setItems(items.map(x=>x._id===id?{...x,read:true}:x))}catch(e){setMessage(e.response?.data?.message||e.message)}}
  async function markAll(){try{await axios.post(`${API}/notifications/read-all`);setItems(items.map(x=>({...x,read:true})));setMessage("All visible notifications marked as read.")}catch(e){setMessage(e.response?.data?.message||e.message)}}

  return <div>
    <div className="notification-toolbar"><div><h2>Notifications & Announcements</h2><p>View relevant announcements and timetable-related updates.</p></div><div className="form-actions"><button className="secondary" onClick={load}><RefreshCw size={15}/> Refresh</button><button className="secondary" onClick={markAll}>Mark all read</button></div></div>
    {canManage&&<div className="notification-grid">
      <section className="panel"><div className="panel-head"><div><h3>Create Announcement</h3><p>Publish to everyone or target a specific audience.</p></div></div>
        <div className="notification-form">
          <label>Title<input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="e.g. Timetable updated"/></label>
          <label>Message<textarea value={form.message} onChange={e=>setForm({...form,message:e.target.value})} placeholder="Write the announcement..."/></label>
          <div className="form-grid"><label>Priority<select value={form.priority} onChange={e=>setForm({...form,priority:e.target.value})}><option>NORMAL</option><option>IMPORTANT</option><option>URGENT</option></select></label><label>Audience<select value={form.audience} onChange={e=>setForm({...form,audience:e.target.value})}><option>ALL</option><option>FACULTY</option><option>SECTION</option><option>USER</option></select></label></div>
          {form.audience==="FACULTY"&&<label>Faculty<select value={form.faculty} onChange={e=>setForm({...form,faculty:e.target.value})}><option value="">Select faculty</option>{data.faculty.map(f=><option key={f._id} value={f._id}>{f.name}</option>)}</select></label>}
          {form.audience==="SECTION"&&<label>Section<select value={form.section} onChange={e=>setForm({...form,section:e.target.value})}><option value="">Select section</option>{data.sections.map(s=><option key={s._id} value={s._id}>{s.program} {s.semester} - {s.name}</option>)}</select></label>}
          {form.audience==="USER"&&<label>User<select value={form.user} onChange={e=>setForm({...form,user:e.target.value})}><option value="">Select user</option>{users.map(u=><option key={u._id} value={u._id}>{u.name} ({u.username})</option>)}</select></label>}
          <div className="form-grid"><label>Start<input type="datetime-local" value={form.startAt} onChange={e=>setForm({...form,startAt:e.target.value})}/></label><label>End<input type="datetime-local" value={form.endAt} onChange={e=>setForm({...form,endAt:e.target.value})}/></label></div>
          <label className="setting-check"><input type="checkbox" checked={form.published} onChange={e=>setForm({...form,published:e.target.checked})}/><span><b>Publish immediately</b><small>Users can see it during its active date range.</small></span></label>
          <div className="notification-actions"><button className="primary" onClick={create}><Bell size={15}/> Publish Announcement</button></div>
        </div>
      </section>
      <section className="panel"><div className="panel-head"><div><h3>Notification Management</h3><p>Recent announcements created by administrators and schedulers.</p></div></div><div className="notification-table-wrap"><table className="notification-table"><thead><tr><th>Title</th><th>Audience</th><th>Priority</th><th>Published</th><th></th></tr></thead><tbody>{items.map(n=><tr key={n._id}><td>{n.title}</td><td>{n.audience}</td><td><span className={`notification-pill ${n.priority}`}>{n.priority}</span></td><td>{n.published?"Yes":"No"}</td><td><button className="secondary" onClick={()=>remove(n._id)}><Trash2 size={14}/></button></td></tr>)}</tbody></table></div></section>
    </div>}

    {!canManage&&<section className="panel"><div className="view-filter"><label>Section notifications<select value={sectionId} onChange={e=>setSectionId(e.target.value)}><option value="">All relevant notifications</option>{data.sections.map(s=><option key={s._id} value={s._id}>{s.program} {s.semester} - {s.name}</option>)}</select></label></div></section>}
    <section className="panel timetable-change-panel"><div className="panel-head"><div><h3><History size={17}/> My Timetable Changes</h3><p>Changes relevant to your faculty, section, or user account are shown here.</p></div><span className="notification-pill">{changes.length} change{changes.length===1?"":"s"}</span></div>{!changes.length?<div className="notification-empty">No timetable-specific changes are available for your account.</div>:<div className="timetable-change-list">{changes.map(n=>{const m=n.metadata||{};return <article className={`timetable-change-card ${n.read?"":"unread"}`} key={n._id}><div className="timetable-change-icon"><History size={16}/></div><div className="timetable-change-body"><div className="notification-top"><h3>{n.title}</h3><span className={`notification-pill ${n.priority}`}>{n.priority}</span></div><p>{n.message}</p><div className="notification-meta"><span>{m.subjectName||"Timetable"}</span>{m.day&&<span>{m.day}</span>}{m.startTime&&<span>{m.startTime}{m.endTime?`–${m.endTime}`:""}</span>}{m.fromRoom&&<span>Room: {m.fromRoom} → {m.toRoom||""}</span>}{n.section&&<span>Section: {n.section.name}</span>}{n.faculty&&<span>Faculty: {n.faculty.name}</span>}<span>{new Date(n.createdAt).toLocaleString()}</span></div>{!n.read&&<div className="notification-actions"><button className="secondary" onClick={()=>markRead(n._id)}>Mark as read</button></div>}</div></article>})}</div>}</section>

    <section className="panel"><div className="panel-head"><div><h3>{loading?"Loading...":`${items.length} notification${items.length===1?"":"s"}`}</h3><p>Unread items are highlighted.</p></div></div>{loading?<p>Loading notifications...</p>:!items.length?<div className="notification-empty">No active notifications.</div>:<div className="notification-grid">{items.map(n=><article className={`notification-card ${n.read?"":"unread"}`} key={n._id}><div className="notification-top"><h3>{!n.read&&<span className="notification-unread"/>} {n.title}</h3><span className={`notification-pill ${n.priority}`}>{n.priority}</span></div><div className="notification-message">{n.message}</div><div className="notification-meta"><span>{n.audience}</span>{n.faculty&&<span>Faculty: {n.faculty.name}</span>}{n.section&&<><span>Section: {n.section.name}</span><span>{n.section.program} {n.section.semester}</span></>}{n.createdBy&&<span>By {n.createdBy.name}</span>}<span>{new Date(n.createdAt).toLocaleString()}</span></div>{!n.read&&<div className="notification-actions"><button className="secondary" onClick={()=>markRead(n._id)}>Mark as read</button></div>}</article>)}</div>}</section>
  </div>;
}


export function UserManagement({data,setMessage}){
  const [users,setUsers]=useState([]); const [form,setForm]=useState({name:"",username:"",password:"",role:"VIEWER",faculty:"",section:""});
  async function loadUsers(){try{const r=await axios.get(`${API}/auth/users`);setUsers(r.data)}catch(e){setMessage(e.response?.data?.message||e.message)}}
  useEffect(()=>{loadUsers()},[]);
  async function add(){try{await axios.post(`${API}/auth/users`,form);setForm({name:"",username:"",password:"",role:"VIEWER",faculty:"",section:""});setMessage("User created.");loadUsers()}catch(e){setMessage(e.response?.data?.message||e.message)}}
  async function toggle(u){try{await axios.put(`${API}/auth/users/${u._id}`,{active:!u.active});loadUsers()}catch(e){setMessage(e.response?.data?.message||e.message)}}
  return <section className="panel"><div className="panel-head"><div><h2>User Management</h2><p>Create and deactivate users and assign roles.</p></div></div><div className="form-grid"><input placeholder="Full name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/><input placeholder="Username" value={form.username} onChange={e=>setForm({...form,username:e.target.value})}/><input placeholder="Temporary password" type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/><select value={form.role} onChange={e=>setForm({...form,role:e.target.value})}><option>VIEWER</option><option>FACULTY</option><option>SCHEDULER</option><option>ADMIN</option></select><select value={form.faculty} onChange={e=>setForm({...form,faculty:e.target.value})}><option value="">No faculty mapping</option>{data.faculty.map(f=><option key={f._id} value={f._id}>{f.name}</option>)}</select><select value={form.section} onChange={e=>setForm({...form,section:e.target.value})}><option value="">No section mapping</option>{data.sections.map(x=><option key={x._id} value={x._id}>{x.program} · {x.semester} · {x.name}</option>)}</select><button className="primary" onClick={add}>Create User</button></div><div className="table-wrap"><table><thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Faculty</th><th>Section</th><th>Status</th><th>Action</th></tr></thead><tbody>{users.map(u=><tr key={u._id}><td>{u.name}</td><td>{u.username}</td><td>{u.role}</td><td>{u.faculty?.name||"—"}</td><td>{u.section?`${u.section.program} · ${u.section.semester} · ${u.section.name}`:"—"}</td><td>{u.active?"Active":"Inactive"}</td><td><button className="secondary" onClick={()=>toggle(u)}>{u.active?"Deactivate":"Activate"}</button></td></tr>)}</tbody></table></div></section>;
}

