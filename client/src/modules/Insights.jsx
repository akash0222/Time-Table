import React, {useEffect, useMemo, useState} from "react";
import axios from "axios";
import {CalendarDays, Users, BookOpen, DoorOpen, Clock3, WandSparkles, Database, Trash2, Settings2, Check, X, FileSpreadsheet, Upload, Lock, Send, RotateCcw, ShieldCheck, BarChart3, Activity, Bell, UserCheck, RefreshCw, Copy, QrCode, History, ClipboardCheck, UserPlus, DollarSign, GraduationCap, Search, ArrowRight, UsersRound} from "lucide-react";
import {API, days, apiName, refId} from "../core/api";
import {Input, Select} from "../components/FormControls";
import {Metric, Progress} from "../components/Metrics";
import {localToday, authRole} from "../core/helpers";

export function Reports(){
  const [report,setReport]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(""),[filter,setFilter]=useState("ALL");
  async function load(){setLoading(true);setError("");try{setReport((await axios.get(`${API}/reports/summary`)).data)}catch(e){setError(e.response?.data?.message||e.message)}finally{setLoading(false)}}
  useEffect(()=>{load()},[]);
  async function download(type){try{const r=await axios.get(`${API}/reports/export/${type}`,{responseType:"blob"});const url=URL.createObjectURL(r.data);const a=document.createElement("a");a.href=url;a.download=`timetable-report.${type==="excel"?"xlsx":"pdf"}`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url)}catch(e){setError(e.response?.data?.message||e.message)}}
  if(loading)return <div className="panel"><h3>Advanced Reports</h3><p>Preparing timetable reports...</p></div>;
  if(error)return <div className="panel"><h3>Advanced Reports</h3><div className="message error">{error}</div><button className="primary" onClick={load}>Retry</button></div>;
  const issues=(report?.validation?.issues||[]).filter(x=>filter==="ALL"||x.severity===filter.toLowerCase());
  const unscheduled=(report?.subjects||[]).filter(x=>x.unscheduled>0);
  return <div>
    <div className="analytics-toolbar"><div><h2>Advanced Reports</h2><p>Timetable, workload, utilization, coverage and conflict reporting.</p></div><div className="form-actions"><button className="secondary" onClick={load}><RotateCcw size={15}/> Refresh</button><button className="secondary" onClick={()=>download("excel")}><FileSpreadsheet size={15}/> Excel</button><button className="primary" onClick={()=>download("pdf")}><FileSpreadsheet size={15}/> PDF</button></div></div>
    <div className="cards analytics-cards"><Metric label="Required Sessions" value={report.summary.requiredSessions}/><Metric label="Scheduled Sessions" value={report.summary.scheduledSessions}/><Metric label="Coverage" value={`${report.summary.coverage}%`}/><Metric label="Unscheduled" value={report.summary.unscheduledSessions}/><Metric label="Validation Errors" value={report.validation.errors}/><Metric label="Warnings" value={report.validation.warnings}/></div>
    <section className="panel"><div className="panel-head"><div><h3>Report Context</h3><p>Current academic session and timetable version.</p></div></div><div className="report-context"><div><span>Academic Session</span><strong>{report.session?.name||"Not configured"}</strong></div><div><span>Timetable Version</span><strong>{report.timetable?.versionLabel||"Current"}</strong></div><div><span>Status</span><strong>{report.timetable?.status||"DRAFT"}</strong></div><div><span>Total Periods</span><strong>{report.summary.periods}</strong></div></div></section>
    <div className="analytics-grid">
      <section className="panel"><div className="panel-head"><div><h3>Faculty Workload</h3><p>Classes, periods and utilization.</p></div></div><div className="table-wrap"><table><thead><tr><th>Faculty</th><th>Classes</th><th>Periods</th><th>Days</th><th>Utilization</th></tr></thead><tbody>{report.faculty.map(x=><tr key={x.id}><td>{x.name}</td><td>{x.classes}</td><td>{x.periods}</td><td>{x.workingDays}</td><td><Progress value={x.utilization}/></td></tr>)}</tbody></table></div></section>
      <section className="panel"><div className="panel-head"><div><h3>Room Utilization</h3><p>Occupied timetable periods by room.</p></div></div><div className="table-wrap"><table><thead><tr><th>Room</th><th>Type</th><th>Classes</th><th>Periods</th><th>Utilization</th></tr></thead><tbody>{report.rooms.map(x=><tr key={x.id}><td>{x.name}</td><td>{x.type}</td><td>{x.classes}</td><td>{x.periods}</td><td><Progress value={x.utilization}/></td></tr>)}</tbody></table></div></section>
      <section className="panel"><div className="panel-head"><div><h3>Section Workload</h3><p>Coverage and scheduled load by section.</p></div></div><div className="table-wrap"><table><thead><tr><th>Section</th><th>Classes</th><th>Periods</th><th>Required</th><th>Coverage</th></tr></thead><tbody>{report.sections.map(x=><tr key={x.id}><td>{x.label}</td><td>{x.classes}</td><td>{x.periods}</td><td>{x.required}</td><td><Progress value={x.coverage}/></td></tr>)}</tbody></table></div></section>
      <section className="panel"><div className="panel-head"><div><h3>Daily Distribution</h3><p>Classes and periods across the working week.</p></div></div><div className="daily-chart">{report.daily.map(x=><div className="daily-row" key={x.day}><strong>{x.day.slice(0,3)}</strong><div className="bar"><span style={{width:`${Math.min(100,(x.periods/Math.max(1,...report.daily.map(y=>y.periods)))*100)}%`}}></span></div><b>{x.periods}</b></div>)}</div></section>
    </div>
    <section className="panel"><div className="panel-head"><div><h3>Unscheduled Classes</h3><p>Subjects where required weekly sessions exceed scheduled sessions.</p></div></div>{unscheduled.length?<div className="table-wrap"><table><thead><tr><th>Subject</th><th>Code</th><th>Faculty</th><th>Section</th><th>Required</th><th>Scheduled</th><th>Unscheduled</th></tr></thead><tbody>{unscheduled.map(x=><tr key={x.id}><td>{x.name}</td><td>{x.code}</td><td>{x.faculty}</td><td>{x.section}</td><td>{x.required}</td><td>{x.scheduled}</td><td className="missing-cell">{x.unscheduled}</td></tr>)}</tbody></table></div>:<div className="empty-state"><h3>No unscheduled classes</h3><p>All subject weekly requirements are currently covered.</p></div>}</section>
    <section className="panel"><div className="panel-head"><div><h3>Conflict & Validation Report</h3><p>Detailed issues detected by the reporting engine.</p></div></div><div className="view-tabs">{[["ALL","All"],["ERROR","Errors"],["WARNING","Warnings"]].map(([v,l])=><button key={v} className={filter===v?"view-tab active":"view-tab"} onClick={()=>setFilter(v)}>{l}</button>)}</div>{issues.length?<div className="validation-list">{issues.map((x,i)=><div className={`validation-item ${x.severity}`} key={`${x.category}-${i}`}><div className="validation-icon">{x.severity==="error"?<X size={16}/>:<Activity size={16}/>}</div><div><strong>{x.category}</strong><p>{x.message}</p></div></div>)}</div>:<div className="empty-state"><h3>No issues in this filter</h3><p>The current report contains no matching validation issues.</p></div>}</section>
  </div>
}


