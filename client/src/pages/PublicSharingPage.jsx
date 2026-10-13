import React, {useEffect, useState} from "react";
import axios from "axios";
import {API} from "../core/api";
import {days} from "../core/utils.js";
import {Trash2, RefreshCw, Copy, QrCode} from "lucide-react";

export default function PublicSharing({data,setMessage}){
  const [links,setLinks]=useState([]),[timelines,setTimelines]=useState([]),[scope,setScope]=useState("FULL"),[timetableId,setTimetableId]=useState(""),[section,setSection]=useState(""),[faculty,setFaculty]=useState(""),[expiresIn,setExpiresIn]=useState("7d"),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
  async function load(){
    setLoading(true);
    try{
      const [l,t]=await Promise.all([axios.get(`${API}/share-links`),axios.get(`${API}/shareable-timetables`)]);
      setLinks(l.data||[]);setTimelines(t.data||[]);
      if(!timetableId&&t.data?.[0])setTimetableId(t.data[0]._id);
    }catch(e){setMessage(e.response?.data?.message||e.message)}finally{setLoading(false)}
  }
  useEffect(()=>{load()},[]);
  async function create(){
    if(!timetableId)return setMessage("Select a published timetable first.");
    if(scope==="SECTION"&&!section)return setMessage("Select a section.");
    if(scope==="FACULTY"&&!faculty)return setMessage("Select a faculty member.");
    setBusy(true);
    try{
      await axios.post(`${API}/share-links`,{timetableId,scope,sectionId:scope==="SECTION"?section:null,facultyId:scope==="FACULTY"?faculty:null,expiresIn});
      setMessage("Public share link created successfully.");await load();
    }catch(e){setMessage(e.response?.data?.message||e.message)}finally{setBusy(false)}
  }
  async function toggle(id){try{await axios.patch(`${API}/share-links/${id}/toggle`);await load()}catch(e){setMessage(e.response?.data?.message||e.message)}}
  async function remove(id){if(!confirm("Delete this public share link?"))return;try{await axios.delete(`${API}/share-links/${id}`);await load()}catch(e){setMessage(e.response?.data?.message||e.message)}}
  function publicUrl(token){return `${window.location.origin}/share/${token}`}
  async function copy(token){try{await navigator.clipboard.writeText(publicUrl(token));setMessage("Public link copied to clipboard.")}catch{setMessage(publicUrl(token))}}
  const labelFor=l=>l.scope==="SECTION"?`${l.section?.program||""} · ${l.section?.semester||""} · ${l.section?.name||"Section"}`:l.scope==="FACULTY"?l.faculty?.name||"Faculty":"Complete timetable";
  return <div>
    <div className="analytics-toolbar"><div><h2>Public Timetable Sharing</h2></div><button className="secondary" onClick={load}><RefreshCw size={15}/> Refresh</button></div>
    <section className="panel share-create-panel">
      <div className="panel-head"><div><h3>Create Share Link</h3><p>Only published or locked timetable versions can be shared.</p></div></div>
      <div className="share-form-grid">
        <label>Timetable<select value={timetableId} onChange={e=>setTimetableId(e.target.value)}><option value="">Select published timetable</option>{timelines.map(t=><option key={t._id} value={t._id}>{t.academicSession?.name||"Session"} · {t.versionLabel||`Version ${t.version}`} · {t.status}</option>)}</select></label>
        <label>Audience<select value={scope} onChange={e=>setScope(e.target.value)}><option value="FULL">Complete timetable</option><option value="SECTION">Specific section</option><option value="FACULTY">Specific faculty</option></select></label>
        {scope==="SECTION"&&<label>Section<select value={section} onChange={e=>setSection(e.target.value)}><option value="">Select section</option>{data.sections.map(x=><option key={x._id} value={x._id}>{x.program} · {x.semester} · {x.name}</option>)}</select></label>}
        {scope==="FACULTY"&&<label>Faculty<select value={faculty} onChange={e=>setFaculty(e.target.value)}><option value="">Select faculty</option>{data.faculty.map(x=><option key={x._id} value={x._id}>{x.name}{x.code?` · ${x.code}`:""}</option>)}</select></label>}
        <label>Expires<select value={expiresIn} onChange={e=>setExpiresIn(e.target.value)}><option value="1h">1 hour</option><option value="1d">1 day</option><option value="7d">7 days</option><option value="30d">30 days</option><option value="never">Never</option></select></label>
      </div>
      <div className="share-actions"><button className="primary" onClick={create} disabled={busy||loading}>{busy?"Creating...":"Create Secure Link"}</button></div>
    </section>
    <section className="panel"><div className="panel-head"><div><h3>Existing Share Links</h3></div></div>
      {!links.length?<div className="empty-state"><h3>No share links</h3><p>Create a link above after publishing a timetable.</p></div>:<div className="share-link-list">{links.map(l=>{
        const expired=l.expiresAt&&new Date(l.expiresAt)<new Date();
        return <div className="share-link-row" key={l._id}><div className="share-link-main"><div><strong>{labelFor(l)}</strong><span>{l.scope} · {l.timetable?.versionLabel||`Version ${l.timetable?.version||""}`} · {l.timetable?.status||""}</span></div><code>{publicUrl(l.token)}</code><small>{expired ? "Expired" : l.expiresAt ? `Expires ${new Date(l.expiresAt).toLocaleString()}` : "No expiry"} · {l.accessCount||0} access{(l.accessCount||0)===1?"":"es"}</small></div><div className="share-link-actions"><button className="secondary" onClick={()=>copy(l.token)}><Copy size={14}/> Copy</button><button className="secondary" onClick={()=>window.open(`${API}/public/share/${l.token}/qr`,"_blank","noopener,noreferrer")} disabled={expired||!l.active}><QrCode size={14}/> QR</button><button className={l.active&&!expired?"secondary":"primary"} onClick={()=>toggle(l._id)} disabled={expired}>{l.active?"Disable":"Enable"}</button><button className="secondary" onClick={()=>remove(l._id)}><Trash2 size={14}/> Delete</button></div></div>
      })}</div>}
    </section>
  </div>;
}
