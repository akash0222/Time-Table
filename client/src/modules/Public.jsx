import React, {useEffect, useMemo, useState} from "react";
import {useParams} from "react-router-dom";
import axios from "axios";
import {CalendarDays, Users, BookOpen, DoorOpen, Clock3, WandSparkles, Database, Trash2, Settings2, Check, X, FileSpreadsheet, Upload, Lock, Send, RotateCcw, ShieldCheck, BarChart3, Activity, Bell, UserCheck, RefreshCw, Copy, QrCode, History, ClipboardCheck, UserPlus, DollarSign, GraduationCap, Search, ArrowRight, UsersRound} from "lucide-react";
import {API, days, apiName, refId} from "../core/api";
import {Input, Select} from "../components/FormControls";
import {Metric, Progress} from "../components/Metrics";
import {localToday, authRole} from "../core/helpers";

export function PublicSharing({data,setMessage}){
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
    <div className="analytics-toolbar"><div><h2>Public Timetable Sharing</h2><p>Create secure read-only links without exposing the administration portal.</p></div><button className="secondary" onClick={load}><RefreshCw size={15}/> Refresh</button></div>
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
    <section className="panel"><div className="panel-head"><div><h3>Existing Share Links</h3><p>Disable or delete links at any time.</p></div></div>
      {!links.length?<div className="empty-state"><h3>No share links</h3><p>Create a link above after publishing a timetable.</p></div>:<div className="share-link-list">{links.map(l=>{
        const expired=l.expiresAt&&new Date(l.expiresAt)<new Date();
        return <div className="share-link-row" key={l._id}><div className="share-link-main"><div><strong>{labelFor(l)}</strong><span>{l.scope} · {l.timetable?.versionLabel||`Version ${l.timetable?.version||""}`} · {l.timetable?.status||""}</span></div><code>{publicUrl(l.token)}</code><small>{expired ? "Expired" : l.expiresAt ? `Expires ${new Date(l.expiresAt).toLocaleString()}` : "No expiry"} · {l.accessCount||0} access{(l.accessCount||0)===1?"":"es"}</small></div><div className="share-link-actions"><button className="secondary" onClick={()=>copy(l.token)}><Copy size={14}/> Copy</button><button className="secondary" onClick={()=>window.open(`${API}/public/share/${l.token}/qr`,"_blank","noopener,noreferrer")} disabled={expired||!l.active}><QrCode size={14}/> QR</button><button className={l.active&&!expired?"secondary":"primary"} onClick={()=>toggle(l._id)} disabled={expired}>{l.active?"Disable":"Enable"}</button><button className="secondary" onClick={()=>remove(l._id)}><Trash2 size={14}/> Delete</button></div></div>
      })}</div>}
    </section>
  </div>;
}


export function PublicShareView({token}){
  const [data,setData]=useState(null),[error,setError]=useState(""),[loading,setLoading]=useState(true),[day,setDay]=useState("ALL");
  useEffect(()=>{axios.get(`${API}/public/share/${token}`).then(r=>setData(r.data)).catch(e=>setError(e.response?.data?.message||"This public timetable link is unavailable.")).finally(()=>setLoading(false))},[token]);
  if(loading)return <div className="public-share-page"><div className="public-share-card"><CalendarDays size={40}/><h1>Timetable</h1><p>Loading shared timetable...</p></div></div>;
  if(error)return <div className="public-share-page"><div className="public-share-card"><X size={40}/><h1>Share link unavailable</h1><p>{error}</p></div></div>;
  const days2=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
  const rows=(data?.entries||[]).filter(e=>day==="ALL"||e.day===day).sort((a,b)=>days2.indexOf(a.day)-days2.indexOf(b.day)||Number(a.order||0)-Number(b.order||0));
  return <div className="public-share-page"><div className="public-share-shell"><div className="public-share-header"><div><div className="public-brand"><CalendarDays size={25}/> Time Table</div><h1>{data.title}</h1><p>{data.session?.name||"Academic timetable"} · {data.timetable?.versionLabel||`Version ${data.timetable?.version||""}`} · {data.timetable?.status}</p></div><div className="public-share-actions"><button className="secondary" onClick={()=>window.print()}>Print</button><button className="secondary" onClick={()=>window.open(`${API}/public/share/${token}/qr`,"_blank","noopener,noreferrer")}><QrCode size={15}/> QR Code</button></div></div><div className="public-share-toolbar"><div><strong>Read-only timetable</strong><small>Administration controls are not available from this link.</small></div><select value={day} onChange={e=>setDay(e.target.value)}><option value="ALL">All Days</option>{days2.map(d=><option key={d}>{d}</option>)}</select></div><div className="public-qr-panel"><div><strong>Mobile access</strong><p>Scan this QR code to open this read-only timetable on a phone.</p></div><img src={`${API}/public/share/${token}/qr`} alt="QR code for public timetable" /></div>{rows.length?<div className="public-class-grid">{rows.map((e,i)=><div className="public-class-card" key={e._id||i}><div className="public-time"><strong>{e.day}</strong><span>{e.startTime} – {e.endTime}</span></div><div><h3>{e.subject?.name||"Subject"}</h3>{e.subject?.code&&<small>{e.subject.code}</small>}<p>Faculty: {e.faculty?.name||"—"}</p><p>Section: {e.section?.name||"—"}</p><span className="public-room">Room: {e.room?.name||"—"}</span></div></div>)}</div>:<div className="public-empty">No classes are scheduled for this day.</div>}<div className="public-footer">Shared read-only timetable · {data.expiresAt?`Link expires ${new Date(data.expiresAt).toLocaleString()}`:"No expiry"}</div></div></div>;
}


export function PublicShareRoute(){
  const {token}=useParams();
  return <PublicShareView token={token}/>;
}