export function AuditLogs(){
  const [data,setData]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(""),[action,setAction]=useState(""),[category,setCategory]=useState(""),[page,setPage]=useState(1);
  async function load(){setLoading(true);setError("");try{const q=new URLSearchParams({page,limit:50});if(action)q.set("action",action);if(category)q.set("category",category);setData((await axios.get(`${API}/audit?${q.toString()}`)).data)}catch(e){setError(e.response?.data?.message||e.message)}finally{setLoading(false)}}
  useEffect(()=>{load()},[page,action,category]);
  async function clear(){if(!window.confirm("Delete all audit logs? This cannot be undone."))return;try{await axios.delete(`${API}/audit/clear`);setPage(1);await load()}catch(e){setError(e.response?.data?.message||e.message)}}
  if(loading&&!data)return <div className="panel"><h2>Audit Logs</h2><p>Loading audit history...</p></div>;
  return <div>
    <div className="analytics-toolbar"><div><h2>Audit Logs</h2><p>Track timetable generation, edits, moves, approvals, restores and administrative changes.</p></div><div className="form-actions"><button className="secondary" onClick={load}><RotateCcw size={15}/> Refresh</button>{authRole()==="ADMIN"&&<button className="secondary" onClick={clear}>Clear Logs</button>}</div></div>
    {error&&<div className="message error">{error}</div>}
    <section className="panel"><div className="view-filter"><div className="field"><label>Action</label><select value={action} onChange={e=>{setPage(1);setAction(e.target.value)}}><option value="">All actions</option>{(data?.actions||[]).map(x=><option key={x}>{x}</option>)}</select></div><div className="field"><label>Category</label><select value={category} onChange={e=>{setPage(1);setCategory(e.target.value)}}><option value="">All categories</option>{(data?.categories||[]).map(x=><option key={x}>{x}</option>)}</select></div></div>
      <div className="table-wrap"><table><thead><tr><th>Date/Time</th><th>User</th><th>Role</th><th>Action</th><th>Category</th><th>Description</th></tr></thead><tbody>{(data?.rows||[]).map(x=><tr key={x._id}><td>{new Date(x.createdAt).toLocaleString()}</td><td>{x.user?.name||x.username||"System"}</td><td>{x.role||"—"}</td><td><span className="audit-action">{x.action}</span></td><td>{x.category}</td><td>{x.description}</td></tr>)}</tbody></table></div>
      {!data?.rows?.length&&<div className="empty-state"><h3>No audit records</h3><p>Actions will appear here as users work with the timetable.</p></div>}
      <div className="audit-pagination"><span>{data?.total||0} record(s)</span><div><button className="secondary" disabled={page<=1} onClick={()=>setPage(page-1)}>Previous</button> <button className="secondary" disabled={page>=(data?.pages||1)} onClick={()=>setPage(page+1)}>Next</button></div></div>
    </section>
  </div>;
}


