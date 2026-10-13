import React, {useEffect, useState} from "react";
import axios from "axios";
import {API} from "../core/api";
import {days} from "../core/utils.js";
import {Metric} from "../components/SharedComponents.jsx";
import {Users, X, Bell, RefreshCw} from "lucide-react";

export default function SectionPortal(){
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
    <div className="section-portal-head"><div><h2>Student / Section Timetable</h2></div><button className="secondary" onClick={()=>load()}><RefreshCw size={15}/> Refresh</button></div>
    <section className="panel section-selector"><div><strong>Select Section</strong><p className="muted">Only timetable viewing is available here. Faculty and scheduling administration remains protected by role.</p></div><select value={selected} onChange={e=>{setSelected(e.target.value);setDay("ALL");load(e.target.value)}}>{sections.map(x=><option key={x.id} value={x.id}>{x.program} · {x.semester} · {x.name}</option>)}</select></section>
    {report && <>
      <section className="section-profile panel"><div className="section-avatar"><Users size={26}/></div><div className="section-profile-main"><strong>{report.section.name}</strong><span>{report.section.program} · Semester {report.section.semester}</span><small>{report.session?.name||"No active academic session"}</small></div><div className="faculty-status"><span className={`status-badge ${status.toLowerCase()}`}>{status}</span><small>{report.timetable?.versionLabel||"Current timetable"}</small></div></section>
      <div className="cards section-metrics"><Metric label="Scheduled Classes" value={report.summary.scheduledClasses}/><Metric label="Weekly Periods" value={report.summary.weeklyPeriods}/><Metric label="Working Days" value={report.summary.workingDays}/><Metric label="Daily Limit" value={report.section.maxClassesPerDay||"—"}/></div>
      <div className="section-portal-grid"><section className="panel"><div className="panel-head"><div><h3><Bell size={17}/> Notifications</h3></div></div>{(report.notifications||[]).length?<div className="portal-notifications">{report.notifications.map((n,i)=><div className={`portal-note ${n.type||"info"}`} key={i}><Bell size={15}/><span>{n.message}</span></div>)}</div>:<div className="empty-state"><h3>No notifications</h3></div>}</section><section className="panel"><div className="panel-head"><div><h3>Section Summary</h3></div></div><div className="availability-summary"><div><span>Program</span><strong>{report.section.program}</strong></div><div><span>Semester</span><strong>{report.section.semester}</strong></div><div><span>Working days</span><strong>{report.summary.workingDays}</strong></div></div></section></div>
      <section className="panel"><div className="panel-head"><div><h3>Weekly Timetable</h3><p>Complete schedule including subject, faculty and room.</p></div><select className="portal-day-filter" value={day} onChange={e=>setDay(e.target.value)}><option value="ALL">All Days</option>{days.map(d=><option key={d}>{d}</option>)}</select></div>{rows.length?<div className="section-class-grid">{rows.map(r=><div className="section-class-card" key={r.id}><div className="section-class-time"><strong>{r.day}</strong><span>{r.startTime} – {r.endTime}</span></div><div><h4>{r.subject}</h4>{r.subjectCode&&<small>{r.subjectCode}</small>}<p>Faculty: {r.faculty}</p><span className="class-room">Room: {r.room}</span>{r.duration>1&&<span className="class-duration">{r.duration} periods</span>}</div></div>)}</div>:<div className="empty-state"><h3>No classes</h3><p>No classes are scheduled for the selected day.</p></div>}</section>
      <section className="panel"><div className="panel-head"><div><h3>Daily Workload</h3><p>Classes scheduled for the selected section.</p></div></div><div className="faculty-daily-grid">{(report.daily||[]).map(d=><div className="faculty-day-card" key={d.day}><strong>{d.day}</strong><span>{d.classes} class{d.classes===1?"":"es"}</span><b>{d.periods} period{d.periods===1?"":"s"}</b>{d.max>0&&<div className="bar"><span style={{width:`${Math.min(100,(d.classes/d.max)*100)}%`}}></span></div>}</div>)}</div></section>
      {(report.conflicts||[]).length>0&&<section className="panel"><div className="panel-head"><div><h3>Section Conflict Report</h3><p>Potential overlapping classes detected for this section.</p></div></div><div className="validation-list">{report.conflicts.map((c,i)=><div className="validation-item error" key={i}><div className="validation-icon"><X size={16}/></div><div><strong>{c.type}</strong><p>{c.message}</p></div></div>)}</div></section>}
    </>}
  </div>;
}
