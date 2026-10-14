import React, {useEffect, useState} from "react";
import axios from "axios";
import {API} from "../core/api";
import {refId} from "../core/utils.js";
import {Input, Select} from "../components/SharedComponents.jsx";
import {BookOpen} from "lucide-react";

export default function SubjectFacultyMapping({data,sessions,activeSession,reload,setMessage}){
  const [sessionId,setSessionId]=useState(activeSession?._id||"");
  const [programId,setProgramId]=useState("");
  const [semester,setSemester]=useState("");
  const [sectionId,setSectionId]=useState("");
  const [facultyId,setFacultyId]=useState("");
  const [rows,setRows]=useState([]);
  const [summary,setSummary]=useState(null);
  const [loading,setLoading]=useState(false);
  const [saving,setSaving]=useState(false);
  const [editingId,setEditingId]=useState(null);
  const [form,setForm]=useState({name:"",code:"",faculty:"",section:"",subjectType:"CORE",classesPerWeek:3,totalSessions:0,maxClassesPerWeek:3,duration:1,roomType:"Classroom",active:true});

  useEffect(()=>{ if(!sessionId&&activeSession?._id) setSessionId(activeSession._id); },[activeSession?._id]);
  const sessionSections=(data.sections||[]).filter(s=>!sessionId||refId(s.academicSession)===String(sessionId));
  const filteredSections=sessionSections.filter(s=>(!programId||refId(s.programId)===String(programId))&&(!semester||String(s.semester)===String(semester)));
  const semesters=[...new Set(sessionSections.filter(s=>!programId||refId(s.programId)===String(programId)).map(s=>s.semester).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),undefined,{numeric:true}));
  const faculties=data.faculty||[];

  async function loadMappings(){
    if(!sessionId){setRows([]);setSummary(null);return;}
    setLoading(true);
    try{
      const q=new URLSearchParams({sessionId});
      if(sectionId) q.set("sectionId",sectionId);
      if(facultyId) q.set("facultyId",facultyId);
      if(programId) q.set("programId",programId);
      const r=await axios.get(`${API}/subject-mappings?${q}`); setRows(r.data||[]);
      const sr=await axios.get(`${API}/subject-mappings/summary?sessionId=${encodeURIComponent(sessionId)}`); setSummary(sr.data||null);
    }catch(e){setMessage(e.response?.data?.message||e.message)}finally{setLoading(false)}
  }
  useEffect(()=>{loadMappings();},[sessionId,sectionId,facultyId,programId]);

  function resetForm(){setEditingId(null);setForm({name:"",code:"",faculty:facultyId||"",section:sectionId||"",subjectType:"CORE",classesPerWeek:3,totalSessions:0,maxClassesPerWeek:3,duration:1,roomType:"Classroom",active:true});}
  function edit(row){setEditingId(row._id);setForm({name:row.name||"",code:row.code||"",faculty:refId(row.faculty),section:refId(row.section),subjectType:row.subjectType||"CORE",classesPerWeek:row.classesPerWeek||1,totalSessions:row.totalSessions||0,maxClassesPerWeek:row.maxClassesPerWeek||row.classesPerWeek||1,duration:row.duration||1,roomType:row.roomType||"Classroom",active:row.active!==false});window.scrollTo({top:0,behavior:"smooth"});}
  async function save(){
    if(!sessionId||!form.section||!form.faculty||!form.name.trim()){setMessage("Select Academic Session, Section, Faculty and enter Subject Name.");return;}
    const weeklyTarget=Math.max(1,Number(form.classesPerWeek||1));
    const totalTarget=Math.max(0,Number(form.totalSessions||0));
    const weeklyLimit=Number(form.maxClassesPerWeek||0);
    if(totalTarget===0&&weeklyLimit<weeklyTarget){
      setMessage(`Max Classes / Week must be at least Classes / Week when Total Sessions is 0 (currently ${weeklyLimit} vs ${weeklyTarget}). Increase the weekly maximum or enter an explicit Total Sessions target.`);
      return;
    }
    setSaving(true);
    try{
      const body={...form,academicSession:sessionId,programId:(data.sections||[]).find(s=>refId(s)===String(form.section))?.programId?._id||((data.sections||[]).find(s=>refId(s)===String(form.section))?.programId||null),classesPerWeek:Number(form.classesPerWeek||1),totalSessions:Number(form.totalSessions||0),maxClassesPerWeek:Number(form.maxClassesPerWeek||form.classesPerWeek||1),duration:Number(form.duration||1)};
      if(editingId) await axios.put(`${API}/subject-mappings/${editingId}`,body); else await axios.post(`${API}/subject-mappings`,body);
      setMessage(editingId?"Subject mapping updated successfully.":"Subject mapped successfully."); resetForm(); await loadMappings(); await reload();
    }catch(e){setMessage(e.response?.data?.message||e.message)}finally{setSaving(false)}
  }
  async function remove(id){if(!confirm("Remove this subject mapping?"))return;try{await axios.delete(`${API}/subject-mappings/${id}`);setMessage("Subject mapping removed.");await loadMappings();await reload();}catch(e){setMessage(e.response?.data?.message||e.message)}}

  return <div className="subject-mapping-page">
    <section className="mapping-hero">
      <div><h2>Subject & Faculty Mapping</h2><p>Assign subjects to the correct faculty and section.</p></div>
      <div className="mapping-hero-badge"><strong>{summary?.totalSubjects||0}</strong><span>mapped subjects</span></div>
    </section>

    <section className="panel">
      <div className="panel-head"><div><h3>Academic Scope</h3><p>Choose the session first. Sections are automatically limited to that session.</p></div></div>
      <div className="mapping-filter-grid">
        <Select label="Academic Session" value={sessionId} options={(sessions||[]).map(x=>[x._id,`${x.name}${x.active?" · Active":""}`])} onChange={v=>{setSessionId(v);setProgramId("");setSemester("");setSectionId("");}}/>
        <Select label="Program" value={programId} options={(data.programs||[]).filter(p=>p.active!==false).map(p=>[p._id,`${p.name}${p.code?` (${p.code})`:""}`])} onChange={v=>{setProgramId(v);setSemester("");setSectionId("");}}/>
        <Select label="Semester" value={semester} options={semesters.map(x=>[x,x])} onChange={v=>{setSemester(v);setSectionId("");}}/>
        <Select label="Section" value={sectionId} options={filteredSections.map(x=>[x._id,`${x.program||""} · Sem ${x.semester} · ${x.name}`])} onChange={v=>setSectionId(v)}/>
        <Select label="Faculty Filter" value={facultyId} options={faculties.map(x=>[x._id,`${x.name}${x.code?` (${x.code})`:""}`])} onChange={v=>setFacultyId(v)}/>
      </div>
    </section>

    <div className="mapping-stats">
      <div className="mapping-stat"><span>Sections</span><strong>{summary?.sections?.length||0}</strong></div>
      <div className="mapping-stat"><span>Mapped Subjects</span><strong>{summary?.totalSubjects||0}</strong></div>
      <div className="mapping-stat"><span>Weekly Load</span><strong>{summary?.totalWeeklyLoad||0}</strong></div>
      <div className="mapping-stat"><span>Sections Without Mapping</span><strong>{summary?.unmappedSections||0}</strong></div>
    </div>

    <section className="panel">
      <div className="panel-head"><div><h3>{editingId?"Edit Subject Mapping":"Add Subject Mapping"}</h3><p>Faculty assignment and weekly workload are stored against the academic session and section.</p></div>{editingId&&<button className="secondary" onClick={resetForm}>Cancel Edit</button>}</div>
      <div className="mapping-form-grid">
        <Input label="Subject Name" value={form.name} onChange={v=>setForm({...form,name:v})}/>
        <Input label="Subject Code" value={form.code} onChange={v=>setForm({...form,code:v})}/>
        <Select label="Section" value={form.section} options={filteredSections.map(x=>[x._id,`${x.program||""} · Sem ${x.semester} · ${x.name}`])} onChange={v=>setForm({...form,section:v})}/>
        <Select label="Faculty" value={form.faculty} options={faculties.map(x=>[x._id,`${x.name}${x.code?` (${x.code})`:""}`])} onChange={v=>setForm({...form,faculty:v})}/>
        <Select label="Subject Type" value={form.subjectType} options={[["CORE","Core"],["ELECTIVE","Elective"],["PRACTICAL","Practical"],["LAB","Lab"]]} onChange={v=>setForm({...form,subjectType:v})}/>
        <Input label="Classes / Week" type="number" value={form.classesPerWeek} onChange={v=>setForm(current=>{
          const nextWeekly=Math.max(1,Number(v||1));
          const next={...current,classesPerWeek:v};
          if(Number(current.totalSessions||0)===0&&Number(current.maxClassesPerWeek||0)<nextWeekly)next.maxClassesPerWeek=String(nextWeekly);
          return next;
        })}/>
        <Input label="Max Classes / Week" type="number" value={form.maxClassesPerWeek} onChange={v=>setForm({...form,maxClassesPerWeek:v})}/>
        <Input label="Duration (Periods)" type="number" value={form.duration} onChange={v=>setForm({...form,duration:v})}/>
        <Select label="Room Requirement" value={form.roomType} options={[["Classroom","Classroom"],["Lab","Lab"],["Any","Any"]]} onChange={v=>setForm({...form,roomType:v})}/>
        <Input label="Total Sessions (optional)" type="number" value={form.totalSessions} onChange={v=>setForm({...form,totalSessions:v})}/>
        <label style={{display:"flex",alignItems:"center",gap:10,gridColumn:"1 / -1",padding:"12px 14px",border:"1px solid #dbe3ef",borderRadius:10,background:"#f8fafc",cursor:"pointer"}}>
          <input type="checkbox" checked={form.active!==false} onChange={event=>setForm(current=>({...current,active:event.target.checked}))}/>
          <span><strong>Active for timetable generation</strong><small style={{display:"block",marginTop:3,color:"#64748b"}}>Inactive mappings stay in history but are excluded from new timetable generation.</small></span>
        </label>
      </div>
      <div className="mapping-actions"><button className="primary" onClick={save} disabled={saving||!sessionId}>{saving?"Saving...":editingId?"Update Mapping":"Add Mapping"}</button></div>
    </section>

    <section className="panel">
      <div className="panel-head"><div><h3>Current Subject Allocations</h3><p>{loading?"Loading mappings...":`${rows.length} mapping${rows.length===1?"":"s"} in the current filter.`}</p></div></div>
      {!rows.length&&!loading?<div className="empty-state"><BookOpen size={28}/><strong>No subject mappings found</strong><span>Add mappings above for the selected Academic Session.</span></div>:<div className="table-wrap"><table><thead><tr><th>Subject</th><th>Code</th><th>Program / Semester / Section</th><th>Faculty</th><th>Type</th><th>Weekly Load</th><th>Room</th><th>Status</th><th>Actions</th></tr></thead><tbody>{rows.map(r=><tr key={r._id}><td><strong>{r.name}</strong></td><td>{r.code||"—"}</td><td>{r.section?`${r.section.program||""} · Sem ${r.section.semester||""} · ${r.section.name||""}`:"—"}</td><td>{r.faculty?.name||"—"}</td><td>{r.subjectType||"CORE"}</td><td>{r.classesPerWeek||0}</td><td>{r.roomType||"Classroom"}</td><td>{r.active===false?<span className="status-chip warning">Inactive</span>:<span className="status-chip success">Active</span>}</td><td><div className="table-actions"><button className="secondary small-btn" onClick={()=>edit(r)}>Edit</button><button className="danger small-btn" onClick={()=>remove(r._id)}>Remove</button></div></td></tr>)}</tbody></table></div>}
    </section>

    {summary?.sections?.length>0&&<section className="panel"><div className="panel-head"><div><h3>Section Mapping Coverage</h3><p>Use this view to identify sections that still need subject/faculty allocation.</p></div></div><div className="table-wrap"><table><thead><tr><th>Program</th><th>Semester</th><th>Section</th><th>Subjects</th><th>Weekly Load</th><th>Status</th></tr></thead><tbody>{summary.sections.map(x=><tr key={x.section._id}><td>{x.section.programId?.name||x.section.program||"—"}</td><td>{x.section.semester}</td><td>{x.section.name}</td><td>{x.subjectCount}</td><td>{x.weeklyLoad}</td><td>{x.subjectCount?<span className="status-chip success">Mapped</span>:<span className="status-chip warning">Needs Mapping</span>}</td></tr>)}</tbody></table></div></section>}
  </div>;
}