export function Optimization(){
  const [report,setReport]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(""),[busy,setBusy]=useState("");
  async function load(){setLoading(true);setError("");try{setReport((await axios.get(`${API}/timetable/optimization`)).data)}catch(e){setError(e.response?.data?.message||e.message)}finally{setLoading(false)}}
  useEffect(()=>{load()},[]);
  async function apply(s,c){
    setBusy(`${s.entryId||"new"}|${c.day}|${c.startTime}|${c.roomId||""}`);setError("");
    try{await axios.post(`${API}/timetable/optimization/apply`,{entryId:s.entryId,day:c.day,startTime:c.startTime,roomId:c.roomId});await load();}
    catch(e){setError(e.response?.data?.message||e.message)}finally{setBusy("")}
  }
  if(loading)return <div className="panel"><h2>Optimization Center</h2><p>Analyzing conflicts, availability and unscheduled classes...</p></div>;
  return <div>
    <div className="analytics-toolbar"><div><h2>Optimization Center</h2><p>Find practical alternative periods and rooms for timetable problems.</p></div><button className="secondary" onClick={load}><RotateCcw size={15}/> Re-analyze</button></div>
    <div className="optimization-note">Suggestions are generated without changing the timetable. Applying a suggestion is allowed only while the current timetable is <b>DRAFT</b>.</div>
    {error&&<div className="message error">{error}</div>}
    <div className="optimization-summary"><Metric label="Issues" value={report?.summary?.issues||0}/><Metric label="Suggestions" value={report?.summary?.suggestions||0}/><Metric label="Status" value={report?.status||"DRAFT"}/></div>
    <section className="panel"><div className="panel-head"><div><h3>Suggested Resolutions</h3><p>Higher-scoring alternatives are shown first.</p></div></div>
      {!report?.suggestions?.length?<div className="optimization-empty"><h3>✓ No optimization candidates needed</h3><p>The current timetable has no detected issue for which this optimizer can provide an alternative.</p></div>:
      <div className="optimization-list">{report.suggestions.map((s,i)=><div className="optimization-card" key={`${s.type}-${s.entryId||i}`}><div className="optimization-card-head"><div><span className="optimization-badge">{s.type.replaceAll("_"," ")}</span><h3 style={{marginTop:8}}>{s.subject}</h3><div className="optimization-reason">{s.reason}</div><small>{s.faculty} · {s.section}</small></div><span className="notification-pill IMPORTANT">{s.candidates.length} option{s.candidates.length===1?"":"s"}</span></div><div className="suggestion-grid">{s.candidates.map((c,j)=>{const key=`${s.entryId||"new"}|${c.day}|${c.startTime}|${c.roomId||""}`;return <div className="suggestion" key={key}><strong>{c.day}</strong><small>{c.startTime} – {c.endTime}<br/>{c.room||"Room"}<br/>Score: {c.score}</small><button className="primary full" disabled={!s.entryId||busy===key||report.status!=="DRAFT"} onClick={()=>apply(s,c)}>{busy===key?"Applying...":"Apply"}</button></div>})}</div></div>)}</div>}
    </section>
  </div>;
}


