import React, {useState} from "react";
import axios from "axios";
import {API} from "../core/api";
import {Input} from "../components/SharedComponents.jsx";
import {Copy} from "lucide-react";

export default function TimetableTemplates({sessions,activeSession,setLatest,setMessage}){
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
