import React, {useState} from "react";
import axios from "axios";
import {API} from "../core/api";
import {days, apiName, refId} from "../core/utils.js";
import {Input, Select} from "../components/SharedComponents.jsx";
import {Users, BookOpen, DoorOpen, Clock3, Trash2} from "lucide-react";

export default function MasterView({type,data,setData,reload,sessions=[],setMessage=()=>{}}){
  const key=Object.keys(apiName).find(k=>apiName[k]===type);
  const [form,setForm]=useState({});
  const [editingId,setEditingId]=useState(null);
  const [saving,setSaving]=useState(false);
  const [formError,setFormError]=useState("");

  function reset(){
    setForm({});
    setEditingId(null);
    setFormError("");
  }

  function edit(record){
    setFormError("");
    if(key==="semesters"){
      setForm({...record,academicSession:record.academicSession?._id||record.academicSession||"",program:record.program?._id||record.program||""});
    }else if(key==="sections"){
      setForm({...record,academicSession:refId(record.academicSession),programId:refId(record.programId)});
    }else if(key==="timeslots"){
      setForm({
        ...record,
        academicSession:record.academicSession?._id||record.academicSession||"",
        program:record.program?._id||record.program||"",
        semester:record.semester||""
      });
    }else if(key==="subjects"){
      setForm({
        name:record.name||"",
        code:record.code||"",
        faculty:record.faculty?._id||record.faculty||"",
        section:record.section?._id||record.section||"",
        classesPerWeek:record.classesPerWeek||1,
        totalSessions:record.totalSessions||0,
        maxClassesPerWeek:Math.max(Number(record.maxClassesPerWeek||0),Number(record.classesPerWeek||1)),
        duration:record.duration||1,
        roomType:record.roomType||"Classroom"
      });
    }else{
      setForm({...record});
    }
    setEditingId(record._id);
    window.scrollTo({top:0,behavior:"smooth"});
  }

  async function save(){
    let body={...form};
    setFormError("");

    if(key==="semesters"){
      const name=String(body.name||"").trim();
      const order=Number(body.order||1);
      if(!body.academicSession||!body.program||!name){
        setFormError("Choose an academic session and linked program, then enter a semester name.");
        return;
      }
      if(name.length>80){setFormError("Semester name must be 80 characters or fewer.");return;}
      if(!Number.isInteger(order)||order<1||order>20){setFormError("Display order must be a whole number from 1 to 20.");return;}
      const duplicate=list.find(row=>String(row._id)!==String(editingId||"")&&refId(row.academicSession)===String(body.academicSession)&&refId(row.program)===String(body.program)&&String(row.name||"").trim().toLocaleLowerCase()===name.toLocaleLowerCase());
      if(duplicate){setFormError(`${duplicate.name} already exists for this program and academic session.`);return;}
      body={academicSession:body.academicSession,program:body.program,name,order,active:body.active!==false};
    }

    if(key==="programs") body={
      name:body.name,code:body.code,department:body.department,
      durationYears:Number(body.durationYears||4),active:body.active!==false
    };

    if(key==="faculty") body={
      name:body.name,code:body.code,
      maxWorkingDays:Number(body.maxWorkingDays||5),
      maxClassesPerDay:Number(body.maxClassesPerDay||4),
      availableDays:body.availableDays||days,
      unavailableSlots:body.unavailableSlots||[]
    };

    if(key==="sections"){
      body={
        academicSession:body.academicSession,
        programId:body.programId,
        program:(data.programs||[]).find(p=>refId(p)===String(body.programId))?.name||body.program||"",
        semester:String(body.semester||"").trim(),
        name:String(body.name||"").trim(),
        maxClassesPerDay:Number(body.maxClassesPerDay||5)
      };
      if(!body.academicSession || !body.programId || !body.semester || !body.name){
        setMessage("Select an Academic Session, Program and Semester, then enter a Section Name.");
        return;
      }
    }

    if(key==="rooms") body={
      name:body.name,type:body.type||"Classroom",
      capacity:Number(body.capacity||60)
    };

    if(key==="timeslots") body={
      academicSession:body.academicSession||null,
      program:body.program||null,
      semester:String(body.semester||"").trim(),
      day:body.day||"Monday",
      startTime:body.startTime,
      endTime:body.endTime,
      order:Number(body.order||1),
      isBreak:false
    };

    if(key==="subjects"){
      if(!body.faculty || !body.section){
        setMessage("Please select both Faculty and Section for the subject.");
        return;
      }
      body={
        name:body.name,
        code:body.code,
        faculty:body.faculty,
        section:body.section,
        classesPerWeek:Number(body.classesPerWeek||1),
        totalSessions:Number(body.totalSessions||0),
        maxClassesPerWeek:Number(body.maxClassesPerWeek||body.classesPerWeek||1),
        duration:Number(body.duration||1),
        roomType:body.roomType||"Classroom"
      };
      if((body.maxClassesPerWeek>0?body.maxClassesPerWeek:body.classesPerWeek)<body.classesPerWeek){
        setMessage("Max Classes / Week cannot be lower than Classes / Week. The weekly timetable must be able to place the configured weekly target.");
        return;
      }
    }

    setSaving(true);
    try{
      if(editingId){
        await axios.put(`${API}/${key}/${editingId}`,body);
        setMessage(`${type.slice(0,-1)} updated successfully.`);
      }else{
        await axios.post(`${API}/${key}`,body);
        setMessage(`${type.slice(0,-1)} added successfully.`);
      }
      if(key==="semesters"){
        const scoped=[...(list||[]).filter(row=>refId(row.academicSession)===String(body.academicSession)&&refId(row.program)===String(body.program)),{...body,_id:editingId||"new"}];
        const nextOrder=Math.min(20,Math.max(0,...scoped.map(row=>Number(row.order||0)))+1);
        setForm({academicSession:body.academicSession,program:body.program,name:"",order:nextOrder,active:true});
        setEditingId(null);
        setFormError("");
      }else reset();
      await reload();
    }catch(e){
      const message=e.response?.data?.message||e.message||"Unable to save record.";
      if(key==="semesters"){setFormError(message);setMessage("");}
      else setMessage(message);
    }finally{
      setSaving(false);
    }
  }

  async function del(id){
    if(!confirm("Delete this record?")) return;
    try{
      await axios.delete(`${API}/${key}/${id}`);
      if(editingId===id) reset();
      await reload();
    }catch(e){
      setMessage(e.response?.data?.message||e.message);
    }
  }

  const list=data[key]||[];

  return <div className="panel">
    <div className="form-grid">
      {key==="programs" && <>
        <Input label="Program Name" value={form.name} onChange={v=>setForm({...form,name:v})}/>
        <Input label="Code" value={form.code} onChange={v=>setForm({...form,code:v})}/>
        <Input label="Department" value={form.department} onChange={v=>setForm({...form,department:v})}/>
        <Input label="Duration (Years)" type="number" value={form.durationYears||4} onChange={v=>setForm({...form,durationYears:v})}/>
        <label className="master-active-field" style={{display:"flex",alignItems:"center",gap:10,gridColumn:"1 / -1",padding:"11px 13px",border:"1px solid #dbe3ef",borderRadius:10,background:"#f8fafc",cursor:"pointer"}}>
          <input type="checkbox" checked={form.active!==false} onChange={event=>setForm({...form,active:event.target.checked})}/>
          <span><strong>Active for new academic mappings</strong><small style={{display:"block",marginTop:3,color:"#64748b"}}>Inactive programs remain in historical records but cannot be selected for new mappings.</small></span>
        </label>
      </>}

      {key==="semesters" && <>
        <div className="semester-form-intro wide">
          <span className="semester-form-icon"><BookOpen size={18}/></span>
          <div><strong>{editingId?"Edit semester":"Add semester"}</strong><p>Each semester belongs to one academic session and one linked program. Use consistent names so sections map correctly.</p></div>
        </div>
        <Select label="Academic Session" value={form.academicSession||""} options={[["","Select academic session"],...(sessions||[]).map(s=>[s._id,`${s.name}${s.active?" · Active":""}`])]} onChange={v=>{setForm({...form,academicSession:v,program:""});setFormError("");}} required/>
        <Select label="Program" value={form.program||""} options={[["","Select linked program"],...(data.programs||[]).filter(p=>p.active!==false&&(sessions||[]).find(s=>refId(s)===String(form.academicSession))?.programDates?.some(d=>refId(d.program)===refId(p))).map(p=>[p._id,`${p.name}${p.code?` (${p.code})`:""}`])]} onChange={v=>{setForm({...form,program:v});setFormError("");}} disabled={!form.academicSession} required/>
        <Input label="Semester Name" value={form.name||""} placeholder="e.g. Semester I" onChange={v=>{setForm({...form,name:v});setFormError("");}} required/>
        <Input label="Display Order" type="number" value={form.order??1} min={1} max={20} step={1} onChange={v=>{setForm({...form,order:v});setFormError("");}} required/>
        <label className="semester-active-toggle wide"><input type="checkbox" checked={form.active!==false} onChange={event=>setForm({...form,active:event.target.checked})}/><span><strong>Active semester</strong><small>Inactive semesters remain visible in historical records but cannot be selected for new section mappings.</small></span></label>
        {formError&&<div className="message error wide" role="alert">{formError}</div>}
      </>}

      {key==="faculty" && <>
        <Input label="Faculty Name" value={form.name} onChange={v=>setForm({...form,name:v})}/>
        <Input label="Code" value={form.code} onChange={v=>setForm({...form,code:v})}/>
        <Input label="Max Working Days" type="number" value={form.maxWorkingDays||5} onChange={v=>setForm({...form,maxWorkingDays:v})}/>
        <Input label="Max Classes / Day" type="number" value={form.maxClassesPerDay||4} onChange={v=>setForm({...form,maxClassesPerDay:v})}/>
        <div className="field">
          <label>Available Days</label>
          <div className="checks">
            {days.map(d=><label key={d}>
              <input
                type="checkbox"
                checked={(form.availableDays||days).includes(d)}
                onChange={e=>{
                  let a=form.availableDays||[...days];
                  a=e.target.checked?[...new Set([...a,d])]:a.filter(x=>x!==d);
                  setForm({...form,availableDays:a});
                }}
              /> {d.slice(0,3)}
            </label>)}
          </div>
        </div>
      </>}

      {key==="subjects" && <>
        <Input label="Subject Name" value={form.name} onChange={v=>setForm({...form,name:v})}/>
        <Input label="Code" value={form.code} onChange={v=>setForm({...form,code:v})}/>
        <Select label="Faculty" value={form.faculty} options={data.faculty.map(x=>[x._id,x.name])} onChange={v=>setForm({...form,faculty:v})}/>
        <Select
          label="Section"
          value={form.section}
          options={data.sections.map(x=>[
            x._id,
            `${x.program||""} ${x.semester||""} - ${x.name||""}`
          ])}
          onChange={v=>setForm({...form,section:v})}
        />
        <Input label="Default Classes / Week" type="number" value={form.classesPerWeek||1} onChange={v=>setForm(current=>{const nextWeekly=Math.max(1,Number(v||1));const next={...current,classesPerWeek:v};if(Number(current.maxClassesPerWeek||0)<nextWeekly)next.maxClassesPerWeek=String(nextWeekly);return next;})}/>
        <Input label="Total Sessions / Academic Session" type="number" value={form.totalSessions||0} onChange={v=>setForm({...form,totalSessions:v})}/>
        <Input label="Max Classes / Week" type="number" value={form.maxClassesPerWeek||form.classesPerWeek||1} onChange={v=>setForm({...form,maxClassesPerWeek:v})}/>
        <Input label="Duration (Periods)" type="number" value={form.duration||1} onChange={v=>setForm({...form,duration:v})}/>
        <Select label="Room Type" value={form.roomType||"Classroom"} options={[["Classroom","Classroom"],["Lab","Lab"],["Any","Any"]]} onChange={v=>setForm({...form,roomType:v})}/>
      </>}

      {key==="sections" && <>
        <Select label="Academic Session" value={form.academicSession||""} options={[["","Select academic session"],...(sessions||[]).map(s=>[s._id,s.name])]} onChange={v=>setForm({...form,academicSession:v,programId:"",semester:""})}/>
        <Select label="Program" value={form.programId||""} options={[["","Select program"],...(data.programs||[]).filter(p=>p.active!==false&&(sessions||[]).find(s=>refId(s)===String(form.academicSession))?.programDates?.some(d=>refId(d.program)===refId(p))).map(p=>[p._id,p.name])]} onChange={v=>setForm({...form,programId:v,semester:""})}/>
        <Select label="Semester" value={form.semester||""} options={[["","Select semester"],...(data.semesters||[]).filter(s=>refId(s.academicSession)===String(form.academicSession)&&refId(s.program)===String(form.programId)&&s.active!==false).map(s=>[s.name,s.name])]} onChange={v=>setForm({...form,semester:v})}/>
        <Input label="Section Name" value={form.name||""} placeholder="e.g. Section A" onChange={v=>setForm({...form,name:v})}/>
        <div className="field">
          <label>Daily class limit</label>
         </div>
      </>}

      {key==="rooms" && <>
        <Input label="Room Name" value={form.name} onChange={v=>setForm({...form,name:v})}/>
        <Select label="Type" value={form.type||"Classroom"} options={[["Classroom","Classroom"],["Lab","Lab"]]} onChange={v=>setForm({...form,type:v})}/>
        <Input label="Capacity" type="number" value={form.capacity||60} onChange={v=>setForm({...form,capacity:v})}/>
      </>}

      {key==="timeslots" && <>
        <Select label="Academic Session" value={form.academicSession||""} options={[["","All sessions (shared default)"],...(sessions||[]).map(s=>[s._id,s.name])]} onChange={v=>setForm({...form,academicSession:v,program:"",semester:""})}/>
        <Select label="Program" value={form.program||""} options={[["","All programs (shared default)"],...(data.programs||[]).filter(p=>p.active!==false&&(sessions||[]).find(s=>refId(s)===String(form.academicSession))?.programDates?.some(d=>refId(d.program)===refId(p))).map(p=>[p._id,p.name])]} onChange={v=>setForm({...form,program:v,semester:""})}/>
        <Select label="Semester (optional)" value={form.semester||""} options={[["","All semesters (program default)"],...(data.semesters||[]).filter(s=>refId(s.academicSession)===String(form.academicSession)&&refId(s.program)===String(form.program)&&s.active!==false).map(s=>[s.name,s.name])]} onChange={v=>setForm({...form,semester:v})}/>
        <Select label="Day" value={form.day||"Monday"} options={days.map(d=>[d,d])} onChange={v=>setForm({...form,day:v})}/>
        <Input label="Start Time" type="time" value={form.startTime||""} onChange={v=>setForm({...form,startTime:v})}/>
        <Input label="End Time" type="time" value={form.endTime||""} onChange={v=>setForm({...form,endTime:v})}/>
        <Input label="Period Order" type="number" value={form.order||1} min={1} max={30} step={1} onChange={v=>setForm({...form,order:v})}/>
      </>}

      <div className="form-actions">
        <button className="primary add" onClick={save} disabled={saving}>
          {saving?(editingId?"Saving...":"Adding..."):(editingId?`Update ${type.slice(0,-1)}`:`+ Add ${type}`)}
        </button>
        {editingId && <button className="secondary" onClick={reset}>Cancel Edit</button>}
      </div>
    </div>

    <div className="master-card-grid">
      {list.map(x=>{
        const facultyName=x.faculty?.name || data.faculty.find(f=>refId(f)===refId(x.faculty))?.name;
        const semesterProgramName=x.program?.name||(data.programs||[]).find(p=>refId(p)===refId(x.program))?.name||"Unlinked program";
        const semesterProgramCode=x.program?.code||(data.programs||[]).find(p=>refId(p)===refId(x.program))?.code||"";
        const semesterSessionName=x.academicSession?.name||(sessions||[]).find(row=>refId(row)===refId(x.academicSession))?.name||"Unlinked session";
        const semesterSectionCount=(data.sections||[]).filter(section=>{
          if(refId(section.academicSession)!==refId(x.academicSession))return false;
          if(String(section.semester||"").trim().toLocaleLowerCase()!==String(x.name||"").trim().toLocaleLowerCase())return false;
          if(refId(section.programId))return refId(section.programId)===refId(x.program);
          const value=typeof section.program==="object"?(section.program?.name||section.program?.code):section.program;
          return [semesterProgramName,semesterProgramCode].some(alias=>String(alias||"").trim().toLocaleLowerCase()===String(value||"").trim().toLocaleLowerCase());
        }).length;
        const section=data.sections.find(v=>refId(v)===refId(x.section));
        const sectionLabel=x.section?.name || (section ? `${section.program||""} ${section.semester||""} · ${section.name||""}` : null);
        return <article className="master-card" key={x._id}>
          <div className="master-card-top">
            <div className="master-card-icon">
              {key==="programs"?<BookOpen size={19}/>:key==="faculty"?<Users size={19}/>:key==="subjects"?<BookOpen size={19}/>:key==="sections"?<Users size={19}/>:key==="rooms"?<DoorOpen size={19}/>:<Clock3 size={19}/>} 
            </div>
            <div className="master-card-title">
              <h3>{key==="programs"?x.name:key==="semesters"?x.name:key==="faculty"?x.name:key==="subjects"?x.name:key==="sections"?x.name:key==="rooms"?x.name:`${x.startTime||""} – ${x.endTime||""}`}</h3>
              <span>{key==="programs"?x.code||"Program":key==="semesters"?`${semesterProgramName}${semesterProgramCode?` · ${semesterProgramCode}`:""}`:key==="faculty"?x.code||"Faculty":key==="subjects"?x.code||"Subject":key==="sections"?`${x.program||""} · ${x.semester||""}`:key==="rooms"?x.type||"Room":x.day||"Time Slot"}</span>
            </div>
            <span className={`master-status ${x.active===false?"inactive":"active"}`}>{x.active===false?"Inactive":"Active"}</span>
          </div>
          {key==="semesters"&&<div className="semester-card-context">
            <span><small>Academic session</small><strong>{semesterSessionName}</strong></span>
            <span><small>Program</small><strong>{semesterProgramName}</strong></span>
          </div>}
          <div className="master-card-details">
            {key==="semesters" && <>
              <div><small>Display order</small><strong>{x.order||1}</strong></div>
              <div><small>Linked sections</small><strong>{semesterSectionCount}</strong></div>
            </>}
            {key==="programs" && <>
              <div><small>Department</small><strong>{x.department||"—"}</strong></div>
              <div><small>Duration</small><strong>{x.durationYears||"—"} years</strong></div>
            </>}
            {key==="faculty" && <>
              <div><small>Max Days</small><strong>{x.maxWorkingDays||"—"} / week</strong></div>
              <div><small>Max Classes</small><strong>{x.maxClassesPerDay||"—"} / day</strong></div>
              <div className="wide"><small>Available Days</small><strong>{(x.availableDays||[]).join(" · ")||"—"}</strong></div>
            </>}
            {key==="subjects" && <>
              <div><small>Faculty</small><strong className={!refId(x.faculty)?"text-danger":""}>{facultyName||"Not mapped"}</strong></div>
              <div><small>Section</small><strong className={!refId(x.section)?"text-danger":""}>{sectionLabel||"Not mapped"}</strong></div>
              <div><small>Total Sessions</small><strong>{x.totalSessions||"—"}</strong></div>
              <div><small>Max / Week</small><strong>{x.maxClassesPerWeek||x.classesPerWeek||"—"}</strong></div>
              <div><small>Room Type</small><strong>{x.roomType||"—"}</strong></div>
            </>}
            {key==="sections" && <>
              <div><small>Academic Session</small><strong>{(sessions||[]).find(s=>refId(s)===refId(x.academicSession))?.name||"—"}</strong></div>
              <div><small>Program</small><strong>{x.program||"—"}</strong></div>
              <div><small>Semester</small><strong>{x.semester||"—"}</strong></div>
              <div><small>Max Classes / Day</small><strong>{x.maxClassesPerDay||"—"}</strong></div>
            </>}
            {key==="rooms" && <>
              <div><small>Type</small><strong>{x.type||"—"}</strong></div>
              <div><small>Capacity</small><strong>{x.capacity||"—"} seats</strong></div>
            </>}
            {key==="timeslots" && <>
              <div><small>Day</small><strong>{x.day||"—"}</strong></div>
              <div><small>Time</small><strong>{x.startTime||"—"} – {x.endTime||"—"}</strong></div>
              <div><small>Period Order</small><strong>{x.order||"—"}</strong></div>
              <div><small>Academic Session</small><strong>{(sessions||[]).find(s=>refId(s)===refId(x.academicSession))?.name||"All sessions"}</strong></div>
              <div><small>Program</small><strong>{(data.programs||[]).find(p=>refId(p)===refId(x.program))?.name||"All programs"}</strong></div>
              <div><small>Semester</small><strong>{x.semester||"All semesters"}</strong></div>
            </>}
          </div>
          <div className="master-card-actions">
            <button className="secondary" onClick={()=>edit(x)}>Edit</button>
            <button className="icon-btn danger-btn" onClick={()=>del(x._id)} title="Delete"><Trash2 size={16}/></button>
          </div>
        </article>
      })}
      {!list.length && <div className="master-empty"><BookOpen size={28}/><h3>No {type.toLowerCase()} yet</h3><p>Add your first {type.slice(0,-1).toLowerCase()} using the form above.</p></div>}
    </div>
  </div>
}
