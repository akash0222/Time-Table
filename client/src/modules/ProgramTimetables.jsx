import React, {useMemo, useState} from "react";
import {CalendarDays, Download, Printer, Search, UsersRound} from "lucide-react";
import {API, days, refId} from "../core/api";

function normalize(value){return String(value||"").trim().toLowerCase();}

function periodRows(timeslots=[]){
  const map=new Map();
  for(const slot of timeslots||[]){
    if(!slot || slot.isBreak) continue;
    const key=`${Number(slot.order||0)}|${slot.startTime||""}|${slot.endTime||""}`;
    if(!map.has(key)) map.set(key, slot);
  }
  return [...map.values()].sort((a,b)=>Number(a.order||0)-Number(b.order||0));
}

export default function ProgramTimetables({timetable,data}){
  const [programFilter,setProgramFilter]=useState("ALL");
  const [semesterFilter,setSemesterFilter]=useState("ALL");
  const [dayFilter,setDayFilter]=useState("ALL");
  const [query,setQuery]=useState("");

  const sections=data?.sections||[];
  const entries=timetable?.entries||[];
  const programs=data?.programs||[];
  const slots=useMemo(()=>periodRows(data?.timeslots||[]),[data?.timeslots]);
  const visibleDays=dayFilter==="ALL"?days:[dayFilter];

  const programInfo=useMemo(()=>{
    const map=new Map();
    for(const p of programs){
      const name=String(p.name||"").trim();
      const code=String(p.code||"").trim();
      if(name) map.set(normalize(name),{...p,displayName:name});
      if(code) map.set(normalize(code),{...p,displayName:name||code});
    }
    return map;
  },[programs]);

  const sectionById=useMemo(()=>new Map(sections.map(s=>[refId(s),s])),[sections]);

  const resolvedSection=entry=>{
    const section=entry.section?._id?entry.section:sectionById.get(refId(entry.section));
    return section||null;
  };

  const getProgram=section=>{
    const raw=String(section?.program||"").trim();
    const known=programInfo.get(normalize(raw));
    return {
      key:normalize(raw)||"unknown",
      name:known?.displayName||raw||"Unassigned Program",
      code:known?.code||""
    };
  };

  const programOptions=useMemo(()=>{
    const map=new Map();
    sections.forEach(s=>{
      const p=getProgram(s);
      if(!map.has(p.key)) map.set(p.key,p);
    });
    return [...map.values()].sort((a,b)=>a.name.localeCompare(b.name));
  },[sections,programInfo]);

  const semesterOptions=useMemo(()=>{
    const values=new Set();
    sections.forEach(s=>{
      const p=getProgram(s);
      if(programFilter!=="ALL"&&p.key!==programFilter)return;
      if(s.semester) values.add(String(s.semester));
    });
    return [...values].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
  },[sections,programFilter,programInfo]);

  const filteredEntries=useMemo(()=>{
    const q=normalize(query);
    return entries.filter(entry=>{
      const section=resolvedSection(entry);
      const program=getProgram(section);
      if(programFilter!=="ALL"&&program.key!==programFilter)return false;
      if(semesterFilter!=="ALL"&&String(section?.semester||"")!==semesterFilter)return false;
      if(dayFilter!=="ALL"&&entry.day!==dayFilter)return false;
      if(!q)return true;
      const hay=[
        program.name,program.code,section?.name,section?.semester,
        entry.subject?.name,entry.subject?.code,entry.faculty?.name,entry.room?.name
      ].join(" ").toLowerCase();
      return hay.includes(q);
    });
  },[entries,programFilter,semesterFilter,dayFilter,query,sectionById,programInfo]);

  const grouped=useMemo(()=>{
    const map=new Map();
    for(const entry of filteredEntries){
      const section=resolvedSection(entry);
      const program=getProgram(section);
      if(!map.has(program.key)) map.set(program.key,{...program,sections:new Map(),entries:[]});
      const group=map.get(program.key);
      group.entries.push(entry);
      const sid=refId(section);
      if(sid&&!group.sections.has(sid)) group.sections.set(sid,section);
    }
    return [...map.values()].sort((a,b)=>a.name.localeCompare(b.name));
  },[filteredEntries,sectionById,programInfo]);

  const totalClasses=filteredEntries.length;
  const totalSections=new Set(filteredEntries.map(e=>refId(e.section)).filter(Boolean)).size;

  const entryAt=(programEntries,day,slot)=>programEntries.filter(e=>
    e.day===day && Number(e.order||0)===Number(slot.order||0)
  );

  const labelForSection=e=>{
    const s=resolvedSection(e);
    return s?`${s.semester||""} · ${s.name||"Section"}`:"Section";
  };

  return <div className="program-timetable-page">
    <div className="program-timetable-hero">
      <div>
        <span className="pill light">ACADEMIC OVERVIEW</span>
        <h2>All Program Timetables</h2>
        <p>View every program, semester and section timetable together in one place. Each program is shown as a complete Monday–Sunday schedule.</p>
      </div>
      <CalendarDays size={52}/>
    </div>

    <section className="panel program-timetable-toolbar-panel">
      <div className="program-timetable-toolbar">
        <label>Program
          <select value={programFilter} onChange={e=>{setProgramFilter(e.target.value);setSemesterFilter("ALL");}}>
            <option value="ALL">All Programs</option>
            {programOptions.map(p=><option key={p.key} value={p.key}>{p.name}{p.code?` · ${p.code}`:""}</option>)}
          </select>
        </label>
        <label>Semester
          <select value={semesterFilter} onChange={e=>setSemesterFilter(e.target.value)}>
            <option value="ALL">All Semesters</option>
            {semesterOptions.map(s=><option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label>Day
          <select value={dayFilter} onChange={e=>setDayFilter(e.target.value)}>
            <option value="ALL">Monday–Sunday</option>
            {days.map(d=><option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        <label className="program-search-field">Search
          <span><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Subject, faculty, section..."/></span>
        </label>
      </div>
      <div className="program-timetable-actions">
        <button className="secondary" onClick={()=>window.print()}><Printer size={15}/> Print</button>
        <button className="secondary" onClick={()=>window.open(`${API}/timetable/export/excel`,"_blank")}><Download size={15}/> Excel</button>
        <button className="secondary" onClick={()=>window.open(`${API}/timetable/export/pdf`,"_blank")}><Download size={15}/> PDF</button>
      </div>
    </section>

    <div className="program-timetable-summary">
      <div><strong>{grouped.length}</strong><span>Programs shown</span></div>
      <div><strong>{totalSections}</strong><span>Sections scheduled</span></div>
      <div><strong>{totalClasses}</strong><span>Classes shown</span></div>
      <div><strong>{timetable?.versionLabel||`Version ${timetable?.version||"—"}`}</strong><span>{timetable?.status||"DRAFT"}</span></div>
    </div>

    {!timetable?.entries?.length ? <div className="empty-state"><h3>No timetable generated</h3><p>Generate a timetable first. Once generated, all program schedules will appear here automatically.</p></div> : !grouped.length ? <div className="empty-state"><h3>No matching timetable entries</h3><p>Change the program, semester, day or search filters.</p></div> : <div className="program-timetable-list">
      {grouped.map(program=><section className="panel program-timetable-card" key={program.key}>
        <div className="program-timetable-card-head">
          <div><h3>{program.name}</h3><p>{program.code||"Program"} · {program.sections.size} section{program.sections.size===1?"":"s"} · {program.entries.length} scheduled class{program.entries.length===1?"":"es"}</p></div>
          <div className="program-section-chips">{[...program.sections.values()].map(s=><span key={refId(s)}><UsersRound size={13}/>{s.semester} · {s.name}</span>)}</div>
        </div>
        <div className="program-timetable-scroll"><table className="program-timetable-grid"><thead><tr><th>Time</th>{visibleDays.map(d=><th key={d}>{d}</th>)}</tr></thead><tbody>
          {slots.map(slot=><tr key={`${program.key}-${slot.order}-${slot.startTime}`}>
            <td className="program-time-cell"><strong>{slot.startTime}</strong><span>{slot.endTime}</span></td>
            {visibleDays.map(day=><td key={`${program.key}-${day}-${slot.order}`}>
              <div className="program-class-stack">
                {entryAt(program.entries,day,slot).map((entry,i)=><div className="program-class-item" key={entry._id||i}>
                  <strong>{entry.subject?.name||"Subject"}</strong>
                  {entry.subject?.code&&<small>{entry.subject.code}</small>}
                  <span>{labelForSection(entry)}</span>
                  <span>{entry.faculty?.name||"Faculty"}</span>
                  <span>Room: {entry.room?.name||"—"}{Number(entry.duration||1)>1?` · ${entry.duration} periods`:""}</span>
                </div>)}
                {!entryAt(program.entries,day,slot).length&&<span className="program-free">Free</span>}
              </div>
            </td>)}
          </tr>)}
        </tbody></table></div>
      </section>)}
    </div>}
  </div>;
}
