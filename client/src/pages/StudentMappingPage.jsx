import React, {useEffect, useState} from "react";
import axios from "axios";
import {API} from "../core/api";
import {refId} from "../core/utils.js";
import {Input, Select} from "../components/SharedComponents.jsx";
import {Search} from "lucide-react";

export default function StudentMapping({data,sessions=[],activeSession,reload,setMessage}){
  const [sessionId,setSessionId]=useState(activeSession?._id||"");
  const [sourceProgram,setSourceProgram]=useState("");
  const [sourceSemester,setSourceSemester]=useState("");
  const [sourceSection,setSourceSection]=useState("");
  const [targetSection,setTargetSection]=useState("");
  const [selected,setSelected]=useState([]);
  const [q,setQ]=useState("");
  const sections=data.sections||[];
  const sourceSections=sections.filter(s=>(!sourceProgram||String(s.programId?._id||s.programId||'')===sourceProgram||s.program===sourceProgram)&&(!sourceSemester||String(s.semester)===sourceSemester));
  const students=(data.students||[]).filter(s=>!sourceSection||refId(s.section)===sourceSection).filter(s=>!q||`${s.name} ${s.admissionNo} ${s.rollNo}`.toLowerCase().includes(q.toLowerCase()));
  const targetOptions=sections.filter(s=>refId(s)!==sourceSection);
  useEffect(()=>{setSelected([])},[sourceProgram,sourceSemester,sourceSection]);
  const programs=data.programs||[];
  const semesters=[...new Set(sections.filter(s=>!sourceProgram||String(s.programId?._id||s.programId||'')===sourceProgram||s.program===sourceProgram).map(s=>s.semester))];
  async function mapStudents(){
    if(!selected.length)return setMessage("Select at least one student.");
    if(!targetSection)return setMessage("Select a destination section.");
    try{
      const r=await axios.post(`${API}/students/bulk-map`,{studentIds:selected,toSection:targetSection,academicSessionId:sessionId||activeSession?._id||null,action:'TRANSFERRED',remarks:'Bulk Student Mapping'});
      setMessage(r.data?.message||`Mapped ${selected.length} student(s).`);setSelected([]);await reload();
    }catch(e){setMessage(e.response?.data?.message||e.message)}
  }
  function selectAll(){setSelected(selected.length===students.length?[]:students.map(s=>s._id))}
  return <div>
    <section className="panel"><div className="panel-head"><div><h3>Student Mapping</h3><p>Move students in bulk. Section is the source of truth for Program and Semester.</p></div><span className="status-badge approved">{students.length} Students</span></div>
      <div className="form-grid">
        <Select label="Academic Session" value={sessionId} options={[['','Current / Any Session'],...sessions.map(s=>[s._id,`${s.name}${s.active?' · Active':''}`])]} onChange={setSessionId}/>
        <Select label="Current Program" value={sourceProgram} options={[['','All Programs'],...programs.map(p=>[p._id,p.name])]} onChange={v=>{setSourceProgram(v);setSourceSemester('');setSourceSection('')}}/>
        <Select label="Current Semester" value={sourceSemester} options={[['','All Semesters'],...semesters.map(v=>[v,v])]} onChange={v=>{setSourceSemester(v);setSourceSection('')}}/>
        <Select label="Current Section" value={sourceSection} options={[['','All Sections'],...sourceSections.map(s=>[s._id,`${s.program} · ${s.semester} · ${s.name}`])]} onChange={setSourceSection}/>
        <Input label="Search Student" value={q} onChange={setQ} placeholder="Name / Admission / Roll"/>
      </div>
    </section>
    <section className="panel"><div className="panel-head"><div><h3>Student Roster</h3><p>{selected.length} selected · {students.length} matching active students</p></div><button className="secondary" onClick={selectAll}>{selected.length===students.length&&students.length?'Clear Selection':'Select All'}</button></div>
      <div className="table-wrap"><table><thead><tr><th></th><th>Student</th><th>Admission / Roll</th><th>Current Mapping</th></tr></thead><tbody>{students.map(s=><tr key={s._id}><td><input type="checkbox" checked={selected.includes(s._id)} onChange={()=>setSelected(a=>a.includes(s._id)?a.filter(x=>x!==s._id):[...a,s._id])}/></td><td><strong>{s.name}</strong><div className="muted">{s.email||s.phone||''}</div></td><td>{s.admissionNo} · {s.rollNo}</td><td>{s.section?.program||s.program||''} · {s.section?.semester||s.semester||''} · {s.section?.name||''}</td></tr>)}{!students.length&&<tr><td colSpan="4">No students match the selected filters.</td></tr>}</tbody></table></div></section>
    <section className="panel"><div className="panel-head"><div><h3>Map Selected Students</h3><p>Destination mapping changes the student's Section; Program and Semester follow the destination Section.</p></div></div><div className="form-grid"><Select label="Destination Section" value={targetSection} options={[['','Select Destination'],...targetOptions.map(s=>[s._id,`${s.program} · ${s.semester} · ${s.name}`])]} onChange={setTargetSection}/><div className="form-actions"><button className="primary" disabled={!selected.length||!targetSection} onClick={mapStudents}>Map {selected.length} Student{selected.length===1?'':'s'}</button></div></div></section>
  </div>;
}
