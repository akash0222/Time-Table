import React from "react";
import axios from "axios";
import {API} from "../core/api";

export default function TimetableVersions({activeSession,versionList,setVersionList,setLatest,setMessage}){
  if(!activeSession)return <div className="panel"><div className="message warn">Activate an Academic Session to manage timetable versions.</div></div>;
  async function refresh(){const r=await axios.get(`${API}/timetable/versions?sessionId=${activeSession._id}`);setVersionList(r.data||[])}
  async function restore(id){
    if(!confirm("Restore this version as a new Draft?"))return;
    try{const r=await axios.post(`${API}/timetable/${id}/restore`);setLatest(r.data);await refresh();setMessage(`Restored as Version ${r.data.version}.`)}
    catch(e){setMessage(e.response?.data?.message||e.message)}
  }
  return <div className="panel">
    <div className="panel-head"><div><h3>Timetable Versions</h3><p>{activeSession.name}</p></div><button className="secondary" onClick={refresh}>Refresh</button></div>
    <div className="table-wrap"><table><thead><tr><th>Version</th><th>Status</th><th>Current</th><th>Created</th><th>Action</th></tr></thead>
    <tbody>{versionList.map(v=><tr key={v._id}><td>{v.versionLabel||`Version ${v.version}`}</td><td>{v.status}</td><td>{v.isCurrent?"YES":"NO"}</td><td>{v.createdAt?new Date(v.createdAt).toLocaleString():"—"}</td><td>{!v.isCurrent&&<button className="secondary" onClick={()=>restore(v._id)}>Restore</button>}</td></tr>)}</tbody></table></div>
  </div>
}
