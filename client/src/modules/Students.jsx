import React, {useEffect, useMemo, useState} from "react";
import axios from "axios";
import {CalendarDays, Users, BookOpen, DoorOpen, Clock3, WandSparkles, Database, Trash2, Settings2, Check, X, FileSpreadsheet, Upload, Lock, Send, RotateCcw, ShieldCheck, BarChart3, Activity, Bell, UserCheck, RefreshCw, Copy, QrCode, History, ClipboardCheck, UserPlus, DollarSign, GraduationCap, Search, ArrowRight, UsersRound} from "lucide-react";
import {API, days, apiName, refId} from "../core/api";
import {Input, Select} from "../components/FormControls";
import {Metric, Progress} from "../components/Metrics";
import {localToday, authRole} from "../core/helpers";

export function Students({data,reload,setMessage}){
  const blank={admissionNo:"",rollNo:"",name:"",email:"",phone:"",gender:"",dateOfBirth:"",fatherName:"",motherName:"",category:"",address:"",city:"",state:"",pincode:"",section:"",active:true};
  const [form,setForm]=useState(blank),[editingId,setEditingId]=useState(null),[saving,setSaving]=useState(false),[q,setQ]=useState(""),[sectionId,setSectionId]=useState("");
  const list=(data.students||[]).filter(s=>!sectionId||refId(s.section)===sectionId).filter(s=>!q||`${s.name} ${s.admissionNo} ${s.rollNo}`.toLowerCase().includes(q.toLowerCase()));
  function edit(s){setEditingId(s._id);setForm({admissionNo:s.admissionNo||"",rollNo:s.rollNo||"",name:s.name||"",email:s.email||"",phone:s.phone||"",gender:s.gender||"",dateOfBirth:s.dateOfBirth?String(s.dateOfBirth).slice(0,10):"",fatherName:s.fatherName||"",motherName:s.motherName||"",category:s.category||"",address:s.address||"",city:s.city||"",state:s.state||"",pincode:s.pincode||"",section:refId(s.section),active:s.active!==false});window.scrollTo({top:0,behavior:"smooth"})}
  function reset(){setEditingId(null);setForm(blank)}
  async function save(){if(!form.admissionNo||!form.rollNo||!form.name||!form.section)return setMessage("Admission No, Roll No, Name and Section are required.");setSaving(true);try{if(editingId)await axios.put(`${API}/students/${editingId}`,form);else await axios.post(`${API}/students`,form);setMessage(editingId?"Student updated successfully.":"Student added successfully.");reset();await reload()}catch(e){setMessage(e.response?.data?.message||e.message)}finally{setSaving(false)}}
  async function deactivate(id){if(!confirm("Mark this student inactive? Historical attendance will be retained."))return;try{await axios.delete(`${API}/students/${id}`);await reload();setMessage("Student marked inactive.")}catch(e){setMessage(e.response?.data?.message||e.message)}}
  return <div>
    <section className="panel"><div className="panel-head"><div><h3><Users size={17}/> Student Management</h3><p>Maintain the student roster used by attendance. Historical attendance remains available when a student is made inactive.</p></div><span className="status-badge approved">{data.students?.length||0} Students</span></div>
      <div className="form-grid">
        <Input label="Admission No" value={form.admissionNo} onChange={v=>setForm({...form,admissionNo:v})}/><Input label="Roll No" value={form.rollNo} onChange={v=>setForm({...form,rollNo:v})}/><Input label="Student Name" value={form.name} onChange={v=>setForm({...form,name:v})}/><Input label="Email" value={form.email} onChange={v=>setForm({...form,email:v})}/><Input label="Phone" value={form.phone} onChange={v=>setForm({...form,phone:v})}/><Select label="Gender" value={form.gender} options={[["","Select"],["Male","Male"],["Female","Female"],["Other","Other"]]} onChange={v=>setForm({...form,gender:v})}/><Input label="Date of Birth" type="date" value={form.dateOfBirth} onChange={v=>setForm({...form,dateOfBirth:v})}/><Input label="Father Name" value={form.fatherName} onChange={v=>setForm({...form,fatherName:v})}/><Input label="Mother Name" value={form.motherName} onChange={v=>setForm({...form,motherName:v})}/><Input label="Category" value={form.category} onChange={v=>setForm({...form,category:v})}/><Input label="Address" value={form.address} onChange={v=>setForm({...form,address:v})}/><Input label="City" value={form.city} onChange={v=>setForm({...form,city:v})}/><Input label="State" value={form.state} onChange={v=>setForm({...form,state:v})}/><Input label="Pincode" value={form.pincode} onChange={v=>setForm({...form,pincode:v})}/><Select label="Section" value={form.section} options={(data.sections||[]).map(s=>[s._id,`${s.program||""} · ${s.semester||""} · ${s.name}`])} onChange={v=>setForm({...form,section:v})}/>
        <div className="field"><label>Status</label><label style={{display:"flex",gap:8,alignItems:"center"}}><input type="checkbox" checked={form.active!==false} onChange={e=>setForm({...form,active:e.target.checked})}/> Active student</label></div>
        <div className="form-actions"><button className="primary add" onClick={save} disabled={saving}><UserPlus size={15}/>{saving?(editingId?"Updating...":"Adding..."):(editingId?"Update Student":"Add Student")}</button>{editingId&&<button className="secondary" onClick={reset}>Cancel</button>}</div>
      </div>
    </section>
    <section className="panel"><div className="view-filter" style={{display:"flex",gap:12,flexWrap:"wrap"}}><input placeholder="Search name, admission or roll no..." value={q} onChange={e=>setQ(e.target.value)}/><select value={sectionId} onChange={e=>setSectionId(e.target.value)}><option value="">All Sections</option>{(data.sections||[]).map(s=><option key={s._id} value={s._id}>{s.program} · {s.semester} · {s.name}</option>)}</select></div><div className="table-wrap"><table><thead><tr><th>Admission No</th><th>Roll No</th><th>Name</th><th>Section</th><th>Status</th><th>Actions</th></tr></thead><tbody>{list.map(s=><tr key={s._id}><td>{s.admissionNo}</td><td>{s.rollNo}</td><td><strong>{s.name}</strong><div className="muted">{s.email||s.phone||""}</div></td><td>{s.section?.program||""} · {s.section?.semester||""} · {s.section?.name||""}</td><td>{s.active!==false?<span className="status-badge approved">ACTIVE</span>:<span className="status-badge">INACTIVE</span>}</td><td><div style={{display:"flex",gap:6}}><button className="secondary" onClick={()=>edit(s)}>Edit</button>{s.active!==false&&<button className="secondary" onClick={()=>deactivate(s._id)}>Deactivate</button>}</div></td></tr>)}{!list.length&&<tr><td colSpan="6">No students found.</td></tr>}</tbody></table></div></section>
  </div>
}


