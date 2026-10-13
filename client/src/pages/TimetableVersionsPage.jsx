import React,{useState} from "react";
import axios from "axios";
import {API} from "../core/api";
import {RotateCcw,RefreshCw,History,AlertTriangle} from "lucide-react";

export default function TimetableVersions({activeSession,versionList,setVersionList,setLatest,setMessage,role}){
  const [restoreReason,setRestoreReason]=useState("");
  const [restoringId,setRestoringId]=useState("");
  const canRestore=["ADMIN","SCHEDULER"].includes(role);
  if(!activeSession)return <div className="panel"><div className="message warn">Activate an Academic Session to manage timetable versions.</div></div>;

  async function refresh(){
    try{
      const r=await axios.get(`${API}/timetable/versions`,{params:{sessionId:activeSession._id}});
      setVersionList(r.data||[]);
    }catch(e){setMessage(e.response?.data?.message||e.message||"Unable to refresh timetable versions.");}
  }

  async function restore(version){
    const reason=restoreReason.trim();
    if(!canRestore){setMessage("Only Admin or Scheduler can restore timetable versions.");return;}
    if(reason.length<3){setMessage("Enter a restoration reason of at least 3 characters.");return;}
    if(!confirm("Restore "+(version.versionLabel||("Version "+version.version))+" as a new Draft? The source version will remain in history."))return;
    setRestoringId(String(version._id));
    try{
      const r=await axios.post(`${API}/timetable/${version._id}/restore`,{sessionId:activeSession._id,note:reason});
      setLatest(r.data);
      setRestoreReason("");
      await refresh();
      setMessage(`Restored as ${r.data.versionLabel||("Version "+r.data.version)}. The previous version is preserved.`);
    }catch(e){setMessage(e.response?.data?.message||e.message||"Unable to restore this version.");}
    finally{setRestoringId("");}
  }

  const hasRestorableVersions=versionList.some(version=>!version.isCurrent);
  return <div className="panel">
    <div className="panel-head">
      <div><h3>Timetable Versions</h3><p>{activeSession.name}</p></div>
      <button className="secondary" onClick={refresh} disabled={Boolean(restoringId)}><RefreshCw size={14}/> Refresh</button>
    </div>
    {canRestore&&hasRestorableVersions&&<div className="version-restore-reason">
      <label htmlFor="legacy-version-restore-reason">Restoration reason (required)</label>
      <textarea id="legacy-version-restore-reason" rows={2} value={restoreReason} onChange={event=>setRestoreReason(event.target.value)} placeholder="Explain why this version needs to be restored…"/>
      <p><AlertTriangle size={13}/> Restoring creates a new Draft version; it never overwrites the selected version.</p>
    </div>}
    <div className="table-wrap"><table><thead><tr><th>Version</th><th>Status</th><th>Current</th><th>Created</th><th>Action</th></tr></thead>
    <tbody>{versionList.map(v=><tr key={v._id}><td>{v.versionLabel||`Version ${v.version}`}</td><td>{v.status}</td><td>{v.isCurrent?"YES":"NO"}</td><td>{v.createdAt?new Date(v.createdAt).toLocaleString():"—"}</td><td>{v.isCurrent?<span>Current</span>:canRestore?<button className="secondary" disabled={Boolean(restoringId)||restoreReason.trim().length<3} onClick={()=>restore(v)}><RotateCcw size={14}/>{restoringId===String(v._id)?"Restoring…":"Restore as Draft"}</button>:<span>Admin / Scheduler only</span>}</td></tr>)}</tbody></table></div>
  </div>
}