export function Validation(){
  const [report,setReport]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(""),[filter,setFilter]=useState("ALL");
  async function load(){setLoading(true);setError("");try{setReport((await axios.get(`${API}/timetable/validation`)).data)}catch(e){setError(e.response?.data?.message||e.message)}finally{setLoading(false)}}
  useEffect(()=>{load()},[]);
  if(loading)return <div className="panel"><h3>Validation Center</h3><p>Checking timetable conflicts and constraints...</p></div>;
  if(error)return <div className="panel"><h3>Validation Center</h3><div className="message error">{error}</div><button className="primary" onClick={load}>Retry</button></div>;
  if(!report?.hasTimetable)return <div className="panel"><h3>Validation Center</h3><div className="empty-state"><h3>No timetable generated</h3><p>Generate a timetable first.</p></div></div>;
  const issues=(report.issues||[]).filter(x=>filter==="ALL"||x.severity===filter.toLowerCase());
  return <div>
    <div className="analytics-toolbar"><div><h2>Validation Center</h2><p>Check conflicts, availability, room rules, workload limits and coverage.</p></div><button className="secondary" onClick={load}><RotateCcw size={15}/> Run Validation</button></div>
    <div className="cards analytics-cards"><Metric label="Errors" value={report.summary.errors}/><Metric label="Warnings" value={report.summary.warnings}/><Metric label="Classes" value={report.summary.entries}/><Metric label="Issues" value={report.summary.total}/></div>
    <div className="view-tabs">{[["ALL","All"],["ERROR","Errors"],["WARNING","Warnings"]].map(([v,l])=><button key={v} className={filter===v?"view-tab active":"view-tab"} onClick={()=>setFilter(v)}>{l}</button>)}</div>
    <section className="panel"><div className="panel-head"><div><h3>{issues.length ? `${issues.length} issue${issues.length===1?"":"s"}` : "No issues found"}</h3><p>{issues.length?"Review the items below before publishing the timetable.":"The generated timetable passed the available validation checks."}</p></div></div>
      {issues.length?<div className="validation-list">{issues.map((x,i)=><div className={`validation-item ${x.severity.toLowerCase()}`} key={`${x.category}-${i}`}><div className="validation-icon">{x.severity==='error'?<X size={16}/>:<Activity size={16}/>}</div><div><strong>{x.category}</strong><p>{x.message}</p></div></div>)}</div>:<div className="empty-state"><h3>✓ Timetable is valid</h3><p>No faculty, section, room or configured constraint conflicts were detected.</p></div>}
    </section>
  </div>
}