export function StudentProfile({data,setMessage}){
  const [q,setQ]=useState("");
  const [sectionId,setSectionId]=useState("");
  const [selectedId,setSelectedId]=useState("");
  const [profile,setProfile]=useState(null);
  const [loading,setLoading]=useState(false);
  const [view,setView]=useState("OVERVIEW");
  const students=(data.students||[]).filter(s=>!sectionId||refId(s.section)===sectionId).filter(s=>!q||`${s.name} ${s.admissionNo} ${s.rollNo}`.toLowerCase().includes(q.toLowerCase()));
  async function openProfile(id){
    setSelectedId(id);setLoading(true);setView("OVERVIEW");
    try{const r=await axios.get(`${API}/student-profiles/${id}`);setProfile(r.data)}catch(e){setMessage(e.response?.data?.message||e.message);setProfile(null)}finally{setLoading(false)}
  }
  const s=profile?.student;
  const money=v=>`₹${Number(v||0).toLocaleString("en-IN")}`;
  const pct=profile?.summary?.attendance?.percentage||0;
  return <div className="student-profile-page">
    <section className="panel">
      <div className="panel-head"><div><h3>Student Profiles</h3><p>Search a student to view identity, academic history, attendance and fee information in one place.</p></div><span className="status-badge approved">{data.students?.length||0} Students</span></div>
      <div className="profile-search-bar"><div className="profile-search"><Search size={17}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search name, admission no. or roll no..."/></div><select value={sectionId} onChange={e=>setSectionId(e.target.value)}><option value="">All Sections</option>{(data.sections||[]).map(x=><option key={x._id} value={x._id}>{x.program} · {x.semester} · {x.name}</option>)}</select></div>
      <div className="profile-student-grid" style={{marginTop:14}}>{students.slice(0,24).map(x=><button type="button" key={x._id} className={`profile-student-card ${selectedId===x._id?"selected":""}`} onClick={()=>openProfile(x._id)}><div className="profile-student-top"><span className="profile-avatar">{(x.name||"S").slice(0,1).toUpperCase()}</span><span className="profile-student-main"><strong>{x.name}</strong><span>{x.admissionNo} · Roll {x.rollNo}</span><small>{x.section?.program||""} · {x.section?.semester||""} · {x.section?.name||""}</small></span>{x.active!==false?<span className="status-badge approved">Active</span>:<span className="status-badge">Inactive</span>}</div></button>)}{!students.length&&<div className="empty-state" style={{gridColumn:"1/-1"}}><h3>No students found</h3><p>Try a different search or section.</p></div>}</div>
    </section>
    {loading&&<section className="panel"><p>Loading student profile...</p></section>}
    {s&&<>
      <section className="panel">
        <div className="profile-header"><div className="profile-identity"><span className="profile-big-avatar">{(s.name||"S").slice(0,1).toUpperCase()}</span><div><h2>{s.name}</h2><p>{s.admissionNo} · Roll {s.rollNo} · {s.section?.program||""} · {s.section?.semester||""} · {s.section?.name||""}</p></div></div><div className="profile-actions"><span className={`status-badge ${s.active!==false?"approved":""}`}>{s.active!==false?"ACTIVE":"INACTIVE"}</span></div></div>
        <div className="profile-summary" style={{marginTop:18}}><div className="profile-stat"><span>Attendance</span><strong>{pct}%</strong></div><div className="profile-stat"><span>Classes Marked</span><strong>{profile.summary.attendance.marked}</strong></div><div className="profile-stat"><span>Fee Billed</span><strong>{money(profile.summary.fees.billed)}</strong></div><div className="profile-stat"><span>Outstanding</span><strong>{money(profile.summary.fees.balance)}</strong></div></div>
        <div className="profile-tabs"><button className={view==="OVERVIEW"?"active":""} onClick={()=>setView("OVERVIEW")}>Overview</button><button className={view==="ATTENDANCE"?"active":""} onClick={()=>setView("ATTENDANCE")}>Attendance</button><button className={view==="FEES"?"active":""} onClick={()=>setView("FEES")}>Fees</button><button className={view==="ACADEMIC"?"active":""} onClick={()=>setView("ACADEMIC")}>Academic History</button></div>
      </section>
      {view==="OVERVIEW"&&<div className="profile-two-col"><section className="panel"><div className="panel-head"><div><h3>Personal Information</h3><p>Student identity and contact details.</p></div></div><div className="profile-detail-grid"><div className="profile-detail"><span>Gender</span><strong>{s.gender||"—"}</strong></div><div className="profile-detail"><span>Date of Birth</span><strong>{s.dateOfBirth?String(s.dateOfBirth).slice(0,10):"—"}</strong></div><div className="profile-detail"><span>Email</span><strong>{s.email||"—"}</strong></div><div className="profile-detail"><span>Phone</span><strong>{s.phone||"—"}</strong></div><div className="profile-detail"><span>Father's Name</span><strong>{s.fatherName||"—"}</strong></div><div className="profile-detail"><span>Mother's Name</span><strong>{s.motherName||"—"}</strong></div><div className="profile-detail"><span>Category</span><strong>{s.category||"—"}</strong></div><div className="profile-detail"><span>Admission Date</span><strong>{s.admissionDate?String(s.admissionDate).slice(0,10):"—"}</strong></div><div className="profile-detail full" style={{gridColumn:"1/-1"}}><span>Address</span><strong>{[s.address,s.city,s.state,s.pincode].filter(Boolean).join(", ")||"—"}</strong></div></div></section><section className="panel"><div className="panel-head"><div><h3>Academic Snapshot</h3><p>Current enrollment and movement history.</p></div></div><div className="profile-detail-grid"><div className="profile-detail"><span>Current Program</span><strong>{s.section?.program||"—"}</strong></div><div className="profile-detail"><span>Current Semester</span><strong>{s.section?.semester||"—"}</strong></div><div className="profile-detail"><span>Current Section</span><strong>{s.section?.name||"—"}</strong></div><div className="profile-detail"><span>Promotion / Transfer Records</span><strong>{profile.summary.promotions}</strong></div></div><div className="profile-list" style={{marginTop:14}}>{profile.promotions.slice(0,5).map(h=><div className="profile-list-row" key={h._id}><div className="main"><strong>{h.fromSection?.program||""} · {h.fromSection?.semester||""} · {h.fromSection?.name||"—"} → {h.toSection?.program||""} · {h.toSection?.semester||""} · {h.toSection?.name||"—"}</strong><small>{h.action} · {h.academicSession?.name||""}</small></div><small>{h.createdAt?new Date(h.createdAt).toLocaleDateString():""}</small></div>)}{!profile.promotions.length&&<div className="empty-state">No movement history recorded.</div>}</div></section></div>}
      {view==="ATTENDANCE"&&<section className="panel"><div className="panel-head"><div><h3>Attendance History</h3><p>Present and Late are counted as attended. UNMARKED classes are excluded from the percentage.</p></div><span className="status-badge approved">{pct}% Attendance</span></div><div className="profile-summary" style={{marginBottom:16}}>{[["Present",profile.summary.attendance.PRESENT], ["Late",profile.summary.attendance.LATE],["Absent",profile.summary.attendance.ABSENT],["Leave",profile.summary.attendance.LEAVE]].map(([n,v])=><div className="profile-stat" key={n}><span>{n}</span><strong>{v}</strong></div>)}</div><div className="profile-list">{profile.attendance.map(a=><div className="profile-list-row" key={`${a._id}-${a.date}`}><div className="main"><strong>{a.subject?.name||"Subject"}</strong><small>{a.date} · {a.startTime}–{a.endTime} · {a.faculty?.name||""}</small></div><span className={`profile-status-${String(a.status||"").toLowerCase()}`}>{a.status}</span></div>)}{!profile.attendance.length&&<div className="empty-state">No attendance records found.</div>}</div></section>}
      {view==="FEES"&&<div className="profile-two-col"><section className="panel"><div className="panel-head"><div><h3>Fee Invoices</h3><p>Student billing and outstanding balances.</p></div></div><div className="profile-list">{profile.fees.map(i=><div className="profile-list-row" key={i._id}><div className="main"><strong>{i.feeHead?.name||"Fee"} · {i.invoiceNo}</strong><small>{i.academicSession?.name||""} · {i.status}</small></div><div><strong>{money(i.netAmount)}</strong><small>Balance {money(i.balance)}</small></div></div>)}{!profile.fees.length&&<div className="empty-state">No fee invoices found.</div>}</div></section><section className="panel"><div className="panel-head"><div><h3>Payment History</h3><p>Receipts and payment references.</p></div></div><div className="profile-list">{profile.payments.map(p=><div className="profile-list-row" key={p._id}><div className="main"><strong>{p.receiptNo}</strong><small>{p.paymentDate?String(p.paymentDate).slice(0,10):""} · {p.mode}</small></div><strong>{money(p.amount)}</strong></div>)}{!profile.payments.length&&<div className="empty-state">No payments recorded.</div>}</div></section></div>}
      {view==="ACADEMIC"&&<section className="panel"><div className="panel-head"><div><h3>Academic Movement History</h3><p>Every promotion and section transfer recorded for this student.</p></div></div><div className="profile-list">{profile.promotions.map(h=><div className="profile-list-row" key={h._id}><div className="main"><strong>{h.action}: {h.fromSection?.program||""} · {h.fromSection?.semester||""} · {h.fromSection?.name||"—"} → {h.toSection?.program||""} · {h.toSection?.semester||""} · {h.toSection?.name||"—"}</strong><small>{h.academicSession?.name||""}{h.remarks?` · ${h.remarks}`:""}</small></div><small>{h.createdAt?new Date(h.createdAt).toLocaleString():""}</small></div>)}{!profile.promotions.length&&<div className="empty-state">No academic movement history found.</div>}</div></section>}
    </>}
  </div>
}


