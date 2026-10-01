import React, {useMemo, useState} from "react";
import {Download, Printer, RefreshCw, Search, BookOpen} from "lucide-react";

const DAYS=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];

function idOf(value){return String(value?._id??value??"");}
function norm(value){return String(value??"").trim().toLowerCase();}
function resolveProgram(section, programs){
  const raw=String(section?.program??"").trim();
  if(!raw)return null;
  return (programs||[]).find(p=>idOf(p)===raw||norm(p.name)===norm(raw)||norm(p.code)===norm(raw))||null;
}
function programKey(program){return idOf(program)||norm(program?.name)||norm(program?.code)||"unassigned";}
function formatTime(start,end){
  if(!start&&!end)return "";
  return `${start||""}${end?` – ${end}`:""}`;
}
function compareTime(a,b){
  const ao=Number(a.order||0),bo=Number(b.order||0);
  if(ao!==bo)return ao-bo;
  return String(a.startTime||"").localeCompare(String(b.startTime||""));
}
function slotKey(e){return `${e.day}|${e.startTime}|${e.endTime}|${Number(e.order||0)}`;}

function ClassBlock({entry,onOpen}){
  const section=entry.__section;
  return <button className="master-class-block" onClick={()=>onOpen(entry)} title="View class details">
    <div className="master-class-title">{entry.subject?.code||entry.subject?.name||"Subject"}{entry.subject?.code&&entry.subject?.name?` · ${entry.subject.name}`:""}</div>
    <div className="master-class-faculty">{entry.faculty?.name||"Faculty"}</div>
    <div className="master-class-time">{formatTime(entry.startTime,entry.endTime)}</div>
    <div className="master-class-room">Room - {entry.room?.name||"Free"}</div>
  </button>;
}

