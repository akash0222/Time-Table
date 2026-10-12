import React, {useEffect, useState} from "react";
import axios from "axios";
import {API} from "../core/api";
import {Metric} from "../components/SharedComponents.jsx";
import {RotateCcw} from "lucide-react";

export default function Optimization(){
  const [report,setReport]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(""),[busy,setBusy]=useState("");
  async function load(){setLoading(true);setError("");try{setReport((await axios.get(`${API}/timetable/optimization`)).data)}catch(e){setError(e.response?.data?.message||e.message)}finally{setLoading(false)}}
  useEffect(()=>{load()},[]);
  async function apply(s,c){
    setBusy(`${s.entryId||"new"}|${c.day}|${c.startTime}|${c.roomId||""}`);setError("");
    try{await axios.post(`${API}/timetable/optimization/apply`,{entryId:s.entryId,day:c.day,startTime:c.startTime,roomId:c.roomId});await load();}
    catch(e){setError(e.response?.data?.message||e.message)}finally{setBusy("")}
  }
  async function autoFix(){
    if(report?.status!=="DRAFT"){setError("Automatic fixes are available only while the timetable is DRAFT.");return;}
    if(!window.confirm("Apply the highest-scoring safe optimization suggestions automatically? The timetable will be changed.")) return;
    setBusy("AUTO_FIX");setError("");
    try{
      const r=await axios.post(`${API}/timetable/optimization/auto-fix`,{maxChanges:10});
      await load();
      if(r.data?.remaining) setError(`${r.data.applied?.length||0} change(s) applied. ${r.data.remaining} issue(s) remain for manual review.`);
    }catch(e){setError(e.response?.data?.message||e.message)}finally{setBusy("")}
  }
  if(loading)return <div className="panel"><h2>Optimization Center</h2><p>Analyzing conflicts, availability and unscheduled classes...</p></div>;
  return <div>
    <div className="analytics-toolbar"><div><h2>Optimization Center</h2><p>Find practical alternative periods and rooms for timetable problems.</p></div><div style={{display:"flex",gap:8,flexWrap:"wrap"}}><button className="secondary" onClick={load} disabled={busy==="AUTO_FIX"}><RotateCcw size={15}/> Re-analyze</button><button className="primary" onClick={autoFix} disabled={busy==="AUTO_FIX"||report?.status!=="DRAFT"||!(report?.summary?.suggestions)}> {busy==="AUTO_FIX"?"Applying Fixes...":"Fix Issues Automatically"}</button></div></div>
    <div className="optimization-note">Suggestions are generated without changing the timetable. Applying a suggestion is allowed only while the current timetable is <b>DRAFT</b>.</div>
    {error&&<div className="message error">{error}</div>}
    <div className="optimization-summary"><Metric label="Issues" value={report?.summary?.issues||0}/><Metric label="Suggestions" value={report?.summary?.suggestions||0}/><Metric label="Status" value={report?.status||"DRAFT"}/></div>
    <section className="panel"><div className="panel-head"><div><h3>Suggested Resolutions</h3><p>Higher-scoring alternatives are shown first.</p></div></div>
      {!report?.suggestions?.length?<div className="optimization-empty"><h3>✓ No optimization candidates needed</h3><p>The current timetable has no detected issue for which this optimizer can provide an alternative.</p></div>:
      <div className="optimization-list">{report.suggestions.map((s,i)=><div className="optimization-card" key={`${s.type}-${s.entryId||i}`}><div className="optimization-card-head"><div><span className="optimization-badge">{s.type.replaceAll("_"," ")}</span><h3 style={{marginTop:8}}>{s.subject}</h3><div className="optimization-reason">{s.reason}</div><small>{s.faculty} · {s.section}</small></div><span className="notification-pill IMPORTANT">{s.candidates.length} option{s.candidates.length===1?"":"s"}</span></div><div className="suggestion-grid">{s.candidates.map((c,j)=>{const key=`${s.entryId||"new"}|${c.day}|${c.startTime}|${c.roomId||""}`;return <div className="suggestion" key={key}><strong>{c.day}</strong><small>{c.startTime} – {c.endTime}<br/>{c.room||"Room"}<br/>Score: {c.score}</small><button className="primary full" disabled={!s.entryId||busy===key||report.status!=="DRAFT"} onClick={()=>apply(s,c)}>{busy===key?"Applying...":"Apply"}</button></div>})}</div></div>)}</div>}
    </section>
  </div>;
}
