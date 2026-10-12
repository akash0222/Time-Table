import React, {useEffect, useState} from "react";
import axios from "axios";
import {API} from "../core/api";
import {days} from "../core/utils.js";
import {Metric} from "../components/SharedComponents.jsx";
import {X, Bell, UserCheck, RefreshCw} from "lucide-react";

export default function FacultyPortal({activeSession}){
  const [report,setReport]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(""),[day,setDay]=useState("ALL");
  async function load(){
    setLoading(true);
    setError("");
    try{
      const response=await axios.get(`${API}/faculty-portal`);
      setReport(response.data||{});
    }catch(e){
      setError(e.response?.data?.message||e.message||"Unable to load the Faculty Portal.");
    }finally{
      setLoading(false);
    }
  }
  useEffect(()=>{load()},[]);

  if(loading)return <div className="panel"><h2>Faculty Portal</h2><p>Loading your timetable and workload...</p></div>;
  if(error)return <div className="panel"><h2>Faculty Portal</h2><div className="message error">{error}</div><button className="primary" onClick={load}>Retry</button></div>;

  // Accept both the current API response (entries/availableDays) and the
  // richer portal response (timetableRows/availability) to prevent a render crash.
  const faculty=report?.faculty||{};
  const availability=report?.availability||{
    availableDays:Array.isArray(faculty.availableDays)?faculty.availableDays:[],
    unavailableSlots:Array.isArray(faculty.unavailableSlots)?faculty.unavailableSlots:[]
  };
  const rawRows=Array.isArray(report?.timetableRows)
    ? report.timetableRows
    : Array.isArray(report?.entries) ? report.entries : [];
  const allRows=rawRows.map((entry,index)=>{
    const subject=entry?.subject&&typeof entry.subject==="object"?entry.subject:{};
    const section=entry?.section&&typeof entry.section==="object"?entry.section:{};
    const room=entry?.room&&typeof entry.room==="object"?entry.room:{};
    return {
      id:String(entry?.id||entry?._id||`${entry?.day||"day"}-${entry?.startTime||"time"}-${index}`),
      day:entry?.day||"",
      startTime:entry?.startTime||"",
      endTime:entry?.endTime||"",
      subject:typeof entry?.subject==="string"?entry.subject:(subject.name||entry?.subjectName||"Subject"),
      subjectCode:entry?.subjectCode||subject.code||"",
      program:entry?.program||section.programId?.name||section.program||"",
      semester:entry?.semester||section.semester||"",
      section:typeof entry?.section==="string"?entry.section:(section.name||""),
      room:typeof entry?.room==="string"?entry.room:(room.name||"—")
    };
  });
  const rows=allRows.filter(x=>day==="ALL"||x.day===day);
  const dailySource=Array.isArray(report?.daily)?report.daily:[];
  const daily=(dailySource.length?dailySource:days.map(d=>({day:d,classes:allRows.filter(x=>x.day===d).length,periods:allRows.filter(x=>x.day===d).reduce((n,x)=>n+1,0)})))
    .map(d=>({...d,max:Number(d.max??faculty.maxClassesPerDay??0)}));
  const daysWithClasses=daily.filter(x=>Number(x.classes)>0).length;
  const timetable=report?.timetable||null;
  const status=timetable?.status||"DRAFT";
  const summary=report?.summary||{};
  const scheduledClasses=Number(summary.scheduledClasses??summary.classes??allRows.length);
  const weeklyPeriods=Number(summary.weeklyPeriods??summary.periods??allRows.reduce((n,e)=>n+Math.max(1,Number(e.duration||1)),0));
  const utilization=Number(summary.utilization??(weeklyPeriods/Math.max(1,Number(faculty.maxWorkingDays||5)*Number(faculty.maxClassesPerDay||4))*100));
  const sessionName=report?.session?.name||timetable?.academicSession?.name||activeSession?.name||"No active academic session";

  return <div>
    <div className="faculty-portal-head"><div><h2>Faculty Portal</h2><p>Your assigned classes, workload, availability and timetable notifications.</p></div><button className="secondary" onClick={load}><RefreshCw size={15}/> Refresh</button></div>
    <section className="faculty-profile panel"><div className="faculty-avatar"><UserCheck size={26}/></div><div className="faculty-profile-main"><strong>{faculty.name||"Assigned Faculty"}</strong><span>{faculty.code||"Faculty"}</span><small>{sessionName}</small></div><div className="faculty-status"><span className={`status-badge ${String(status).toLowerCase()}`}>{status}</span><small>{timetable?.versionLabel|| (timetable?.version? `Version ${timetable.version}`:"Current timetable")}</small></div></section>
    <div className="cards faculty-metrics"><Metric label="Assigned Classes" value={scheduledClasses}/><Metric label="Weekly Periods" value={weeklyPeriods}/><Metric label="Working Days" value={`${daysWithClasses}/${faculty.maxWorkingDays||"—"}`}/><Metric label="Weekly Utilization" value={`${Number.isFinite(utilization)?utilization.toFixed(1):"0.0"}%`}/></div>
    <div className="faculty-portal-grid"><section className="panel"><div className="panel-head"><div><h3><Bell size={17}/> Notifications</h3><p>Items relevant to your faculty assignment.</p></div></div>{(Array.isArray(report?.notifications)?report.notifications:[]).length?<div className="portal-notifications">{report.notifications.map((n,i)=><div className={`portal-note ${n.type||"info"}`} key={i}><Bell size={15}/><span>{n.message||String(n)}</span></div>)}</div>:<div className="empty-state"><h3>No notifications</h3><p>There are no faculty-specific notifications right now.</p></div>}</section><section className="panel"><div className="panel-head"><div><h3>Availability</h3><p>Your configured working availability.</p></div></div><div className="availability-summary"><div><span>Available days</span><strong>{(Array.isArray(availability.availableDays)?availability.availableDays:[]).join(", ")||"Not configured"}</strong></div><div><span>Unavailable slots</span><strong>{(Array.isArray(availability.unavailableSlots)?availability.unavailableSlots:[]).length}</strong></div><div><span>Max classes/day</span><strong>{faculty.maxClassesPerDay||"—"}</strong></div></div></section></div>
    <section className="panel"><div className="panel-head"><div><h3>My Weekly Timetable</h3><p>Only classes assigned to {faculty.name||"you"} are shown.</p></div><select className="portal-day-filter" value={day} onChange={e=>setDay(e.target.value)}><option value="ALL">All Days</option>{days.map(d=><option key={d}>{d}</option>)}</select></div>{rows.length?<div className="faculty-class-grid">{rows.map(r=><div className="faculty-class-card" key={r.id}><div className="faculty-class-time"><strong>{r.day||"Day not set"}</strong><span>{r.startTime||"—"} – {r.endTime||"—"}</span></div><div><h4>{r.subject}</h4>{r.subjectCode&&<small>{r.subjectCode}</small>}<p>{[r.program,r.semester,r.section].filter(Boolean).join(" · ")||"Section not set"}</p><span className="class-room">Room: {r.room}</span></div></div>)}</div>:<div className="empty-state"><h3>No assigned classes</h3><p>No classes are scheduled for the selected day.</p></div>}</section>
    <section className="panel"><div className="panel-head"><div><h3>Daily Workload</h3><p>Scheduled periods and configured daily limit.</p></div></div><div className="faculty-daily-grid">{daily.map(d=><div className="faculty-day-card" key={d.day}><strong>{d.day}</strong><span>{Number(d.classes||0)} class{Number(d.classes||0)===1?"":"es"}</span><b>{Number(d.periods||0)} period{Number(d.periods||0)===1?"":"s"}</b>{d.max>0&&<div className="bar"><span style={{width:`${Math.min(100,(Number(d.classes||0)/d.max)*100)}%`}}></span></div>}</div>)}</div></section>
    {(Array.isArray(report?.conflicts)?report.conflicts:[]).length>0&&<section className="panel"><div className="panel-head"><div><h3>My Conflict Report</h3><p>Conflicts detected within your assigned timetable.</p></div></div><div className="validation-list">{report.conflicts.map((c,i)=><div className="validation-item error" key={i}><div className="validation-icon"><X size={16}/></div><div><strong>{c.type||"Conflict"}</strong><p>{c.message||String(c)}</p></div></div>)}</div></section>}
  </div>;
}