export function StudentPromotion({data,sessions,activeSession,reload,setMessage}){
  const [sessionId,setSessionId]=useState(activeSession?._id||"");
  const [fromSection,setFromSection]=useState("");
  const [toSection,setToSection]=useState("");
  const [students,setStudents]=useState([]);
  const [selected,setSelected]=useState([]);
  const [action,setAction]=useState("PROMOTED");
  const [remarks,setRemarks]=useState("");
  const [q,setQ]=useState("");
  const [saving,setSaving]=useState(false);
  const [history,setHistory]=useState([]);

  useEffect(()=>{if(!sessionId&&activeSession?._id)setSessionId(activeSession._id)},[activeSession?._id]);
  useEffect(()=>{loadStudents();},[fromSection]);
  useEffect(()=>{loadHistory();},[sessionId]);

  async function loadStudents(){
    try{
      const r=await axios.get(`${API}/students?active=true${fromSection?`&sectionId=${fromSection}`:""}`);
      setStudents(r.data||[]);setSelected([]);
    }catch(e){setMessage(e.response?.data?.message||e.message)}
  }
  async function loadHistory(){
    try{const r=await axios.get(`${API}/student-promotions/history${sessionId?`?sessionId=${sessionId}`:""}`);setHistory(r.data||[])}catch(e){setMessage(e.response?.data?.message||e.message)}
  }
  const filtered=students.filter(s=>`${s.name} ${s.admissionNo} ${s.rollNo}`.toLowerCase().includes(q.toLowerCase()));
  const toggle=id=>setSelected(a=>a.includes(id)?a.filter(x=>x!==id):[...a,id]);
  const selectAll=()=>setSelected(selected.length===filtered.length?[]:filtered.map(s=>s._id));
  async function submit(){
    if(!sessionId)return setMessage("Select an academic session.");
    if(!toSection)return setMessage("Select a target section.");
    if(!selected.length)return setMessage("Select at least one student.");
    if(fromSection===toSection)return setMessage("Target section must be different from the source section.");
    setSaving(true);
    try{
      const r=await axios.post(`${API}/student-promotions/bulk`,{studentIds:selected,toSection,academicSessionId:sessionId,action,remarks});
      setMessage(r.data?.message||"Student movement completed.");
      setSelected([]);setRemarks("");await reload();await loadStudents();await loadHistory();
    }catch(e){setMessage(e.response?.data?.message||e.message)}finally{setSaving(false)}
  }
  return <div className="promotion-page">
    <section className="promotion-hero">
      <div><span className="promotion-eyebrow">ACADEMIC OPERATIONS</span><h2>Student Promotion & Section Transfer</h2><p>Move active students to their next section while keeping a complete academic history of every change.</p></div>
      <div className="promotion-stat"><strong>{students.length}</strong><span>students in selected source</span></div>
    </section>

    <section className="promotion-flow">
      <div className="promotion-step"><span>1</span><div><small>Academic Session</small><select value={sessionId} onChange={e=>setSessionId(e.target.value)}><option value="">Select session</option>{(sessions||[]).map(s=><option key={s._id} value={s._id}>{s.name}{s.active?" · Active":""}</option>)}</select></div></div>
      <ArrowRight className="promotion-arrow" size={20}/>
      <div className="promotion-step"><span>2</span><div><small>From Section</small><select value={fromSection} onChange={e=>setFromSection(e.target.value)}><option value="">All Sections</option>{(data.sections||[]).map(s=><option key={s._id} value={s._id}>{s.program} · {s.semester} · {s.name}</option>)}</select></div></div>
      <ArrowRight className="promotion-arrow" size={20}/>
      <div className="promotion-step target"><span>3</span><div><small>Move To Section</small><select value={toSection} onChange={e=>setToSection(e.target.value)}><option value="">Select target section</option>{(data.sections||[]).filter(s=>s._id!==fromSection).map(s=><option key={s._id} value={s._id}>{s.program} · {s.semester} · {s.name}</option>)}</select></div></div>
    </section>

    <section className="promotion-panel">
      <div className="promotion-toolbar"><div><h3>Select Students</h3><p>{selected.length} selected · {filtered.length} available</p></div><div className="promotion-actions"><button className="secondary" onClick={selectAll}>{selected.length===filtered.length&&filtered.length?"Clear Selection":"Select All"}</button></div></div>
      <div className="promotion-search"><Search size={17}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search student name, admission no. or roll no..."/></div>
      <div className="student-card-grid">
        {filtered.map(s=><button type="button" key={s._id} className={`student-select-card ${selected.includes(s._id)?"selected":""}`} onClick={()=>toggle(s._id)}>
          <span className="student-avatar">{(s.name||"S").slice(0,1).toUpperCase()}</span><span className="student-card-main"><b>{s.name}</b><small>{s.admissionNo} · Roll {s.rollNo}</small><em>{s.section?.program||""} · {s.section?.semester||""} · {s.section?.name||""}</em></span><span className="student-check">{selected.includes(s._id)?"✓":""}</span>
        </button>)}
        {!filtered.length&&<div className="promotion-empty">No active students found for the selected source section.</div>}
      </div>
    </section>

    <section className="promotion-action-panel">
      <div className="promotion-action-fields"><label><span>Action</span><select value={action} onChange={e=>setAction(e.target.value)}><option value="PROMOTED">Promote</option><option value="TRANSFERRED">Transfer</option></select></label><label className="wide"><span>Remarks</span><input value={remarks} onChange={e=>setRemarks(e.target.value)} placeholder="Optional note for this movement..."/></label></div>
      <button className="primary promotion-submit" onClick={submit} disabled={saving}>{saving?"Processing...":`${action==="PROMOTED"?"Promote":"Transfer"} ${selected.length||0} Student${selected.length===1?"":"s"}`}</button>
    </section>

    <section className="promotion-panel"><div className="promotion-toolbar"><div><h3>Recent Movement History</h3><p>Previous promotions and section transfers for the selected academic session.</p></div><span className="status-badge approved">{history.length} records</span></div><div className="promotion-history-grid">{history.slice(0,12).map(h=><article className="promotion-history-card" key={h._id}><div className="history-avatar"><History size={16}/></div><div><b>{h.student?.name||"Student"}</b><small>{h.student?.admissionNo||""} · Roll {h.student?.rollNo||""}</small><p>{h.fromSection?.name||"—"} <ArrowRight size={14}/> {h.toSection?.name||"—"}</p><span>{h.action} · {h.academicSession?.name||""}</span></div><time>{h.createdAt?new Date(h.createdAt).toLocaleDateString():""}</time></article>)}{!history.length&&<div className="promotion-empty">No promotion or transfer history yet.</div>}</div></section>
  </div>
}

