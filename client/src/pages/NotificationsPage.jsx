import React, {useEffect, useState} from "react";
import axios from "axios";
import {API} from "../core/api";
import {Users, Trash2, Bell, RefreshCw, History} from "lucide-react";

export default function Notifications({auth,data,setMessage}){
  const canManage=["ADMIN","SCHEDULER"].includes(auth.role);
  const [items,setItems]=useState([]);
  const [changes,setChanges]=useState([]);
  const [users,setUsers]=useState([]);
  const [sectionId,setSectionId]=useState("");
  const [loading,setLoading]=useState(true);
  const [form,setForm]=useState({title:"",message:"",priority:"NORMAL",audience:"ALL",faculty:"",section:"",user:"",published:true,startAt:"",endAt:""});

  async function load(){
    setLoading(true);
    try{
      const query=canManage&&sectionId?`?sectionId=${sectionId}`:"";
      const [r,c]=await Promise.all([axios.get(`${API}/notifications/mine${query}`),axios.get(`${API}/notifications/timetable-changes${query}`)]);
      setItems(r.data||[]); setChanges(c.data||[]);
      if(canManage){try{const u=await axios.get(`${API}/auth/users`);setUsers(u.data||[])}catch{}}
    }catch(e){setMessage(e.response?.data?.message||e.message)}finally{setLoading(false)}
  }
  useEffect(()=>{load()},[sectionId]);

  async function create(){
    if(!form.title.trim()||!form.message.trim()) return setMessage("Notification title and message are required.");
    try{await axios.post(`${API}/notifications`,form);setForm({title:"",message:"",priority:"NORMAL",audience:"ALL",faculty:"",section:"",user:"",published:true,startAt:"",endAt:""});setMessage("Announcement published.");await load();}
    catch(e){setMessage(e.response?.data?.message||e.message)}
  }
  async function remove(id){if(!confirm("Delete this announcement?"))return;try{await axios.delete(`${API}/notifications/${id}`);setMessage("Announcement deleted.");await load()}catch(e){setMessage(e.response?.data?.message||e.message)}}
  async function markRead(id){try{await axios.post(`${API}/notifications/${id}/read`);setItems(items.map(x=>x._id===id?{...x,read:true}:x))}catch(e){setMessage(e.response?.data?.message||e.message)}}
  async function markAll(){try{await axios.post(`${API}/notifications/read-all`);setItems(items.map(x=>({...x,read:true})));setMessage("All visible notifications marked as read.")}catch(e){setMessage(e.response?.data?.message||e.message)}}

  return <div>
    <div className="notification-toolbar"><div><h2>Notifications & Announcements</h2></div><div className="form-actions"><button className="secondary" onClick={load}><RefreshCw size={15}/> Refresh</button><button className="secondary" onClick={markAll}>Mark all read</button></div></div>
    {canManage&&<div className="notification-grid">
      <section className="panel"><div className="panel-head"><div><h3>Create Announcement</h3></div></div>
        <div className="notification-form">
          <label>Title<input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="e.g. Timetable updated"/></label>
          <label>Message<textarea value={form.message} onChange={e=>setForm({...form,message:e.target.value})} placeholder="Write the announcement..."/></label>
          <div className="form-grid"><label>Priority<select value={form.priority} onChange={e=>setForm({...form,priority:e.target.value})}><option>NORMAL</option><option>IMPORTANT</option><option>URGENT</option></select></label><label>Audience<select value={form.audience} onChange={e=>setForm({...form,audience:e.target.value})}><option>ALL</option><option>FACULTY</option><option>SECTION</option><option>USER</option></select></label></div>
          {form.audience==="FACULTY"&&<label>Faculty<select value={form.faculty} onChange={e=>setForm({...form,faculty:e.target.value})}><option value="">Select faculty</option>{data.faculty.map(f=><option key={f._id} value={f._id}>{f.name}</option>)}</select></label>}
          {form.audience==="SECTION"&&<label>Section<select value={form.section} onChange={e=>setForm({...form,section:e.target.value})}><option value="">Select section</option>{data.sections.map(s=><option key={s._id} value={s._id}>{s.program} {s.semester} - {s.name}</option>)}</select></label>}
          {form.audience==="USER"&&<label>User<select value={form.user} onChange={e=>setForm({...form,user:e.target.value})}><option value="">Select user</option>{users.map(u=><option key={u._id} value={u._id}>{u.name} ({u.username})</option>)}</select></label>}
          <div className="form-grid"><label>Start<input type="datetime-local" value={form.startAt} onChange={e=>setForm({...form,startAt:e.target.value})}/></label><label>End<input type="datetime-local" value={form.endAt} onChange={e=>setForm({...form,endAt:e.target.value})}/></label></div>
          <label className="setting-check"><input type="checkbox" checked={form.published} onChange={e=>setForm({...form,published:e.target.checked})}/><span><b>Publish immediately</b><small>Users can see it during its active date range.</small></span></label>
          <div className="notification-actions"><button className="primary" onClick={create}><Bell size={15}/> Publish Announcement</button></div>
        </div>
      </section>
      <section className="panel"><div className="panel-head"><div><h3>Notification Management</h3></div></div><div className="notification-table-wrap"><table className="notification-table"><thead><tr><th>Title</th><th>Audience</th><th>Priority</th><th>Published</th><th></th></tr></thead><tbody>{items.map(n=><tr key={n._id}><td>{n.title}</td><td>{n.audience}</td><td><span className={`notification-pill ${n.priority}`}>{n.priority}</span></td><td>{n.published?"Yes":"No"}</td><td><button className="secondary" onClick={()=>remove(n._id)}><Trash2 size={14}/></button></td></tr>)}</tbody></table></div></section>
    </div>}

    {!canManage&&<section className="panel"><div className="panel-head"><div><h3>Relevant notifications</h3><p>Only announcements for your account and assigned teaching or section scope are shown.</p></div></div></section>}
    <section className="panel timetable-change-panel"><div className="panel-head"><div><h3><History size={17}/> My Timetable Changes</h3><p>Changes relevant to your faculty, section, or user account are shown here.</p></div><span className="notification-pill">{changes.length} change{changes.length===1?"":"s"}</span></div>{!changes.length?<div className="notification-empty">No timetable-specific changes are available for your account.</div>:<div className="timetable-change-list">{changes.map(n=>{const m=n.metadata||{};return <article className={`timetable-change-card ${n.read?"":"unread"}`} key={n._id}><div className="timetable-change-icon"><History size={16}/></div><div className="timetable-change-body"><div className="notification-top"><h3>{n.title}</h3><span className={`notification-pill ${n.priority}`}>{n.priority}</span></div><p>{n.message}</p><div className="notification-meta"><span>{m.subjectName||"Timetable"}</span>{m.day&&<span>{m.day}</span>}{m.startTime&&<span>{m.startTime}{m.endTime?`–${m.endTime}`:""}</span>}{m.fromRoom&&<span>Room: {m.fromRoom} → {m.toRoom||""}</span>}{n.section&&<span>Section: {n.section.name}</span>}{n.faculty&&<span>Faculty: {n.faculty.name}</span>}<span>{new Date(n.createdAt).toLocaleString()}</span></div>{!n.read&&<div className="notification-actions"><button className="secondary" onClick={()=>markRead(n._id)}>Mark as read</button></div>}</div></article>})}</div>}</section>

    <section className="panel"><div className="panel-head"><div><h3>{loading?"Loading...":`${items.length} notification${items.length===1?"":"s"}`}</h3><p>Unread items are highlighted.</p></div></div>{loading?<p>Loading notifications...</p>:!items.length?<div className="notification-empty">No active notifications.</div>:<div className="notification-grid">{items.map(n=><article className={`notification-card ${n.read?"":"unread"}`} key={n._id}><div className="notification-top"><h3>{!n.read&&<span className="notification-unread"/>} {n.title}</h3><span className={`notification-pill ${n.priority}`}>{n.priority}</span></div><div className="notification-message">{n.message}</div><div className="notification-meta"><span>{n.audience}</span>{n.faculty&&<span>Faculty: {n.faculty.name}</span>}{n.section&&<><span>Section: {n.section.name}</span><span>{n.section.program} {n.section.semester}</span></>}{n.createdBy&&<span>By {n.createdBy.name}</span>}<span>{new Date(n.createdAt).toLocaleString()}</span></div>{!n.read&&<div className="notification-actions"><button className="secondary" onClick={()=>markRead(n._id)}>Mark as read</button></div>}</article>)}</div>}</section>
  </div>;
}