export function ChangeHistory({activeSession,versionList}){
  const [fromId,setFromId]=useState(""),[toId,setToId]=useState(""),[result,setResult]=useState(null),[loading,setLoading]=useState(false),[error,setError]=useState("");
  const versions=(versionList||[]).filter(v=>!activeSession||String(v.academicSession?._id||v.academicSession)===String(activeSession._id));
  useEffect(()=>{if(versions.length>=2){const ordered=[...versions].sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));setFromId(String(ordered[ordered.length-2]._id));setToId(String(ordered[ordered.length-1]._id));}else if(versions.length===1){setFromId("");setToId(String(versions[0]._id));}else{setFromId("");setToId("");}setResult(null);setError("");},[activeSession?._id,versionList?.length]);
  async function compare(){if(!fromId||!toId){setError("Select both timetable versions.");return}if(fromId===toId){setError("Select two different timetable versions.");return}setLoading(true);setError("");try{setResult((await axios.get(`${API}/timetable/change-history?fromId=${encodeURIComponent(fromId)}&toId=${encodeURIComponent(toId)}${activeSession?`&sessionId=${encodeURIComponent(activeSession._id)}`:""}`)).data)}catch(e){setError(e.response?.data?.message||e.message);setResult(null)}finally{setLoading(false)}}
  const changes=result?.changes||[];
  return <div>
    <div className="analytics-toolbar"><div><h2><History size={22} style={{verticalAlign:"-4px",marginRight:7}}/> Timetable Change History</h2><p>Compare two versions and see which classes were added, removed, moved or updated.</p></div><button className="primary" onClick={compare} disabled={loading||!fromId||!toId}>{loading?"Comparing...":"Compare Versions"}</button></div>
    {error&&<div className="message error">{error}</div>}
    <section className="panel"><div className="change-history-selectors"><div className="field"><label>Older / From Version</label><select value={fromId} onChange={e=>{setFromId(e.target.value);setResult(null)}}><option value="">Select version...</option>{versions.map(v=><option key={v._id} value={v._id}>{v.versionLabel||`Version ${v.version}`} · {v.status} · {new Date(v.createdAt).toLocaleString()}</option>)}</select></div><div className="change-arrow">→</div><div className="field"><label>Newer / To Version</label><select value={toId} onChange={e=>{setToId(e.target.value);setResult(null)}}><option value="">Select version...</option>{versions.map(v=><option key={v._id} value={v._id}>{v.versionLabel||`Version ${v.version}`} · {v.status} · {new Date(v.createdAt).toLocaleString()}</option>)}</select></div></div>{!versions.length&&<div className="empty-state"><h3>No timetable versions</h3><p>Generate at least one timetable version for the active academic session.</p></div>}{versions.length===1&&<div className="message">Only one version is available. Generate another version to compare changes.</div>}</section>
    {result&&<><div className="cards change-summary-cards"><Metric label="Total Changes" value={result.summary.total}/><Metric label="Added" value={result.summary.added}/><Metric label="Removed" value={result.summary.removed}/><Metric label="Moved" value={result.summary.moved}/><Metric label="Updated" value={result.summary.updated}/></div><section className="panel"><div className="panel-head"><div><h3>{result.from.versionLabel||`Version ${result.from.version}`} → {result.to.versionLabel||`Version ${result.to.version}`}</h3><p>{result.from.academicSession||""} · {new Date(result.from.createdAt).toLocaleString()} → {new Date(result.to.createdAt).toLocaleString()}</p></div></div>{changes.length?<div className="change-history-list">{changes.map((x,i)=><div className={`change-history-item ${x.type.toLowerCase()}`} key={i}><div className="change-type">{x.type}</div><div className="change-main"><strong>{x.after?.subject||x.before?.subject||"Class"}{(x.after?.subjectCode||x.before?.subjectCode)?` (${x.after?.subjectCode||x.before?.subjectCode})`:""}</strong><span>{x.after?.section||x.before?.section||"Section"} · {x.after?.faculty||x.before?.faculty||"Faculty"}</span>{x.type==="ADDED"&&<p>New class: {x.after.day}, {x.after.startTime}–{x.after.endTime} · Room {x.after.room}</p>}{x.type==="REMOVED"&&<p>Removed class: {x.before.day}, {x.before.startTime}–{x.before.endTime} · Room {x.before.room}</p>}{x.type!=="ADDED"&&x.type!=="REMOVED"&&(x.fields||[]).map(f=><div className="change-field" key={f.field}><b>{f.label}</b><span>{f.before}</span><em>→</em><span>{f.after}</span></div>)}</div></div>)}</div>:<div className="empty-state"><h3>No schedule changes detected</h3><p>The selected timetable versions contain the same class placements.</p></div>}</section></>}
  </div>;
}


