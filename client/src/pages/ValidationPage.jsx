import React, {useEffect, useState} from "react";
import axios from "axios";
import {API} from "../core/api";
import {Metric} from "../components/SharedComponents.jsx";
import {Check, X, RotateCcw, Activity} from "lucide-react";

export default function Validation(){
  const [report,setReport]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(""),[filter,setFilter]=useState("ALL");
  async function load(){setLoading(true);setError("");try{setReport((await axios.get(`${API}/timetable/validation`)).data)}catch(e){setError(e.response?.data?.message||e.message)}finally{setLoading(false)}}
  useEffect(()=>{load()},[]);
  if(loading)return <div className="panel"><h3>Validation Center</h3><p>Checking timetable conflicts and constraints...</p></div>;
  if(error)return <div className="panel"><h3>Validation Center</h3><div className="message error">{error}</div><button className="primary" onClick={load}>Retry</button></div>;
  if(!report?.hasTimetable)return <div className="panel"><h3>Validation Center</h3><div className="empty-state"><h3>No timetable generated</h3><p>Generate a timetable first.</p></div></div>;
  const issues=(report.issues||[]).filter(x=>filter==="ALL"||x.severity===filter.toLowerCase());
  const validationSummary=report.summary||{};
  const classCount=validationSummary.entries
    ?? report.constraintValidation?.stats?.entries
    ?? report.timetable?.totalEntries
    ?? "—";
  const totalIssues=validationSummary.total
    ?? (Array.isArray(report.issues)?report.issues.length:0);
  const errorCount=validationSummary.errors
    ?? (Array.isArray(report.issues)?report.issues.filter(x=>x.severity==="error").length:0);
  const warningCount=validationSummary.warnings
    ?? (Array.isArray(report.issues)?report.issues.filter(x=>x.severity==="warning").length:0);
  return <div>
    <div className="analytics-toolbar"><div><h2>Validation Center</h2></div><button className="secondary" onClick={load}><RotateCcw size={15}/> Run Validation</button></div>
    <div className="cards analytics-cards"><Metric label="Errors" value={errorCount}/><Metric label="Warnings" value={warningCount}/><Metric label="Classes" value={classCount}/><Metric label="Issues" value={totalIssues}/></div>
    <div className="view-tabs">{[["ALL","All"],["ERROR","Errors"],["WARNING","Warnings"]].map(([v,l])=><button key={v} className={filter===v?"view-tab active":"view-tab"} onClick={()=>setFilter(v)}>{l}</button>)}</div>
    <section className="panel"><div className="panel-head"><div><h3>{issues.length ? `${issues.length} issue${issues.length===1?"":"s"}` : "No issues found"}</h3><p>{issues.length?"Review the items below before publishing the timetable.":"The generated timetable passed the available validation checks."}</p></div></div>
      {issues.length?<div className="validation-list">{issues.map((x,i)=><div className={`validation-item ${x.severity.toLowerCase()}`} key={`${x.category}-${i}`}><div className="validation-icon">{x.severity==='error'?<X size={16}/>:<Activity size={16}/>}</div><div><strong>{x.category}</strong><p>{x.message}</p></div></div>)}</div>:<div className="empty-state"><h3>✓ Timetable is valid</h3><p>No faculty, section, room or configured constraint conflicts were detected.</p></div>}
    </section>
  </div>
}