export default function AllProgramTimetables({timetable,data,setMessage}){
  const [programFilter,setProgramFilter]=useState("ALL");
  const [search,setSearch]=useState("");
  const [details,setDetails]=useState(null);

  const programs=data?.programs||[];
  const sections=data?.sections||[];
  const allEntries=Array.isArray(timetable?.entries)?timetable.entries:[];

  const enriched=useMemo(()=>allEntries.map(e=>{
    const section=e.section?._id?e.section:sections.find(s=>idOf(s)===idOf(e.section));
    const program=resolveProgram(section,programs);
    return {...e,__section:section,__program:program};
  }),[allEntries,sections,programs]);

  const visibleEntries=useMemo(()=>enriched.filter(e=>{
    if(programFilter!=="ALL"&&programKey(e.__program)!==programFilter)return false;
    const q=norm(search);
    if(!q)return true;
    const hay=[e.__program?.name,e.__program?.code,e.__section?.name,e.__section?.semester,e.subject?.name,e.subject?.code,e.faculty?.name,e.room?.name].filter(Boolean).join(" ");
    return norm(hay).includes(q);
  }),[enriched,programFilter,search]);

  const columns=useMemo(()=>{
    const map=new Map();
    // Include every configured section, not only sections with scheduled classes.
    sections.forEach(section=>{
      const program=resolveProgram(section,programs);
      if(programFilter!=="ALL"&&programKey(program)!==programFilter)return;
      const id=idOf(section);
      if(id)map.set(id,{section,program,entries:[]});
    });
    visibleEntries.forEach(e=>{
      const id=idOf(e.__section);
      if(!id)return;
      if(!map.has(id))map.set(id,{section:e.__section,program:e.__program,entries:[]});
      map.get(id).entries.push(e);
    });
    return [...map.values()].sort((a,b)=>{
      const pa=String(a.program?.name||a.section?.program||"");
      const pb=String(b.program?.name||b.section?.program||"");
      return pa.localeCompare(pb)||String(a.section?.semester||"").localeCompare(String(b.section?.semester||""),undefined,{numeric:true})||String(a.section?.name||"").localeCompare(String(b.section?.name||""));
    });
  },[sections,programs,programFilter,visibleEntries]);

  const programGroups=useMemo(()=>{
    const groups=[];
    columns.forEach((col,index)=>{
      const key=programKey(col.program)||norm(col.section?.program)||`group-${index}`;
      let group=groups.find(g=>g.key===key);
      if(!group){group={key,name:col.program?.name||col.section?.program||"Unassigned Program",code:col.program?.code||"",columns:[]};groups.push(group);}
      group.columns.push(col);
    });
    return groups;
  },[columns]);

  const stats=useMemo(()=>({
    programs:new Set(columns.map(c=>programKey(c.program)).filter(Boolean)).size,
    sections:columns.length,
    classes:visibleEntries.length,
    faculty:new Set(visibleEntries.map(e=>idOf(e.faculty)).filter(Boolean)).size
  }),[columns,visibleEntries]);

  function dayEntries(column,day){
    return column.entries.filter(e=>e.day===day).sort(compareTime);
  }

  function print(){window.print();}

  function exportCsv(){
    const rows=visibleEntries.map(e=>({
      Program:e.__program?.name||e.__section?.program||"Unassigned",
      ProgramCode:e.__program?.code||"",
      Semester:e.__section?.semester||"",
      Section:e.__section?.name||"",
      Day:e.day||"",
      Time:formatTime(e.startTime,e.endTime),
      Subject:e.subject?.name||e.subject?.code||"",
      Faculty:e.faculty?.name||"",
      Room:e.room?.name||""
    }));
    const header=["Program","ProgramCode","Semester","Section","Day","Time","Subject","Faculty","Room"];
    const csv=[header.join(","),...rows.map(r=>header.map(k=>`"${String(r[k]??"").replaceAll('"','""')}"`).join(","))].join("\n");
    const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob);const a=document.createElement("a");
    a.href=url;a.download="master-all-program-timetable.csv";a.click();URL.revokeObjectURL(url);
    setMessage?.("Master timetable exported to CSV.");
  }

  return <div className="master-timetable-page">
    <section className="master-timetable-toolbar no-print">
      <div>
        <div className="master-timetable-eyebrow">ACADEMIC WORKSPACE</div>
        <h2>All Program Timetable</h2>
        <p>Master view — all programs and sections are shown together in one timetable.</p>
      </div>
      <div className="master-timetable-actions">
        <button className="secondary" onClick={()=>{setProgramFilter("ALL");setSearch("")}}><RefreshCw size={15}/> Reset</button>
        <button className="secondary" onClick={exportCsv} disabled={!visibleEntries.length}><Download size={15}/> CSV</button>
        <button className="primary" onClick={print}><Printer size={15}/> Print</button>
      </div>
    </section>

    <section className="master-timetable-filters no-print">
      <label>Program
        <select value={programFilter} onChange={e=>setProgramFilter(e.target.value)}>
          <option value="ALL">All Programs</option>
          {programs.filter(p=>p.active!==false).map(p=><option key={idOf(p)} value={programKey(p)}>{p.name}{p.code?` (${p.code})`:""}</option>)}
        </select>
      </label>
      <label className="master-search"><span>Search</span><div><Search size={15}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Subject, faculty, section, room..."/></div></label>
      <div className="master-summary"><span>Programs <b>{stats.programs}</b></span><span>Sections <b>{stats.sections}</b></span><span>Classes <b>{stats.classes}</b></span></div>
    </section>

    <section className="master-timetable-title print-title">
      <div><BookOpen size={19}/><div><strong>MASTER TIME TABLE</strong><small>{timetable?.academicSession?.name||timetable?.academicSessionName||"Current Academic Session"} · {timetable?.versionLabel||`Version ${timetable?.version||1}`}</small></div></div>
      <span>{timetable?.status||"DRAFT"}</span>
    </section>

    {!columns.length ? <section className="panel empty-state"><BookOpen size={30}/><h3>No program sections found</h3><p>Configure Programs and Sections first.</p></section> :
      <div className="master-timetable-scroll">
        <table className="master-timetable-table">
          <thead>
            <tr className="master-program-row">
              <th rowSpan="2" className="master-day-head">DATE / DAY</th>
              {programGroups.map(group=><th key={group.key} colSpan={group.columns.length} className="master-program-head">{group.name}{group.code?` (${group.code})`:""}</th>)}
            </tr>
            <tr className="master-section-row">
              {columns.map(col=><th key={idOf(col.section)}>{col.section?.name||"Section"}<small>{col.section?.semester?` · Sem ${col.section.semester}`:""}</small></th>)}
            </tr>
          </thead>
          <tbody>
            {DAYS.map(day=><tr key={day}>
              <th className="master-day-cell">{day}</th>
              {columns.map(col=>{
                const entries=dayEntries(col,day);
                return <td key={`${day}-${idOf(col.section)}`} className={entries.length?"master-filled-cell":"master-empty-cell"}>
                  {entries.length ? <div className="master-cell-stack">{entries.map((e,i)=><ClassBlock key={e._id||`${slotKey(e)}-${i}`} entry={e} onOpen={setDetails}/>)}</div> : <span>Free</span>}
                </td>;
              })}
            </tr>)}
          </tbody>
        </table>
      </div>
    }

    {details&&<div className="master-modal-backdrop no-print" onClick={()=>setDetails(null)}>
      <div className="master-modal" onClick={e=>e.stopPropagation()}>
        <div className="panel-head"><div><h3>Class Details</h3><p>{details.__program?.name||details.__section?.program||"Program"} · {details.day} · {formatTime(details.startTime,details.endTime)}</p></div><button className="icon-btn" onClick={()=>setDetails(null)}>×</button></div>
        <div className="master-detail-grid">
          <div><span>Program</span><strong>{details.__program?.name||details.__section?.program||"—"}</strong></div>
          <div><span>Section</span><strong>{details.__section?.name||"—"}</strong></div>
          <div><span>Semester</span><strong>{details.__section?.semester||"—"}</strong></div>
          <div><span>Subject</span><strong>{details.subject?.name||details.subject?.code||"—"}</strong></div>
          <div><span>Faculty</span><strong>{details.faculty?.name||"—"}</strong></div>
          <div><span>Room</span><strong>{details.room?.name||"—"}</strong></div>
        </div>
        <div className="master-modal-actions"><button className="primary" onClick={()=>setDetails(null)}>Close</button></div>
      </div>
    </div>}
  </div>;
}
