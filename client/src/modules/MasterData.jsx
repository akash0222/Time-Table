import React, {useEffect, useMemo, useState} from "react";
import axios from "axios";
import {CalendarDays, Users, BookOpen, DoorOpen, Clock3, WandSparkles, Database, Trash2, Settings2, Check, X, FileSpreadsheet, Upload, Lock, Send, RotateCcw, ShieldCheck, BarChart3, Activity, Bell, UserCheck, RefreshCw, Copy, QrCode, History, ClipboardCheck, UserPlus, DollarSign, GraduationCap, Search, ArrowRight, UsersRound} from "lucide-react";
import {API, days, apiName, refId} from "../core/api";
import {Input, Select} from "../components/FormControls";
import {Metric, Progress} from "../components/Metrics";
import {localToday, authRole} from "../core/helpers";

export function MasterDataSettings({data,setData,reload,setMessage}){
  const [section,setSection]=useState("Programs");
  const [query,setQuery]=useState("");
  const items=[
    {name:"Programs",key:"programs",icon:BookOpen,desc:"Academic programs, departments and duration."},
    {name:"Faculty",key:"faculty",icon:Users,desc:"Faculty workload and working-day settings."},
    {name:"Subjects",key:"subjects",icon:BookOpen,desc:"Subjects, faculty mapping and weekly load."},
    {name:"Sections",key:"sections",icon:Users,desc:"Program sections and daily class limits."},
    {name:"Rooms",key:"rooms",icon:DoorOpen,desc:"Classrooms, labs and room capacity."},
    {name:"Time Slots",key:"timeslots",icon:Clock3,desc:"Program-specific or global periods and scheduling order."},
    {name:"Availability",key:"availability",icon:Activity,desc:"Faculty availability by day and period."}
  ];
  const selected=items.find(x=>x.name===section)||items[0];
  const counts={programs:data.programs?.length||0,faculty:data.faculty?.length||0,subjects:data.subjects?.length||0,sections:data.sections?.length||0,rooms:data.rooms?.length||0,timeslots:(data.timeslots||[]).filter(x=>!x.isBreak).length};
  const total=Object.values(counts).reduce((a,b)=>a+b,0);
  const filteredItems=items.filter(x=>`${x.name} ${x.desc}`.toLowerCase().includes(query.toLowerCase()));
  function select(name){setSection(name);setQuery("");}
  return <div className="master-settings-page">
    <section className="master-settings-hero">
      <div>
        <span className="master-settings-eyebrow">ADMINISTRATION · MASTER DATA</span>
        <h2>Master Data Settings</h2>
        <p>Manage the academic data used by timetable generation, attendance and fees from one place.</p>
      </div>
      <div className="master-settings-total"><strong>{total}</strong><span>configured records</span></div>
    </section>

    <section className="master-overview-grid">
      {items.slice(0,6).map(({name,key,icon:Icon})=><button key={name} className={`master-overview-card ${section===name?"active":""}`} onClick={()=>select(name)}>
        <span className="master-overview-icon"><Icon size={18}/></span>
        <span className="master-overview-copy"><b>{name}</b><small>{counts[key]} record{counts[key]===1?"":"s"}</small></span>
        <span className="master-overview-arrow">›</span>
      </button>)}
    </section>

    <section className="master-settings-body">
      <aside className="master-settings-menu">
        <div className="master-menu-title">Data Categories</div>
        <div className="master-menu-search"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search categories..."/></div>
        {filteredItems.map(({name,icon:Icon,desc})=><button key={name} className={`master-menu-item ${section===name?"active":""}`} onClick={()=>select(name)}>
          <span className="master-menu-icon"><Icon size={17}/></span><span><b>{name}</b><small>{desc}</small></span><span className="master-menu-arrow">›</span>
        </button>)}
      </aside>
      <div className="master-settings-content">
        <div className="master-settings-heading">
          <div><span className="master-settings-kicker">MASTER DATA</span><h3>{selected.name}</h3><p>{selected.desc}</p></div>
          {selected.name!=="Availability"&&<span className="master-record-pill">{counts[selected.key]} records</span>}
        </div>
        {selected.name==="Availability"
          ? <AvailabilityMatrix data={data} reload={reload} setMessage={setMessage}/>
          : <MasterView type={selected.name} data={data} setData={setData} reload={reload}/>
        }
      </div>
    </section>
  </div>;
}


