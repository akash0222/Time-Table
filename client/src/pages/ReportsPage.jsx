import React, {useEffect, useState} from "react";
import axios from "axios";
import {API} from "../core/api";
import {Metric, Progress} from "../components/SharedComponents.jsx";
import {X, FileSpreadsheet, RotateCcw, Activity} from "lucide-react";

export default function Reports({activeSession}={}){
  const [report,setReport]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(""),[filter,setFilter]=useState("ALL");
  async function load(){
    setLoading(true);
    setError("");
    try{
      const params=activeSession?._id?{params:{sessionId:activeSession._id}}:{};
      setReport((await axios.get(`${API}/reports/summary`,params)).data);
    }catch(e){
      setError(e.response?.data?.message||e.message);
    }finally{
      setLoading(false);
    }
  }
  useEffect(()=>{load()},[activeSession?._id]);
  async function download(type){
    try{
      const params=activeSession?._id?{params:{sessionId:activeSession._id}}:{};
      const r=await axios.get(`${API}/reports/export/${type}`,{...params,responseType:"blob"});
      const url=URL.createObjectURL(r.data);
      const a=document.createElement("a");
      a.href=url;
      a.download=`timetable-report.${type==="excel"?"xlsx":"pdf"}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch(e){
      let message=e.response?.data?.message||e.message;
      if(e.response?.data instanceof Blob){
        try{const payload=JSON.parse(await e.response.data.text());message=payload.message||message}catch{}
      }
      setError(message);
    }
  }
  if(loading)return <div className="panel"><h3>Advanced Reports</h3><p>Preparing timetable reports...</p></div>;
  if(error)return <div className="panel"><h3>Advanced Reports</h3><div className="message error">{error}</div><button className="primary" onClick={load}>Retry</button></div>;
  const issues=(report?.validation?.issues||report?.issues||[]).filter(x=>filter==="ALL"||x.severity===filter.toLowerCase());
  const unscheduled=(report?.subjects||[]).filter(x=>x.unscheduled>0);
  const summary=report?.summary||{requiredSessions:0,scheduledSessions:0,coverage:0,unscheduledSessions:0,periods:0};
  const validation=report?.validation||{errors:0,warnings:0,issues:[]};
  return <div>
    <div className="analytics-toolbar"><div><h2>Advanced Reports</h2><p>Timetable, workload, utilization, coverage and conflict reporting.</p></div><div className="form-actions"><button className="secondary" onClick={load}><RotateCcw size={15}/> Refresh</button><button className="secondary" onClick={()=>download("excel")}><FileSpreadsheet size={15}/> Excel</button><button className="primary" onClick={()=>download("pdf")}><FileSpreadsheet size={15}/> PDF</button></div></div>
    <div className="cards analytics-cards"><Metric label="Required Sessions" value={summary.requiredSessions}/><Metric label="Scheduled Sessions" value={summary.scheduledSessions}/><Metric label="Coverage" value={`${summary.coverage}%`}/><Metric label="Unscheduled" value={summary.unscheduledSessions}/><Metric label="Validation Errors" value={validation.errors}/><Metric label="Warnings" value={validation.warnings}/></div>
    <section className="panel"><div className="panel-head"><div><h3>Report Context</h3><p>Current academic session and timetable version.</p></div></div><div className="report-context"><div><span>Academic Session</span><strong>{report?.session?.name||activeSession?.name||"Not configured"}</strong></div><div><span>Timetable Version</span><strong>{report?.timetable?.versionLabel||"Current"}</strong></div><div><span>Status</span><strong>{report?.timetable?.status||"DRAFT"}</strong></div><div><span>Total Periods</span><strong>{summary.periods||0}</strong></div></div></section>
    <div className="analytics-grid">
      <section className="panel"><div className="panel-head"><div><h3>Faculty Workload</h3><p>Classes, periods and utilization.</p></div></div><div className="table-wrap"><table><thead><tr><th>Faculty</th><th>Classes</th><th>Periods</th><th>Days</th><th>Utilization</th></tr></thead><tbody>{(report?.faculty||[]).map(x=><tr key={x.id}><td>{x.name}</td><td>{x.classes}</td><td>{x.periods}</td><td>{x.workingDays}</td><td><Progress value={x.utilization}/></td></tr>)}</tbody></table></div></section>
      <section className="panel"><div className="panel-head"><div><h3>Room Utilization</h3><p>Occupied timetable periods by room.</p></div></div><div className="table-wrap"><table><thead><tr><th>Room</th><th>Type</th><th>Classes</th><th>Periods</th><th>Utilization</th></tr></thead><tbody>{(report?.rooms||[]).map(x=><tr key={x.id}><td>{x.name}</td><td>{x.type}</td><td>{x.classes}</td><td>{x.periods}</td><td><Progress value={x.utilization}/></td></tr>)}</tbody></table></div></section>
      <section className="panel"><div className="panel-head"><div><h3>Section Workload</h3><p>Coverage and scheduled load by section.</p></div></div><div className="table-wrap"><table><thead><tr><th>Section</th><th>Classes</th><th>Periods</th><th>Required</th><th>Coverage</th></tr></thead><tbody>{(report?.sections||[]).map(x=><tr key={x.id}><td>{x.label}</td><td>{x.classes}</td><td>{x.periods}</td><td>{x.required}</td><td><Progress value={x.coverage}/></td></tr>)}</tbody></table></div></section>
      <section className="panel"><div className="panel-head"><div><h3>Daily Distribution</h3><p>Classes and periods across the working week.</p></div></div><div className="daily-chart">{(report?.daily||[]).map(x=><div className="daily-row" key={x.day}><strong>{x.day.slice(0,3)}</strong><div className="bar"><span style={{width:`${Math.min(100,(x.periods/Math.max(1,...(report?.daily||[]).map(y=>y.periods)))*100)}%`}}></span></div><b>{x.periods}</b></div>)}</div></section>
    </div>
    <section className="panel"><div className="panel-head"><div><h3>Unscheduled Classes</h3><p>Subjects where required weekly sessions exceed scheduled sessions.</p></div></div>{unscheduled.length?<div className="table-wrap"><table><thead><tr><th>Subject</th><th>Code</th><th>Faculty</th><th>Section</th><th>Required</th><th>Scheduled</th><th>Unscheduled</th></tr></thead><tbody>{unscheduled.map(x=><tr key={x.id}><td>{x.name}</td><td>{x.code}</td><td>{x.faculty}</td><td>{x.section}</td><td>{x.required}</td><td>{x.scheduled}</td><td className="missing-cell">{x.unscheduled}</td></tr>)}</tbody></table></div>:<div className="empty-state"><h3>No unscheduled classes</h3><p>All subject weekly requirements are currently covered.</p></div>}</section>
    <section className="panel"><div className="panel-head"><div><h3>Conflict & Validation Report</h3><p>Detailed issues detected by the reporting engine.</p></div></div><div className="view-tabs">{[["ALL","All"],["ERROR","Errors"],["WARNING","Warnings"]].map(([v,l])=><button key={v} className={filter===v?"view-tab active":"view-tab"} onClick={()=>setFilter(v)}>{l}</button>)}</div>{issues.length?<div className="validation-list">{issues.map((x,i)=><div className={`validation-item ${x.severity}`} key={`${x.category}-${i}`}><div className="validation-icon">{x.severity==="error"?<X size={16}/>:<Activity size={16}/>}</div><div><strong>{x.category}</strong><p>{x.message}</p></div></div>)}</div>:<div className="empty-state"><h3>No issues in this filter</h3><p>The current report contains no matching validation issues.</p></div>}</section>
  </div>
}
