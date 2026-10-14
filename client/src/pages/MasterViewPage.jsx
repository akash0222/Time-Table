import React, {useState} from "react";
import axios from "axios";
import {API} from "../core/api";
import {days, apiName, refId} from "../core/utils.js";
import {Input, Select} from "../components/SharedComponents.jsx";
import {Users, BookOpen, DoorOpen, Clock3, Trash2} from "lucide-react";

export default function MasterView({type,data,setData,reload}){
  const key=Object.keys(apiName).find(k=>apiName[k]===type);
  const [form,setForm]=useState({});
  const [editingId,setEditingId]=useState(null);
  const [saving,setSaving]=useState(false);

  function reset(){
    setForm({});
    setEditingId(null);
  }

  function edit(record){
    if(key==="subjects"){
      setForm({
        name:record.name||"",
        code:record.code||"",
        faculty:record.faculty?._id||record.faculty||"",
        section:record.section?._id||record.section||"",
        classesPerWeek:record.classesPerWeek||1,
        totalSessions:record.totalSessions||0,
        maxClassesPerWeek:Number(record.totalSessions||0)===0?Math.max(Number(record.maxClassesPerWeek||0),Number(record.classesPerWeek||1)):(record.maxClassesPerWeek||record.classesPerWeek||1),
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

    if(key==="programs") body={
      name:body.name,code:body.code,department:body.department,
      durationYears:Number(body.durationYears||4),active:true
    };

    if(key==="faculty") body={
      name:body.name,code:body.code,
      maxWorkingDays:Number(body.maxWorkingDays||5),
      maxClassesPerDay:Number(body.maxClassesPerDay||4),
      availableDays:body.availableDays||days,
      unavailableSlots:body.unavailableSlots||[]
    };

    if(key==="sections") body={
      program:body.program,semester:body.semester,name:body.name,
      maxClassesPerDay:Number(body.maxClassesPerDay||5)
    };

    if(key==="rooms") body={
      name:body.name,type:body.type||"Classroom",
      capacity:Number(body.capacity||60)
    };

    if(key==="timeslots") body={
      day:body.day||"Monday",startTime:body.startTime,
      endTime:body.endTime,order:Number(body.order||1),isBreak:false
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
      if(body.totalSessions===0&&body.maxClassesPerWeek<body.classesPerWeek){
        setMessage("Max Classes / Week must be at least Classes / Week when Total Sessions is 0.");
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
      reset();
      await reload();
    }catch(e){
      setMessage(e.response?.data?.message||e.message);
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
        <Input label="Default Classes / Week" type="number" value={form.classesPerWeek||1} onChange={v=>setForm(current=>{const nextWeekly=Math.max(1,Number(v||1));const next={...current,classesPerWeek:v};if(Number(current.totalSessions||0)===0&&Number(current.maxClassesPerWeek||0)<nextWeekly)next.maxClassesPerWeek=String(nextWeekly);return next;})}/>
        <Input label="Total Sessions / Academic Session" type="number" value={form.totalSessions||0} onChange={v=>setForm({...form,totalSessions:v})}/>
        <Input label="Max Classes / Week" type="number" value={form.maxClassesPerWeek||form.classesPerWeek||1} onChange={v=>setForm({...form,maxClassesPerWeek:v})}/>
        <Input label="Duration (Periods)" type="number" value={form.duration||1} onChange={v=>setForm({...form,duration:v})}/>
        <Select label="Room Type" value={form.roomType||"Classroom"} options={[["Classroom","Classroom"],["Lab","Lab"],["Any","Any"]]} onChange={v=>setForm({...form,roomType:v})}/>
      </>}

      {key==="sections" && <>
        <Input label="Program" value={form.program} onChange={v=>setForm({...form,program:v})}/>
        <Input label="Semester" value={form.semester} onChange={v=>setForm({...form,semester:v})}/>
        <Input label="Section" value={form.name} onChange={v=>setForm({...form,name:v})}/>
        <Input label="Max Classes / Day" type="number" value={form.maxClassesPerDay||5} onChange={v=>setForm({...form,maxClassesPerDay:v})}/>
      </>}

      {key==="rooms" && <>
        <Input label="Room Name" value={form.name} onChange={v=>setForm({...form,name:v})}/>
        <Select label="Type" value={form.type||"Classroom"} options={[["Classroom","Classroom"],["Lab","Lab"]]} onChange={v=>setForm({...form,type:v})}/>
        <Input label="Capacity" type="number" value={form.capacity||60} onChange={v=>setForm({...form,capacity:v})}/>
      </>}

      {key==="timeslots" && <>
        <Select label="Day" value={form.day||"Monday"} options={days.map(d=>[d,d])} onChange={v=>setForm({...form,day:v})}/>
        <Input label="Start" type="time" value={form.startTime} onChange={v=>setForm({...form,startTime:v})}/>
        <Input label="End" type="time" value={form.endTime} onChange={v=>setForm({...form,endTime:v})}/>
        <Input label="Order" type="number" value={form.order||1} onChange={v=>setForm({...form,order:v})}/>
      </>}

      <div className="form-actions">
        <button className="primary add" onClick={save} disabled={saving}>
          {saving?(editingId?"Saving...":"Adding..."):(editingId?`Update ${type.slice(0,-1)}`:`+ Add ${type}`)}
        </button>
        {editingId && <button className="secondary" onClick={reset}>Cancel Edit</button>}
      </div>
    </div>

    {key==="subjects" && <div className="message success" style={{marginTop:12}}>
      <strong>Important:</strong> Every subject must have a Faculty and Section. Set Total Sessions for the full academic session. Max Classes / Week controls how many times the subject may appear in one week.
    </div>}

    <div className="master-card-grid">
      {list.map(x=>{
        const facultyName=x.faculty?.name || data.faculty.find(f=>refId(f)===refId(x.faculty))?.name;
        const section=data.sections.find(v=>refId(v)===refId(x.section));
        const sectionLabel=x.section?.name || (section ? `${section.program||""} ${section.semester||""} · ${section.name||""}` : null);
        return <article className="master-card" key={x._id}>
          <div className="master-card-top">
            <div className="master-card-icon">
              {key==="programs"?<BookOpen size={19}/>:key==="faculty"?<Users size={19}/>:key==="subjects"?<BookOpen size={19}/>:key==="sections"?<Users size={19}/>:key==="rooms"?<DoorOpen size={19}/>:<Clock3 size={19}/>} 
            </div>
            <div className="master-card-title">
              <h3>{key==="programs"?x.name:key==="faculty"?x.name:key==="subjects"?x.name:key==="sections"?x.name:key==="rooms"?x.name:`${x.startTime||""} – ${x.endTime||""}`}</h3>
              <span>{key==="programs"?x.code||"Program":key==="faculty"?x.code||"Faculty":key==="subjects"?x.code||"Subject":key==="sections"?`${x.program||""} · ${x.semester||""}`:key==="rooms"?x.type||"Room":x.day||"Time Slot"}</span>
            </div>
            <span className="master-status">Active</span>
          </div>
          <div className="master-card-details">
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
              <div><small>Order</small><strong>{x.order||"—"}</strong></div>
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
