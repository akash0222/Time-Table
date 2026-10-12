import React, {useEffect, useState} from "react";
import axios from "axios";
import {API} from "../core/api";
import {days, refId} from "../core/utils.js";
import {Metric} from "../components/SharedComponents.jsx";
import {RefreshCw} from "lucide-react";

export default function PersonalTimetable({auth,data}){
  const canSelect = ["ADMIN","SCHEDULER"].includes(auth.role);
  const defaultType = auth.role === "FACULTY" ? "FACULTY" : "SECTION";
  const [type,setType]=useState(defaultType),[id,setId]=useState(auth.role==="FACULTY"?refId(auth.faculty):refId(auth.section)),[report,setReport]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(""),[day,setDay]=useState("ALL");
  async function load(t=type,target=id){setLoading(true);setError("");try{const q=t?`?type=${encodeURIComponent(t)}${target?`&id=${encodeURIComponent(target)}`:""}`:"";setReport((await axios.get(`${API}/personal-timetable${q}`)).data)}catch(e){setError(e.response?.data?.message||e.message);setReport(null)}finally{setLoading(false)}}
  useEffect(()=>{load()},[]);
  const rows=(report?.rows||[]).filter(r=>day==="ALL"||r.day===day);
  const today=report?.today?.rows||[];
  const targetLabel=report?.target
    ? (report?.type==="FACULTY"
        ? report.target.name
        : [report.target.program,report.target.semester,report.target.name].filter(Boolean).join(" · "))
    : (canSelect ? "Select a faculty or section" : "Personal schedule");
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
