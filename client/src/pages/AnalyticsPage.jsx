import React, {useEffect, useState} from "react";
import axios from "axios";
import {API} from "../core/api";
import {days} from "../core/utils.js";
import {Metric, Progress} from "../components/SharedComponents.jsx";
import {RotateCcw, AlertTriangle, CheckCircle2} from "lucide-react";

export default function Analytics({activeSession}){
  const [report,setReport]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState("");
  async function load(){setLoading(true);setError("");try{const q=activeSession?`?sessionId=${encodeURIComponent(activeSession._id)}`:"";setReport((await axios.get(`${API}/analytics${q}`)).data)}catch(e){setError(e.response?.data?.message||e.message)}finally{setLoading(false)}}
  useEffect(()=>{load()},[activeSession?._id]);
  if(loading)return <div className="panel"><h3>Timetable Quality Dashboard</h3><p>Loading workload, utilization and conflict analysis...</p></div>;
  if(error)return <div className="panel"><h3>Timetable Quality Dashboard</h3><div className="message error">{error}</div><button className="primary" onClick={load}>Retry</button></div>;
  if(!report?.hasTimetable)return <div className="panel"><h3>Timetable Quality Dashboard</h3><div className="empty-state"><h3>No timetable generated</h3><p>Generate a timetable for the active academic session to view quality and conflict analysis.</p></div></div>;
  const q=report.quality||{};
  return <div>
    <div className="analytics-toolbar"><div><h2>Timetable Quality Dashboard</h2><p>{report.versionLabel||`Version ${report.version||"—"}`} · {report.status||"DRAFT"} · workload, utilization, conflicts and quality.</p></div><button className="secondary" onClick={load}><RotateCcw size={15}/> Refresh</button></div>
    <div className="cards analytics-cards">
      <Metric label="Quality Score" value={q.qualityScore??report.timetableScore??"—"}/><Metric label="Coverage" value={`${report.summary.coverage}%`}/><Metric label="Unscheduled" value={report.summary.unscheduledSessions}/><Metric label="Faculty Variance" value={q.facultyLoadVariance??"—"}/><Metric label="Section Variance" value={q.sectionLoadVariance??"—"}/><Metric label="Conflicts" value={report.conflicts?.length||0}/>
    </div>
    <div className="analytics-grid">
      <section className="panel"><div className="panel-head"><div><h3>Generation Quality</h3><p>Metrics captured by the Phase 5 generation engine.</p></div></div><div className="generation-quality-grid"><div><span>Required Sessions</span><strong>{q.requiredSessions??report.summary.requiredSessions}</strong></div><div><span>Scheduled Sessions</span><strong>{q.scheduledSessions??report.summary.scheduledSessions}</strong></div><div><span>Subject Same-Day Repeats</span><strong>{q.subjectSameDayRepeats??0}</strong></div><div><span>Faculty Avg Load</span><strong>{q.facultyLoadAverage??0}</strong></div><div><span>Section Avg Load</span><strong>{q.sectionLoadAverage??0}</strong></div><div><span>Edge Period Classes</span><strong>{q.edgePeriodClasses??0}</strong></div></div></section>
      <section className="panel"><div className="panel-head"><div><h3>Conflict Report</h3><p>Hard-resource collisions detected in the saved timetable.</p></div></div>{report.conflicts?.length?<div className="portal-notifications">{report.conflicts.slice(0,8).map((c,i)=><div className="portal-note error" key={i}><AlertTriangle size={16}/><div><strong>{c.type} conflict · {c.resource}</strong><p>{c.day} {c.startTime}–{c.endTime} · {c.entries.map(x=>x.subject).join(" / ")}</p></div></div>)}</div>:<div className="portal-note success"><CheckCircle2 size={16}/><div><strong>No resource conflicts detected</strong><p>Faculty, section and room occupancy is unique for each scheduled slot.</p></div></div>}</section>
      <section className="panel"><div className="panel-head"><div><h3>Faculty Workload</h3><p>Scheduled periods and relative utilization.</p></div></div><div className="table-wrap"><table><thead><tr><th>Faculty</th><th>Classes</th><th>Periods</th><th>Days</th><th>Utilization</th></tr></thead><tbody>{report.faculty.map(x=><tr key={x.id}><td>{x.name}</td><td>{x.classes}</td><td>{x.periods}</td><td>{x.days}</td><td><Progress value={x.utilization}/></td></tr>)}</tbody></table></div></section>
      <section className="panel"><div className="panel-head"><div><h3>Room Utilization</h3><p>Occupied periods by room.</p></div></div><div className="table-wrap"><table><thead><tr><th>Room</th><th>Type</th><th>Classes</th><th>Periods</th><th>Utilization</th></tr></thead><tbody>{report.rooms.map(x=><tr key={x.id}><td>{x.name}</td><td>{x.type}</td><td>{x.classes}</td><td>{x.periods}</td><td><Progress value={x.utilization}/></td></tr>)}</tbody></table></div></section>
      <section className="panel"><div className="panel-head"><div><h3>Section Workload</h3><p>Scheduled periods by academic section.</p></div></div><div className="table-wrap"><table><thead><tr><th>Section</th><th>Classes</th><th>Periods</th></tr></thead><tbody>{report.sections.map(x=><tr key={x.id}><td>{x.label}</td><td>{x.classes}</td><td>{x.periods}</td></tr>)}</tbody></table></div></section>
      <section className="panel"><div className="panel-head"><div><h3>Daily Distribution</h3><p>Scheduled periods across the week.</p></div></div><div className="daily-chart">{report.daily.map(x=><div className="daily-row" key={x.day}><strong>{x.day.slice(0,3)}</strong><div className="bar"><span style={{width:`${Math.min(100,(x.periods/Math.max(1,report.dailyMax))*100)}%`}}></span></div><b>{x.periods}</b></div>)}</div></section>
    </div>
    {report.warnings?.length>0&&<div className="warning">{report.warnings.join(" ")}</div>}
  </div>
}