export function MasterView({type,data,setData,reload}){
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
        maxClassesPerWeek:record.maxClassesPerWeek||record.classesPerWeek||1,
        duration:record.duration||1,
        roomType:record.roomType||"Classroom"
      });
    }else if(key==="sections"){
      const raw=String(record.program||"");
<<<<<<< HEAD
      const program=(data.programs||[]).find(p=>refId(p)===raw||String(p.name||"").toLowerCase()===raw.toLowerCase()||String(p.code||"").toLowerCase()===raw.toLowerCase());
      setForm({...record,program:program?.code||program?.name||raw});
=======
      const program=(data.programs||[]).find(p=>refId(p)===String(record.programId||"")||refId(p)===raw||String(p.name||"").toLowerCase()===raw.toLowerCase()||String(p.code||"").toLowerCase()===raw.toLowerCase());
      setForm({...record,programId:program?._id||record.programId||"",program:program?.code||program?.name||raw});
>>>>>>> 62a144d (Phase 18 QA fixes and Link2 runtime fix)
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

<<<<<<< HEAD
    if(key==="sections") body={
      program:body.program,semester:body.semester,name:body.name,
      maxClassesPerDay:Number(body.maxClassesPerDay||5)
    };
=======
    if(key==="sections") {
      const program=(data.programs||[]).find(p=>refId(p)===String(body.programId||"")||String(p.name||"").toLowerCase()===String(body.program||"").toLowerCase()||String(p.code||"").toLowerCase()===String(body.program||"").toLowerCase());
      if(!program){ setMessage("Select a valid Program for this section."); return; }
      body={
        programId:program._id,
        program:program.code||program.name,
        semester:body.semester,
        name:body.name,
        maxClassesPerDay:Number(body.maxClassesPerDay||5)
      };
    }
>>>>>>> 62a144d (Phase 18 QA fixes and Link2 runtime fix)

    if(key==="rooms") body={
      name:body.name,type:body.type||"Classroom",
      capacity:Number(body.capacity||60)
    };

    if(key==="timeslots") body={
      program:body.program||null,
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
    <div className={`form-grid ${key==="timeslots"?"timeslot-form-grid":""}`}>
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
        <Input label="Default Classes / Week" type="number" value={form.classesPerWeek||1} onChange={v=>setForm({...form,classesPerWeek:v})}/>
        <Input label="Total Sessions / Academic Session" type="number" value={form.totalSessions||0} onChange={v=>setForm({...form,totalSessions:v})}/>
        <Input label="Max Classes / Week" type="number" value={form.maxClassesPerWeek||form.classesPerWeek||1} onChange={v=>setForm({...form,maxClassesPerWeek:v})}/>
        <Input label="Duration (Periods)" type="number" value={form.duration||1} onChange={v=>setForm({...form,duration:v})}/>
        <Select label="Room Type" value={form.roomType||"Classroom"} options={[["Classroom","Classroom"],["Lab","Lab"],["Any","Any"]]} onChange={v=>setForm({...form,roomType:v})}/>
      </>}

      {key==="sections" && <>
        <Select
          label="Program"
<<<<<<< HEAD
          value={form.program||""}
          options={(data.programs||[]).filter(p=>p.active!==false).map(p=>[p.code||p.name,p.name])}
          onChange={v=>setForm({...form,program:v})}
=======
          value={form.programId||""}
          options={[["","Select Program"],...(data.programs||[]).filter(p=>p.active!==false).map(p=>[p._id,`${p.name}${p.code?` (${p.code})`:""}`])]}
          onChange={v=>{const p=(data.programs||[]).find(x=>refId(x)===v);setForm({...form,programId:v,program:p?.code||p?.name||""})}}
>>>>>>> 62a144d (Phase 18 QA fixes and Link2 runtime fix)
        />
        <Input label="Semester" value={form.semester||""} onChange={v=>setForm({...form,semester:v})}/>
        <Input label="Section" value={form.name||""} onChange={v=>setForm({...form,name:v})}/>
        <Input label="Max Classes / Day" type="number" value={form.maxClassesPerDay||5} onChange={v=>setForm({...form,maxClassesPerDay:v})}/>
      </>}

      {key==="rooms" && <>
        <Input label="Room Name" value={form.name} onChange={v=>setForm({...form,name:v})}/>
        <Select label="Type" value={form.type||"Classroom"} options={[["Classroom","Classroom"],["Lab","Lab"]]} onChange={v=>setForm({...form,type:v})}/>
        <Input label="Capacity" type="number" value={form.capacity||60} onChange={v=>setForm({...form,capacity:v})}/>
      </>}

      {key==="timeslots" && <>
        <Select
          label="Program"
          value={form.program?._id||form.program||""}
          options={[[ "", "All Programs (Global Slot)" ], ...(data.programs||[]).map(p=>[p._id, `${p.name}${p.code?` (${p.code})`:""}`])]}
          onChange={v=>setForm({...form,program:v||null})}
        />
        <Select label="Day" value={form.day||"Monday"} options={days.map(d=>[d,d])} onChange={v=>setForm({...form,day:v})}/>
        <Input label="Start" type="time" value={form.startTime||""} onChange={v=>setForm({...form,startTime:v})}/>
        <Input label="End" type="time" value={form.endTime||""} onChange={v=>setForm({...form,endTime:v})}/>
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
              <span>{key==="programs"?x.code||"Program":key==="faculty"?x.code||"Faculty":key==="subjects"?x.code||"Subject":key==="sections"?`${x.program||""} · ${x.semester||""}`:key==="rooms"?x.type||"Room":`${x.day||"Time Slot"} · ${x.program?.name || (data.programs||[]).find(p=>refId(p)===refId(x.program))?.code || "Global"}`}</span>
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
<<<<<<< HEAD
              <div><small>Program</small><strong>{x.program||"—"}</strong></div>
=======
              <div><small>Program</small><strong>{(data.programs||[]).find(p=>refId(p)===String(x.programId||""))?.name||x.program||"—"}</strong></div>
>>>>>>> 62a144d (Phase 18 QA fixes and Link2 runtime fix)
              <div><small>Semester</small><strong>{x.semester||"—"}</strong></div>
              <div><small>Max Classes / Day</small><strong>{x.maxClassesPerDay||"—"}</strong></div>
            </>}
            {key==="rooms" && <>
              <div><small>Type</small><strong>{x.type||"—"}</strong></div>
              <div><small>Capacity</small><strong>{x.capacity||"—"} seats</strong></div>
            </>}
            {key==="timeslots" && <>
              <div><small>Program</small><strong>{x.program?.name || (data.programs||[]).find(p=>refId(p)===refId(x.program))?.name || "All Programs (Global)"}</strong></div>
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


<<<<<<< HEAD
=======

export function ProgramSectionMapping({data,reload,setMessage}){
  const programs=data.programs||[];
  const sections=data.sections||[];
  const [programId,setProgramId]=useState("");
  const [semester,setSemester]=useState("");
  const [sectionName,setSectionName]=useState("");
  const [maxClassesPerDay,setMaxClassesPerDay]=useState(5);
  const [editingId,setEditingId]=useState(null);
  const [saving,setSaving]=useState(false);
  const [q,setQ]=useState("");
  const selectedProgram=programs.find(p=>refId(p)===programId);
  const semesters=[...new Set(sections.filter(s=>!programId||String(s.programId||"")===programId||String(s.program||"").toLowerCase()===String(selectedProgram?.name||"").toLowerCase()||String(s.program||"").toLowerCase()===String(selectedProgram?.code||"").toLowerCase()).map(s=>String(s.semester||"")).filter(Boolean))];
  const filtered=sections.filter(s=>{const p=programs.find(x=>refId(x)===String(s.programId||"")||String(x.name||"").toLowerCase()===String(s.program||"").toLowerCase()||String(x.code||"").toLowerCase()===String(s.program||"").toLowerCase());return (!programId||refId(p)===programId)&&(!semester||String(s.semester)===semester)&&(!q||`${p?.name||s.program} ${s.semester} ${s.name}`.toLowerCase().includes(q.toLowerCase()))});
  function reset(){setProgramId("");setSemester("");setSectionName("");setMaxClassesPerDay(5);setEditingId(null)}
  function edit(s){const p=programs.find(x=>refId(x)===String(s.programId||"")||String(x.name||"").toLowerCase()===String(s.program||"").toLowerCase()||String(x.code||"").toLowerCase()===String(s.program||"").toLowerCase());setProgramId(p?._id||"");setSemester(s.semester||"");setSectionName(s.name||"");setMaxClassesPerDay(s.maxClassesPerDay||5);setEditingId(s._id);window.scrollTo({top:0,behavior:"smooth"})}
  async function save(){if(!programId||!semester||!sectionName)return setMessage("Program, Semester and Section are required.");const p=programs.find(x=>refId(x)===programId);if(!p)return setMessage("Select a valid Program.");setSaving(true);try{const body={programId:p._id,program:p.code||p.name,semester:String(semester).trim(),name:String(sectionName).trim(),maxClassesPerDay:Number(maxClassesPerDay||5)};if(editingId)await axios.put(`${API}/sections/${editingId}`,body);else await axios.post(`${API}/sections`,body);setMessage(editingId?"Program-section mapping updated.":"Program-section mapping created.");reset();await reload()}catch(e){setMessage(e.response?.data?.message||e.message)}finally{setSaving(false)}}
  async function remove(id){if(!confirm("Delete this section mapping? Students mapped to this section should be moved first."))return;try{await axios.delete(`${API}/sections/${id}`);setMessage("Section mapping deleted.");await reload()}catch(e){setMessage(e.response?.data?.message||e.message)}}
  return <div className="program-section-mapping-page">
    <section className="master-settings-hero"><div><span className="master-settings-eyebrow">MASTER DATA · ACADEMIC STRUCTURE</span><h2>Program & Section Mapping</h2><p>Define which sections belong to each program and semester. This mapping drives student mapping, subjects, attendance and timetable generation.</p></div><div className="master-settings-total"><strong>{sections.length}</strong><span>sections mapped</span></div></section>
    <section className="panel"><div className="panel-head"><div><h3>{editingId?"Edit Mapping":"Create Program → Semester → Section"}</h3><p>Always select the Program from the master list. Avoid free-text program names.</p></div></div><div className="form-grid"><Select label="Program" value={programId} options={[["","Select Program"],...programs.filter(p=>p.active!==false).map(p=>[p._id,`${p.name}${p.code?` (${p.code})`:""}`])]} onChange={v=>{setProgramId(v);setSemester("")}}/><Input label="Semester" value={semester} onChange={setSemester}/><Input label="Section Name" value={sectionName} onChange={setSectionName}/><Input label="Max Classes / Day" type="number" value={maxClassesPerDay} onChange={setMaxClassesPerDay}/><div className="form-actions"><button className="primary" onClick={save} disabled={saving}>{saving?(editingId?"Updating...":"Creating..."):(editingId?"Update Mapping":"Create Mapping")}</button>{editingId&&<button className="secondary" onClick={reset}>Cancel</button>}</div></div></section>
    <section className="panel"><div className="panel-head"><div><h3>Program / Section Directory</h3><p>Search and manage the academic structure used by students and timetable subjects.</p></div></div><div className="view-filter"><div style={{display:"flex",gap:10,flexWrap:"wrap"}}><select value={programId} onChange={e=>{setProgramId(e.target.value);setSemester("")}}><option value="">All Programs</option>{programs.map(p=><option key={p._id} value={p._id}>{p.name}{p.code?` (${p.code})`:""}</option>)}</select><select value={semester} onChange={e=>setSemester(e.target.value)}><option value="">All Semesters</option>{semesters.map(s=><option key={s}>{s}</option>)}</select><input placeholder="Search program, semester or section..." value={q} onChange={e=>setQ(e.target.value)}/></div></div><div className="table-wrap"><table><thead><tr><th>Program</th><th>Code</th><th>Semester</th><th>Section</th><th>Max / Day</th><th>Students</th><th>Actions</th></tr></thead><tbody>{filtered.map(s=>{const p=programs.find(x=>refId(x)===String(s.programId||"")||String(x.name||"").toLowerCase()===String(s.program||"").toLowerCase()||String(x.code||"").toLowerCase()===String(s.program||"").toLowerCase());const count=studentsCount(data.students||[],s._id);return <tr key={s._id}><td><strong>{p?.name||s.program||"Unmapped"}</strong></td><td>{p?.code||"—"}</td><td>{s.semester}</td><td>{s.name}</td><td>{s.maxClassesPerDay||5}</td><td>{count}</td><td><button className="secondary" onClick={()=>edit(s)}>Edit</button> <button className="icon-btn danger-btn" onClick={()=>remove(s._id)}><Trash2 size={15}/></button></td></tr>})}{!filtered.length&&<tr><td colSpan="7">No program-section mappings found.</td></tr>}</tbody></table></div></section>
  </div>;
}
function studentsCount(students,sectionId){return students.filter(s=>refId(s.section)===String(sectionId)).length}

>>>>>>> 62a144d (Phase 18 QA fixes and Link2 runtime fix)
export function AvailabilityMatrix({data,reload,setMessage}){
  const [facultyId,setFacultyId]=useState("");
  const [matrix,setMatrix]=useState({});
  const [saving,setSaving]=useState(false);

  const selected=data.faculty.find(f=>f._id===facultyId) || data.faculty[0];
  const periodSlots=[...new Map(data.timeslots.filter(s=>!s.isBreak).sort((a,b)=>a.order-b.order).map(s=>[`${s.startTime}-${s.endTime}`,s])).values()];

  useEffect(()=>{
    if(!selected) return;
    setFacultyId(selected._id);
    const next={};
    for(const day of days){
      next[day]={};
      for(const slot of periodSlots){
        const k=`${day}|${slot.startTime}-${slot.endTime}`;
        next[day][slot.startTime]=!(selected.unavailableSlots||[]).includes(k) && (selected.availableDays||days).includes(day);
      }
    }
    setMatrix(next);
  },[selected?._id, data.timeslots.length]);

  if(!selected) return <div className="panel"><h3>No faculty found</h3><p>Add faculty first.</p></div>;

  const toggle=(day,start)=>setMatrix(prev=>({...prev,[day]:{...prev[day],[start]:!prev[day]?.[start]}}));
  const toggleDay=(day)=>{
    const enabled=periodSlots.every(slot=>matrix[day]?.[slot.startTime]);
    const next={...matrix[day]};
    periodSlots.forEach(slot=>next[slot.startTime]=!enabled);
    setMatrix({...matrix,[day]:next});
  };

  async function save(){
    setSaving(true); setMessage("");
    try{
      const availableDays=days.filter(day=>periodSlots.some(slot=>matrix[day]?.[slot.startTime]));
      const unavailableSlots=[];
      for(const day of days){
        for(const slot of periodSlots){
          if(!matrix[day]?.[slot.startTime]) unavailableSlots.push(`${day}|${slot.startTime}-${slot.endTime}`);
        }
      }
      await axios.put(`${API}/faculty/${selected._id}`,{...selected,availableDays,unavailableSlots,_id:undefined,createdAt:undefined,updatedAt:undefined});
      setMessage(`Availability saved for ${selected.name}.`);
      await reload();
    }catch(e){setMessage(e.response?.data?.message||e.message)}finally{setSaving(false)}
  }

  return <div className="panel availability-panel">
    <div className="toolbar"><div><h3>Faculty Availability Matrix</h3><p>Green cells are available. White cells are blocked. The generator uses this matrix as a hard constraint.</p></div>
      <select value={selected._id} onChange={e=>setFacultyId(e.target.value)}>{data.faculty.map(f=><option key={f._id} value={f._id}>{f.name} — max {f.maxWorkingDays} days/week</option>)}</select>
    </div>
    <div className="availability-summary"><span><Check size={14}/> Available</span><span><X size={14}/> Unavailable</span><span><Settings2 size={14}/> Max {selected.maxClassesPerDay} classes/day</span><span><CalendarDays size={14}/> Max {selected.maxWorkingDays} working days</span></div>
    <div className="availability-wrap"><table className="availability-table"><thead><tr><th>Day</th>{periodSlots.map(s=><th key={s._id}>{s.startTime}<br/>– {s.endTime}</th>)}</tr></thead>
      <tbody>{days.map(day=><tr key={day}><td><button className="day-toggle" onClick={()=>toggleDay(day)}>{day}</button></td>{periodSlots.map(slot=>{const on=!!matrix[day]?.[slot.startTime];return <td key={slot._id}><button className={on?"slot-btn on":"slot-btn off"} onClick={()=>toggle(day,slot.startTime)}>{on?<Check size={16}/>:<X size={16}/>}</button></td>})}</tr>)}</tbody></table></div>
    <div className="availability-footer"><div><strong>Working days:</strong> {days.filter(d=>periodSlots.some(s=>matrix[d]?.[s.startTime])).length} / {selected.maxWorkingDays} configured maximum</div><button className="primary" onClick={save} disabled={saving}>{saving?"Saving...":"Save Availability"}</button></div>
  </div>;
}



export function ExcelImport({reload,setMessage}){
  const [file,setFile]=useState(null);
  const [busy,setBusy]=useState(false);
  const [result,setResult]=useState(null);

  async function downloadTemplate(){
    try{
      const response=await axios.get(`${API}/import/template`,{responseType:"blob"});
      const url=URL.createObjectURL(response.data);
      const a=document.createElement("a"); a.href=url; a.download="timetable-import-template.xlsx"; a.click(); URL.revokeObjectURL(url);
    }catch(e){setMessage(e.response?.data?.message||e.message)}
  }

  async function upload(){
    if(!file){setMessage("Please select an Excel file first.");return;}
    setBusy(true); setMessage(""); setResult(null);
    try{
      const fd=new FormData(); fd.append("file",file);
      const r=await axios.post(`${API}/import/excel`,fd,{headers:{"Content-Type":"multipart/form-data"}});
      setResult(r.data.imported); await reload(); setMessage("Excel data imported successfully.");
    }catch(e){setMessage(e.response?.data?.message||e.message)}finally{setBusy(false)}
  }

  return <div className="panel import-panel">
    <div className="import-hero"><div><span className="pill light">EXCEL IMPORT</span><h2>Import your real timetable master data.</h2><p>Use the template to load programs, faculty, sections, rooms, time slots, subjects and period-wise availability into the local MongoDB database.</p></div><FileSpreadsheet size={52}/></div>
    <div className="import-actions"><button className="secondary" onClick={downloadTemplate}><FileSpreadsheet size={17}/> Download Excel Template</button><label className="file-picker"><Upload size={17}/><span>{file?file.name:"Choose Excel file"}</span><input type="file" accept=".xlsx,.xls" onChange={e=>setFile(e.target.files?.[0]||null)}/></label><button className="primary" onClick={upload} disabled={busy}>{busy?"Importing...":"Import to MongoDB"}</button></div>
    <div className="import-grid"><div><h3>Required sheets</h3><ul><li>Programs</li><li>Faculty</li><li>Sections</li><li>Rooms</li><li>TimeSlots</li><li>Subjects</li></ul></div><div><h3>Optional sheet</h3><ul><li>Availability — one row per faculty/day/period</li></ul><p>Example: <code>Dr. Amit Sharma | Monday | 09:00 | 10:00 | Yes</code></p></div></div>
    {result&&<div className="import-result">Imported: {Object.entries(result).map(([k,v])=><span key={k}><strong>{v}</strong> {k}</span>)}</div>}
  </div>
}



export function SchedulerSettings({settings,setSettings,setMessage}){
  const [saving,setSaving]=useState(false);

  const update=(key,value)=>{
    setSettings(prev=>({...prev,[key]:value}));
  };

  async function save(){
    setSaving(true);
    setMessage("");
    try{
      const payload={
        maxConsecutiveFaculty:Number(settings.maxConsecutiveFaculty||2),
        maxConsecutiveSection:Number(settings.maxConsecutiveSection||3),
        avoidSameSubjectSameDay:Boolean(settings.avoidSameSubjectSameDay),
        distributeSubjectAcrossDays:Boolean(settings.distributeSubjectAcrossDays),
        avoidFirstLastPeriod:Boolean(settings.avoidFirstLastPeriod),
        generationRuns:Number(settings.generationRuns||8),
        generationTimeLimitMs:Number(settings.generationTimeLimitMs||30000)
      };
      const r=await axios.put(`${API}/settings`,payload);
      setSettings(r.data);
      setMessage("Scheduler settings saved successfully.");
    }catch(e){
      setMessage(e.response?.data?.message||e.message);
    }finally{
      setSaving(false);
    }
  }

  return <div className="panel">
    <div className="panel-head">
      <div>
        <h3>Scheduler Settings</h3>
        <p>Configure the rules used by the timetable generator.</p>
      </div>
    </div>

    <div className="settings-grid">
      <div className="field">
        <label>Max Consecutive Classes — Faculty</label>
        <input
          type="number"
          min="1"
          max="8"
          value={settings.maxConsecutiveFaculty??2}
          onChange={e=>update("maxConsecutiveFaculty",e.target.value)}
        />
      </div>

      <div className="field">
        <label>Max Consecutive Classes — Section</label>
        <input
          type="number"
          min="1"
          max="8"
          value={settings.maxConsecutiveSection??3}
          onChange={e=>update("maxConsecutiveSection",e.target.value)}
        />
      </div>

      <label className="setting-check">
        <input
          type="checkbox"
          checked={!!settings.avoidSameSubjectSameDay}
          onChange={e=>update("avoidSameSubjectSameDay",e.target.checked)}
        />
        <span>
          <strong>Avoid Same Subject Same Day</strong>
          <small>Do not place repeated sessions of the same subject on one day.</small>
        </span>
      </label>

      <label className="setting-check">
        <input
          type="checkbox"
          checked={!!settings.distributeSubjectAcrossDays}
          onChange={e=>update("distributeSubjectAcrossDays",e.target.checked)}
        />
        <span>
          <strong>Distribute Subject Across Days</strong>
          <small>Spread weekly subject sessions across different days where possible.</small>
        </span>
      </label>

      <div className="field"><label>Generation Comparison Runs</label><input type="number" min="1" max="20" value={settings.generationRuns??8} onChange={e=>update("generationRuns",e.target.value)} /><small className="field-help">Generate multiple candidates and keep the best-scoring timetable.</small></div>
      <div className="field"><label>Total Generation Time (seconds)</label><input type="number" min="5" max="60" value={Math.round(Number(settings.generationTimeLimitMs??30000)/1000)} onChange={e=>update("generationTimeLimitMs",Math.max(5,Math.min(60,Number(e.target.value||30)))*1000)} /><small className="field-help">The time budget is shared across candidate generations.</small></div>

      <label className="setting-check">
        <input
          type="checkbox"
          checked={!!settings.avoidFirstLastPeriod}
          onChange={e=>update("avoidFirstLastPeriod",e.target.checked)}
        />
        <span>
          <strong>Avoid First / Last Period</strong>
          <small>Try not to use the first or last period.</small>
        </span>
      </label>
    </div>

    <div className="settings-footer">
      <button className="primary" onClick={save} disabled={saving}>
        {saving?"Saving...":"Save Settings"}
      </button>
    </div>
  </div>;
}