export function Analytics(){
  const [report,setReport]=useState(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  async function load(){
    setLoading(true);setError("");
    try{const r=await axios.get(`${API}/analytics`);setReport(r.data)}catch(e){setError(e.response?.data?.message||e.message)}finally{setLoading(false)}
  }
  useEffect(()=>{load()},[]);
  if(loading) return <div className="panel"><h3>Analytics</h3><p>Loading timetable analytics...</p></div>;
  if(error) return <div className="panel"><h3>Analytics</h3><div className="message error">{error}</div><button className="primary" onClick={load}>Retry</button></div>;
  if(!report?.hasTimetable) return <div className="panel"><h3>Analytics</h3><div className="empty-state"><h3>No timetable generated</h3><p>Generate a timetable first to view workload and utilization analytics.</p></div></div>;
  return <div>
    <div className="analytics-toolbar"><div><h2>Timetable Analytics</h2><p>Workload, room utilization, section load and generation coverage.</p></div><button className="secondary" onClick={load}><RotateCcw size={15}/> Refresh</button></div>
    <div className="cards analytics-cards">
      <Metric label="Required Sessions" value={report.summary.requiredSessions}/>
      <Metric label="Scheduled Sessions" value={report.summary.scheduledSessions}/>
      <Metric label="Coverage" value={`${report.summary.coverage}%`}/>
      <Metric label="Unscheduled" value={report.summary.unscheduledSessions}/>
    </div>
    <div className="analytics-grid">
      <section className="panel"><div className="panel-head"><div><h3>Faculty Workload</h3><p>Scheduled periods by faculty.</p></div></div><div className="table-wrap"><table><thead><tr><th>Faculty</th><th>Classes</th><th>Periods</th><th>Days</th><th>Utilization</th></tr></thead><tbody>{report.faculty.map(x=><tr key={x.id}><td>{x.name}</td><td>{x.classes}</td><td>{x.periods}</td><td>{x.days}</td><td><Progress value={x.utilization}/></td></tr>)}</tbody></table></div></section>
      <section className="panel"><div className="panel-head"><div><h3>Room Utilization</h3><p>Occupied periods against available timetable periods.</p></div></div><div className="table-wrap"><table><thead><tr><th>Room</th><th>Type</th><th>Classes</th><th>Periods</th><th>Utilization</th></tr></thead><tbody>{report.rooms.map(x=><tr key={x.id}><td>{x.name}</td><td>{x.type}</td><td>{x.classes}</td><td>{x.periods}</td><td><Progress value={x.utilization}/></td></tr>)}</tbody></table></div></section>
      <section className="panel"><div className="panel-head"><div><h3>Section Workload</h3><p>Scheduled periods by section.</p></div></div><div className="table-wrap"><table><thead><tr><th>Section</th><th>Classes</th><th>Periods</th><th>Coverage</th></tr></thead><tbody>{report.sections.map(x=><tr key={x.id}><td>{x.label}</td><td>{x.classes}</td><td>{x.periods}</td><td><Progress value={x.coverage}/></td></tr>)}</tbody></table></div></section>
      <section className="panel"><div className="panel-head"><div><h3>Daily Distribution</h3><p>Scheduled periods across the week.</p></div></div><div className="daily-chart">{report.daily.map(x=><div className="daily-row" key={x.day}><strong>{x.day.slice(0,3)}</strong><div className="bar"><span style={{width:`${Math.min(100,(x.periods/Math.max(1,report.dailyMax))*100)}%`}}></span></div><b>{x.periods}</b></div>)}</div></section>
    </div>
    {report.warnings?.length>0&&<div className="warning">{report.warnings.join(" ")}</div>}
  </div>
}
