import React, {useMemo, useState} from "react";
import axios from "axios";
import {API} from "../core/api";
import {days, refId, resolveEffectiveTimeSlots} from "../core/utils.js";
import {CalendarDays, FileSpreadsheet, GraduationCap, Search} from "lucide-react";

export default function AllProgramTimetables({timetable,data,activeSession}){
  const [programFilter,setProgramFilter]=useState("ALL");
  const [semesterFilter,setSemesterFilter]=useState("ALL");
  const [sectionFilter,setSectionFilter]=useState("ALL");
  const [query,setQuery]=useState("");

  const entries=timetable?.entries||[];
  const sections=data?.sections||[];
  const programs=data?.programs||[];

  const sectionMap=useMemo(()=>{
    const map=new Map();
    sections.forEach(s=>map.set(refId(s),s));
    return map;
  },[sections]);

  const getSection=(entry)=>{
    if(!entry?.section) return null;
    return typeof entry.section==="object"
      ? entry.section
      : sectionMap.get(refId(entry.section)) || null;
  };

  const programName=(section)=>{
    if(!section) return "Unassigned Program";
    if(typeof section==="string") return section;
    if(typeof section.program==="object") return section.program.name||section.program.code||"Unassigned Program";
    return section.programName||section.program||"Unassigned Program";
  };

  const semesterName=(section)=>{
    return section ? String(section.semester??section.year??"") : "";
  };

  const normalized=useMemo(()=>entries.map(entry=>{
    const section=getSection(entry);
    return {
      ...entry,
      __section:section,
      __program:String(programName(section)),
      __semester:semesterName(section),
      __sectionName:section?.name||""
    };
  }),[entries,sectionMap]);

  const programNames=useMemo(()=>{
    const set=new Set();
    programs.forEach(p=>{ if(p?.name||p?.code) set.add(String(p.name||p.code)); });
    normalized.forEach(e=>set.add(e.__program));
    return [...set].filter(Boolean).sort((a,b)=>a.localeCompare(b));
  },[programs,normalized]);

  const semesters=useMemo(()=>[...new Set(normalized.map(e=>e.__semester).filter(Boolean))]
    .sort((a,b)=>String(a).localeCompare(String(b),undefined,{numeric:true})),[normalized]);

  const sectionOptions=useMemo(()=>sections
    .filter(s=>{
      const p=String(programName(s));
      const sem=String(semesterName(s));
      return (programFilter==="ALL"||p===programFilter) &&
             (semesterFilter==="ALL"||sem===semesterFilter);
    })
    .sort((a,b)=>String(a.name||"").localeCompare(String(b.name||""))),
    [sections,programFilter,semesterFilter]);

  const filtered=useMemo(()=>{
    const q=query.trim().toLowerCase();
    return normalized.filter(e=>{
      if(programFilter!=="ALL"&&e.__program!==programFilter) return false;
      if(semesterFilter!=="ALL"&&e.__semester!==semesterFilter) return false;
      if(sectionFilter!=="ALL"&&refId(e.section)!==sectionFilter) return false;
      if(!q) return true;
      return [
        e.__program,e.__semester,e.__sectionName,e.day,
        e.subject?.name,e.subject?.code,e.faculty?.name,e.room?.name,
        e.startTime,e.endTime
      ].filter(Boolean).join(" ").toLowerCase().includes(q);
    });
  },[normalized,programFilter,semesterFilter,sectionFilter,query]);

  const visiblePrograms=useMemo(()=>[...new Set(filtered.map(e=>e.__program))]
    .sort((a,b)=>a.localeCompare(b)),[filtered]);

  const visibleGroups=useMemo(()=>{
    const groups=new Map();
    for(const entry of filtered){
      const program=entry.__program;
      const semester=entry.__semester||"Unspecified Semester";
      const key=program+"|"+semester;
      if(!groups.has(key))groups.set(key,{key,program,semester:entry.__semester||""});
    }
    return [...groups.values()].sort((a,b)=>a.program.localeCompare(b.program)||
      String(a.semester).localeCompare(String(b.semester),undefined,{numeric:true}));
  },[filtered]);

  const cellEntries=(program,semester,day,slot)=>{
    const order=Number(slot.order||0);
    return filtered.filter(e=>{
      if(e.__program!==program||e.__semester!==semester||e.day!==day) return false;
      const start=Number(e.order||0);
      const duration=Math.max(1,Number(e.duration||1));
      return order>=start&&order<start+duration;
    });
  };

  const classCount=filtered.length;
  const sectionCount=new Set(filtered.map(e=>refId(e.section)).filter(Boolean)).size;

  async function exportAllPrograms(format){
    const extension = format === "excel" ? "xlsx" : "pdf";
    try {
      const response = await axios.get(`${API}/timetable/export/${format}`, {
        responseType: "blob",
        params: {
          sessionId: activeSession?._id || "",
          view: "all",
          program: programFilter,
          semester: semesterFilter,
          sectionId: sectionFilter !== "ALL" ? sectionFilter : "",
          search: query.trim()
        }
      });
      const url = URL.createObjectURL(new Blob([response.data], {
        type: format === "excel"
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : "application/pdf"
      }));
      const link = document.createElement("a");
      link.href = url;
      const disposition = response.headers?.["content-disposition"] || "";
      const serverFilename = disposition.match(/filename="?([^";]+)"?/i)?.[1];
      link.download = serverFilename || `all-program-timetables.${extension}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      let message = error.response?.data?.message || error.message || "Unable to export timetables.";
      if (error.response?.data instanceof Blob) {
        try {
          const payload = JSON.parse(await error.response.data.text());
          message = payload.message || message;
        } catch {}
      }
      window.alert(message);
    }
  }

  return <div className="all-program-page">
    <section className="all-program-hero">
      <div>
        <h2>All Program Timetables</h2>
        {activeSession?.name&&<small>Academic Session: <strong>{activeSession.name}</strong></small>}
      </div>
      <div className="all-program-stats">
        <div><strong>{visiblePrograms.length}</strong><span>Programs</span></div>
        <div><strong>{sectionCount}</strong><span>Sections</span></div>
        <div><strong>{classCount}</strong><span>Classes</span></div>
      </div>
    </section>

    <section className="panel all-program-filters">
      <div className="filter-row">
        <div className="field"><label>Program</label>
          <select value={programFilter} onChange={e=>{setProgramFilter(e.target.value);setSectionFilter("ALL")}}>
            <option value="ALL">All Programs</option>
            {programNames.map(p=><option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="field"><label>Semester / Year</label>
          <select value={semesterFilter} onChange={e=>{setSemesterFilter(e.target.value);setSectionFilter("ALL")}}>
            <option value="ALL">All Semesters</option>
            {semesters.map(v=><option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div className="field"><label>Section</label>
          <select value={sectionFilter} onChange={e=>setSectionFilter(e.target.value)}>
            <option value="ALL">All Sections</option>
            {sectionOptions.map(s=><option key={s._id} value={s._id}>{s.program||""} · {s.semester||""} · {s.name}</option>)}
          </select>
        </div>
        <div className="field all-program-search"><label>Search</label>
          <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Subject, faculty, room, section..." />
        </div>
      </div>
      <div className="all-program-export-actions" style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:12,flexWrap:"wrap"}}>
        <button className="secondary" onClick={()=>exportAllPrograms("excel")}><FileSpreadsheet size={15}/> Export Excel</button>
        <button className="secondary" onClick={()=>exportAllPrograms("pdf")}><FileSpreadsheet size={15}/> Export PDF</button>
      </div>
    </section>

    {!entries.length ? <section className="panel empty-state">
      <CalendarDays size={32}/><h3>No generated timetable available</h3>
      <p>Generate a timetable first. All programs will automatically appear here.</p>
    </section> :
    !filtered.length ? <section className="panel empty-state">
      <Search size={30}/><h3>No timetable classes match the selected filters</h3>
      <p>Clear the filters or generate a timetable containing the selected program or section.</p>
    </section> :
    <div className="all-program-list">
      {visibleGroups.map(group=>{
        const {program,semester}=group;
        const programEntries=filtered.filter(e=>e.__program===program&&e.__semester===semester);
        const groupSection=programEntries[0]?.__section;
        const periodSlots=resolveEffectiveTimeSlots(data?.timeslots||[],groupSection,programs,activeSession?._id||"");
        const sectionNames=[...new Set(programEntries.map(e=>e.__sectionName).filter(Boolean))].sort();
        return <section className="panel all-program-card" key={group.key}>
          <div className="panel-head all-program-card-head">
            <div><h3><GraduationCap size={18}/> {program}{semester?` · Semester ${semester}`:""}</h3>
              <p>{sectionNames.length} section{sectionNames.length===1?"":"s"} · {programEntries.length} scheduled class{programEntries.length===1?"":"es"}</p>
            </div>
            <div className="program-section-chips">{sectionNames.map(name=><span key={name}>{name}</span>)}</div>
          </div>

          <div className="all-program-grid-wrap">
            <div className="all-program-grid">
              <div className="ap-head">Time</div>
              {days.map(day=><div className="ap-head" key={day}>{day}</div>)}
              {periodSlots.map(slot=>{
                const time=`${slot.startTime}-${slot.endTime}`;
                return <React.Fragment key={`${program}-${time}`}>
                  <div className="ap-time">{time}</div>
                  {days.map(day=>{
                    const list=cellEntries(program,semester,day,slot);
                    return <div className="ap-cell" key={`${program}-${day}-${time}`}>
                      {list.length ? list.map((e,index)=><div className="ap-entry" key={e._id||`${day}-${time}-${index}`}>
                        <strong>{e.subject?.name||"Subject"}</strong>
                        <span>{e.__sectionName||"Section"}{e.__semester?` · ${e.__semester}`:""}</span>
                        <small>{e.faculty?.name||"Faculty"}</small>
                        <small>{e.room?.name||"Room"}</small>
                      </div>) : <span className="ap-free">Free</span>}
                    </div>;
                  })}
                </React.Fragment>;
              })}
            </div>
          </div>
        </section>;
      })}
    </div>}
  </div>;
}
