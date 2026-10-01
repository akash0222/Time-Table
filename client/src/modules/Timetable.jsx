import React, {useEffect, useMemo, useState} from "react";
import axios from "axios";
import {CalendarDays, Users, BookOpen, DoorOpen, Clock3, WandSparkles, Database, Trash2, Settings2, Check, X, FileSpreadsheet, Upload, Lock, Send, RotateCcw, ShieldCheck, BarChart3, Activity, Bell, UserCheck, RefreshCw, Copy, QrCode, History, ClipboardCheck, UserPlus, DollarSign, GraduationCap, Search, ArrowRight, UsersRound} from "lucide-react";
import {API, days, apiName, refId} from "../core/api";
import {Input, Select} from "../components/FormControls";
import {Metric, Progress} from "../components/Metrics";
import {localToday, authRole} from "../core/helpers";

export function CalendarView({timetable,data,role,onMoved,setMessage}){
  const [view,setView]=useState("week");
  const [day,setDay]=useState("Monday");
  const [filter,setFilter]=useState("all");
  const [selected,setSelected]=useState("");
  const [dragged,setDragged]=useState(null);
  const [moving,setMoving]=useState(false);
  const [details,setDetails]=useState(null);

  const slots=(data.timeslots||[]).filter(x=>!x.isBreak).sort((a,b)=>Number(a.order||0)-Number(b.order||0));
  const canEdit=["ADMIN","SCHEDULER"].includes(role) && String(timetable?.status||"DRAFT")==="DRAFT";
  const filterOptions=filter==="section"?data.sections:filter==="faculty"?data.faculty:filter==="room"?data.rooms:[];
  const visibleDays=view==="day"?[day]:days;
  const entries=(timetable?.entries||[]).filter(e=>{
    if(filter==="all") return true;
    const id=refId(e[filter]);
    return id===selected;
  });
  function occupies(e,slot){
    return e.day===slot.day && Number(slot.order||0)>=Number(e.order||0) && Number(slot.order||0)<Number(e.order||0)+Math.max(1,Number(e.duration||1));
  }
  function entryAt(dayName,slot){return entries.find(e=>occupies(e,{...slot,day:dayName}));}
  function hashColor(value){
    const str=String(value||"Subject"); let h=0; for(let i=0;i<str.length;i++) h=(h*31+str.charCodeAt(i))%360;
    return `hsl(${h} 72% 94%)`;
  }
  async function moveEntry(e,targetDay,targetSlot){
    if(!canEdit||!e||moving) return;
    setMoving(true);
    try{
      const r=await axios.patch(`${API}/timetable/move`,{entryId:e._id,day:targetDay,startTime:targetSlot.startTime});
      setMessage?.(r.data?.message||"Class moved successfully.");
      await onMoved?.();
    }catch(err){setMessage?.(err.response?.data?.message||err.message||"Unable to move class.");}
    finally{setMoving(false);setDragged(null)}
  }
  return <div className="panel calendar-panel">
    <div className="toolbar"><div><h3>Interactive Calendar</h3><p>Visual weekly/day timetable. Click a class for details{canEdit?" or drag it to another period.":"."}</p></div><div className="calendar-status"><span className={`status-badge ${String(timetable?.status||"DRAFT").toLowerCase()}`}>{timetable?.status||"DRAFT"}</span></div></div>
    <div className="calendar-toolbar">
      <div className="calendar-segment"><button className={view==="week"?"active":""} onClick={()=>setView("week")}>Week</button><button className={view==="day"?"active":""} onClick={()=>setView("day")}>Day</button></div>
      {view==="day"&&<select value={day} onChange={e=>setDay(e.target.value)}>{days.map(d=><option key={d}>{d}</option>)}</select>}
      <select value={filter} onChange={e=>{setFilter(e.target.value);setSelected("")}}><option value="all">All classes</option><option value="section">Section</option><option value="faculty">Faculty</option><option value="room">Room</option></select>
      {filter!=="all"&&<select value={selected} onChange={e=>setSelected(e.target.value)}><option value="">All {filter}s</option>{filterOptions.map(x=><option key={refId(x)} value={refId(x)}>{x.name}{filter==="section"?` · ${x.program||""} ${x.semester||""}`:""}</option>)}</select>}
    </div>
    {!slots.length?<div className="empty-state"><h3>No time slots</h3><p>Configure Time Slots before using Calendar View.</p></div>:<div className="calendar-scroll"><div className="calendar-grid" style={{gridTemplateColumns:`110px repeat(${visibleDays.length}, minmax(190px,1fr))`}}>
      <div className="calendar-corner">Time</div>{visibleDays.map(d=><div className="calendar-day-head" key={d}>{d}<span>{entries.filter(e=>e.day===d).length} classes</span></div>)}
      {slots.map(slot=><React.Fragment key={slot._id||slot.order}>
        <div className="calendar-time"><strong>{slot.startTime}</strong><span>{slot.endTime}</span></div>
        {visibleDays.map(d=>{
          const e=entryAt(d,slot); const start=e&&Number(e.order||0)===Number(slot.order||0);
          return <div className="calendar-cell" key={`${d}-${slot.order}`} onDragOver={ev=>{if(canEdit){ev.preventDefault();ev.dataTransfer.dropEffect="move"}}} onDrop={ev=>{ev.preventDefault();if(dragged)moveEntry(dragged,d,slot)}}>
            {e&&start?<button className="calendar-entry" style={{background:hashColor(e.subject?.name)}} draggable={canEdit&&!moving} onDragStart={ev=>{setDragged(e);ev.dataTransfer.effectAllowed="move"}} onDragEnd={()=>setDragged(null)} onClick={()=>setDetails(e)}><strong>{e.subject?.name||"Subject"}</strong><span>{e.subject?.code||""}</span><small>{e.faculty?.name||"Faculty"}</small><small>{e.section?.name||"Section"} · {e.room?.name||"Room"}</small>{Number(e.duration||1)>1&&<b>{e.duration} periods</b>}</button>:e?<div className="calendar-continuation">↳ continued</div>:<span className="calendar-empty">Free</span>}
          </div>;
        })}
      </React.Fragment>)}
    </div></div>}
    {moving&&<div className="move-message loading">Checking constraints and moving class...</div>}
    {details&&<div className="calendar-detail-overlay" onClick={()=>setDetails(null)}><div className="calendar-detail" onClick={e=>e.stopPropagation()}><div className="panel-head"><div><h3>{details.subject?.name||"Subject"}</h3><p>{details.day} · {details.startTime}–{details.endTime}</p></div><button className="secondary" onClick={()=>setDetails(null)}>Close</button></div><div className="detail-grid"><div><span>Faculty</span><strong>{details.faculty?.name||"—"}</strong></div><div><span>Section</span><strong>{details.section?.name||"—"}</strong></div><div><span>Room</span><strong>{details.room?.name||"—"}</strong></div><div><span>Duration</span><strong>{details.duration||1} period(s)</strong></div></div></div></div>}
  </div>;
}



export function AllProgramTimetables({timetable,data}){
  const [programFilter,setProgramFilter]=useState("ALL");
  const [dayFilter,setDayFilter]=useState("ALL");
  const entries=timetable?.entries||[];

  const periodSlots=useMemo(()=>{
    const map=new Map();
    for(const slot of (data?.timeslots||[])){
      if(!slot || slot.isBreak) continue;
      const key=`${Number(slot.order||0)}|${slot.startTime||""}|${slot.endTime||""}`;
      if(!map.has(key)) map.set(key,slot);
    }
    return [...map.values()].sort((a,b)=>{
      const orderDiff=Number(a.order||0)-Number(b.order||0);
      if(orderDiff!==0) return orderDiff;
      return String(a.startTime||"").localeCompare(String(b.startTime||""));
    });
  },[data?.timeslots]);

  const programs=useMemo(()=>{
    const map=new Map();
    for(const entry of entries){
      const section=entry.section||{};
      const program=section.program;
      const name=typeof program==="object"
        ? (program?.name||program?.code||"Unassigned Program")
        : String(program||"Unassigned Program");
      const key=typeof program==="object" ? (refId(program)||name) : name;
      if(!map.has(key)) map.set(key,{key,name,entries:[]});
      map.get(key).entries.push(entry);
    }
    return [...map.values()].sort((a,b)=>a.name.localeCompare(b.name));
  },[entries]);

  const visiblePrograms=programFilter==="ALL"
    ? programs
    : programs.filter(p=>p.key===programFilter);
  const visibleDays=dayFilter==="ALL"?days:[dayFilter];

  function entryAt(programEntries,dayName,slot){
    return programEntries.find(e=>{
      if(e.day!==dayName) return false;
      const current=Number(slot.order||0);
      const start=Number(e.order||0);
      const duration=Math.max(1,Number(e.duration||1));
      return current>=start && current<start+duration;
    });
  }

  return <div className="all-program-page">
    <section className="panel all-program-toolbar">
      <div className="panel-head">
        <div>
          <h3>All Program Timetables</h3>
          <p>View all program schedules together. Each program is shown separately with the complete Monday–Sunday timetable.</p>
        </div>
        <div className="all-program-summary">
          <span>{programs.length} Programs</span>
          <span>{entries.length} Classes</span>
        </div>
      </div>
      <div className="all-program-filters">
        <label>Program
          <select value={programFilter} onChange={e=>setProgramFilter(e.target.value)}>
            <option value="ALL">All Programs</option>
            {programs.map(p=><option key={p.key} value={p.key}>{p.name}</option>)}
          </select>
        </label>
        <label>Day
          <select value={dayFilter} onChange={e=>setDayFilter(e.target.value)}>
            <option value="ALL">Monday–Sunday</option>
            {days.map(d=><option key={d}>{d}</option>)}
          </select>
        </label>
        <button className="secondary" onClick={()=>window.print()}>Print All Programs</button>
      </div>
    </section>

    {!visiblePrograms.length ? (
      <section className="panel empty-state">
        <h3>No program timetable available</h3>
        <p>Generate a timetable first and make sure every section is mapped to a program.</p>
      </section>
    ) : visiblePrograms.map(program=>(
      <section className="panel program-timetable-card" key={program.key}>
        <div className="panel-head">
          <div>
            <h3>{program.name}</h3>
            <p>{program.entries.length} scheduled class{program.entries.length===1?"":"es"}</p>
          </div>
        </div>
        <div className="program-grid-scroll">
          <div className="program-grid" style={{gridTemplateColumns:`110px repeat(${visibleDays.length},minmax(170px,1fr))`}}>
            <div className="tt-head">Time</div>
            {visibleDays.map(d=><div className="tt-head" key={d}>{d}</div>)}
            {periodSlots.map(slot=><React.Fragment key={`${program.key}-${slot._id||slot.order}`}>
              <div className="time"><strong>{slot.startTime}</strong><span>{slot.endTime}</span></div>
              {visibleDays.map(dayName=>{
                const e=entryAt(program.entries,dayName,slot);
                const start=e&&Number(e.order||0)===Number(slot.order||0);
                return <div className="cell" key={`${program.key}-${dayName}-${slot.order}`}>
                  {e&&start ? <div className="tt-entry">
                    <strong>{e.subject?.name||"Subject"}</strong>
                    {e.subject?.code&&<span>{e.subject.code}</span>}
                    <small>{e.section?.name||"Section"}</small>
                    <small>{e.faculty?.name||"Faculty"}</small>
                    <small>{e.room?.name||"Room"}</small>
                    {Number(e.duration||1)>1&&<b>{e.duration} periods</b>}
                  </div> : e ? <div className="tt-continuation">↳ continued</div> : <span className="muted">—</span>}
                </div>;
              })}
            </React.Fragment>)}
          </div>
        </div>
      </section>
    ))}
  </div>;
}

export function TimetableView({timetable, data, onMoved, timetableStatus, setTimetableStatus, setMessage, approvalHistory=[]}={}){
  const entries=timetable?.entries||[];
  const [viewMode,setViewMode]=useState("Section");
  const [selected,setSelected]=useState("");
  const [draggedEntry,setDraggedEntry]=useState(null);
  const [moving,setMoving]=useState(false);
  const [moveMessage,setMoveMessage]=useState("");
  const [roomChanging,setRoomChanging]=useState(false);

  const periodSlots=useMemo(()=>{
    const seen=new Set();
    return [...(data?.timeslots||[])]
      .filter(s=>!s.isBreak)
      .sort((a,b)=>Number(a.order||0)-Number(b.order||0))
      .filter(s=>{
        const key=`${s.startTime}-${s.endTime}`;
        if(seen.has(key)) return false;
        seen.add(key); return true;
      });
  },[data?.timeslots]);

  const sections=data?.sections||[];
  const faculty=data?.faculty||[];
  const rooms=data?.rooms||[];

  const idOfLocal=refId;

  useEffect(()=>{
    const list=viewMode==="Section"?sections:viewMode==="Faculty"?faculty:rooms;
    if(!list.length){setSelected("");return;}
    if(!list.some(x=>idOfLocal(x)===selected)) setSelected(idOfLocal(list[0]));
  },[viewMode,sections,faculty,rooms,selected]);

  const selectedItem=useMemo(()=>{
    const list=viewMode==="Section"?sections:viewMode==="Faculty"?faculty:rooms;
    return list.find(x=>idOfLocal(x)===selected)||list[0];
  },[viewMode,sections,faculty,rooms,selected]);

  const rows=useMemo(()=>{
    if(!selectedItem) return [];
    const sid=idOfLocal(selectedItem);
    return entries.filter(e=>{
      if(viewMode==="Section") return idOfLocal(e.section)===sid;
      if(viewMode==="Faculty") return idOfLocal(e.faculty)===sid;
      return idOfLocal(e.room)===sid;
    });
  },[entries,viewMode,selectedItem]);

  const viewLabel=viewMode==="Section"?"Section-wise":viewMode==="Faculty"?"Faculty-wise":"Room-wise";
  const selectedLabel=viewMode==="Section"
    ? `${selectedItem?.program||""} ${selectedItem?.semester||""} - ${selectedItem?.name||""}`
    : selectedItem?.name||"";

  function slotIsOccupied(entry,slot){
    if(!entry) return false;
    if(entry.day!==slot.day) return false;
    const start=Number(entry.order||0);
    const order=Number(slot.order||0);
    return order>=start && order<start+Math.max(1,Number(entry.duration||1));
  }

  function entryForCell(day,slot){
    return rows.find(e=>e.day===day && slotIsOccupied(e,slot));
  }

  function isEntryStart(entry,slot){
    return entry && entry.day===slot.day && Number(entry.order||0)===Number(slot.order||0);
  }

  async function moveEntry(entry,day,slot){
    if(!entry || moving || timetableStatus!=="DRAFT") return;
    if(entry.day===day && Number(entry.order||0)===Number(slot.order||0)) return;

    setMoving(true); setMoveMessage("");
    try{
      const r=await axios.patch(`${API}/timetable/move`,{
        entryId:entry._id,
        day,
        startTime:slot.startTime
      });
      setMoveMessage(r.data?.message||"Class moved successfully.");
      if(onMoved) await onMoved();
    }catch(e){
      setMoveMessage(e.response?.data?.message||e.message||"Unable to move this class.");
    }finally{
      setMoving(false); setDraggedEntry(null);
    }
  }

  async function changeRoom(entry,roomId){
    if(!entry || !roomId || roomChanging || timetableStatus!=="DRAFT") return;
    if(refId(entry.room)===String(roomId)) return;
    setRoomChanging(true); setMoveMessage("");
    try{
      const r=await axios.patch(`${API}/timetable/entry/${entry._id}/room`,{roomId});
      setMoveMessage(r.data?.message||"Room changed successfully.");
      if(onMoved) await onMoved();
    }catch(e){
      setMoveMessage(e.response?.data?.message||e.message||"Unable to change room.");
    }finally{setRoomChanging(false)}
  }

  const [approvalNote,setApprovalNote]=useState("");
  const [approvalBusy,setApprovalBusy]=useState(false);

  function needsApprovalNote(status){
    return (timetableStatus === "SUBMITTED" && ["DRAFT","APPROVED"].includes(status)) ||
      (timetableStatus === "APPROVED" && status === "SUBMITTED") ||
      (timetableStatus === "LOCKED" && status === "PUBLISHED");
  }

  async function changeStatus(status){
    const note=approvalNote.trim();
    if(needsApprovalNote(status) && note.length<3){
      setMoveMessage("Remarks are required for this workflow action (minimum 3 characters).");
      return;
    }
    setApprovalBusy(true);
    try{
      const r=await axios.patch(`${API}/timetable/status`,{status,note});
      setTimetableStatus(r.data?.timetable?.status||status);
      setApprovalNote("");
      setMoveMessage(r.data?.message||`Status changed to ${status}.`);
      if(onMoved) await onMoved();
    }catch(e){setMoveMessage(e.response?.data?.message||e.message)}finally{setApprovalBusy(false)}
  }

  return <div className="panel">
    <div className="toolbar">
      <div><h3>{viewLabel} Timetable</h3><p>View the generated schedule by section, faculty or room. Multi-period classes occupy consecutive periods.</p></div>
      <div className="toolbar-actions">
        <button className="secondary" onClick={()=>window.open(`${API}/timetable/export/excel`,"_blank")}>Excel</button>
        <button className="secondary" onClick={()=>window.open(`${API}/timetable/export/pdf`,"_blank")}>PDF</button>
      </div>
    </div>

    <div className="status-bar">
      <div className={`status-badge ${String(timetableStatus||"DRAFT").toLowerCase()}`}><ShieldCheck size={16}/> {timetableStatus||"DRAFT"}</div>
      <div className="status-actions">
        {timetableStatus==="DRAFT" && <button className="secondary" disabled={approvalBusy} onClick={()=>changeStatus("SUBMITTED")}><Send size={15}/> Submit for Review</button>}
        {timetableStatus==="SUBMITTED" && <><button className="secondary" disabled={approvalBusy} onClick={()=>changeStatus("DRAFT")}><RotateCcw size={15}/> Return to Draft</button><button className="primary" disabled={approvalBusy} onClick={()=>changeStatus("APPROVED")}><Check size={15}/> Approve</button></>}
        {timetableStatus==="APPROVED" && <><button className="secondary" disabled={approvalBusy} onClick={()=>changeStatus("SUBMITTED")}><RotateCcw size={15}/> Request Changes</button><button className="primary" disabled={approvalBusy} onClick={()=>changeStatus("PUBLISHED")}><Send size={15}/> Publish</button></>}
        {timetableStatus==="PUBLISHED" && <button className="primary" disabled={approvalBusy} onClick={()=>changeStatus("LOCKED")}><Lock size={15}/> Lock Timetable</button>}
        {timetableStatus==="LOCKED" && <button className="secondary" disabled={approvalBusy} onClick={()=>changeStatus("PUBLISHED")}><Lock size={15}/> Unlock to Published</button>}
      </div>
      {!["DRAFT"].includes(timetableStatus) && <div className="approval-note-box">
        <label>Workflow remarks (required when returning, approving, requesting changes, or unlocking)
          <textarea value={approvalNote} onChange={e=>setApprovalNote(e.target.value)} placeholder="Add approval, publication, return, or change-request remarks..." rows={2}/>
        </label>
      </div>}
    </div>

    <div className="view-switcher">{["Section","Faculty","Room"].map(mode=><button key={mode} className={viewMode===mode?"view-tab active":"view-tab"} onClick={()=>{setViewMode(mode);setSelected("");setMoveMessage("")}}>{mode==="Section"?"Section-wise":mode==="Faculty"?"Faculty-wise":"Room-wise"}</button>)}</div>

    <div className="view-filter">
      <div className="field"><label>{viewMode==="Section"?"Select Section":viewMode==="Faculty"?"Select Faculty":"Select Room"}</label>
        <select value={idOfLocal(selectedItem)||""} onChange={e=>setSelected(e.target.value)}>
          {(viewMode==="Section"?sections:viewMode==="Faculty"?faculty:rooms).map(x=><option key={idOfLocal(x)} value={idOfLocal(x)}>{viewMode==="Section"?`${x.program||""} ${x.semester||""} - ${x.name||""}`:x.name}</option>)}
        </select>
      </div>
      <div className="selected-summary"><strong>{selectedLabel||"No selection"}</strong><span>{rows.length} scheduled class{rows.length===1?"":"es"}</span></div>
    </div>

    {moveMessage && <div className="move-message">{moveMessage}</div>}
    {timetableStatus!=="DRAFT" && timetableStatus!=="LOCKED" && <div className="move-message locked"><Lock size={15}/> Timetable is {timetableStatus}. Return it to Draft before making changes.</div>}
    {timetableStatus==="LOCKED" && <div className="move-message locked"><Lock size={15}/> Timetable is locked. Unlock it and return it to Draft before making changes.</div>}
    {moving && <div className="move-message loading">Checking all occupied periods and moving class...</div>}

    {!periodSlots.length ? <div className="empty-state"><h3>No time slots configured</h3><p>Add Time Slots first, then generate the timetable.</p></div> : !selectedItem ? <div className="empty-state"><h3>No {viewMode.toLowerCase()} found</h3><p>Add the required master data first.</p></div> : <div className="tt-grid-wrap">
      <div className="tt-grid" style={{gridTemplateColumns:`110px repeat(${days.length},minmax(150px,1fr))`}}>
      <div className="tt-head">Time</div>{days.map(d=><div className="tt-head" key={d}>{d}</div>)}
      {periodSlots.map(slot=>{
        const time=`${slot.startTime}-${slot.endTime}`;
        return <React.Fragment key={slot._id||time}>
          <div className="time">{slot.startTime}-{slot.endTime}</div>
          {days.map(day=>{
            const cellSlot={...slot,day};
            const e=entryForCell(day,cellSlot);
            const start=isEntryStart(e,cellSlot);
            return <div className={`cell ${draggedEntry && timetableStatus==="DRAFT"?"drop-zone":""}`} key={`${day}-${time}`}
              onDragOver={ev=>{if(timetableStatus!=="DRAFT")return;ev.preventDefault();ev.dataTransfer.dropEffect="move"}}
              onDrop={ev=>{ev.preventDefault();if(draggedEntry)moveEntry(draggedEntry,day,slot)}}>
              {e && start ? <div className="tt-entry" draggable={!moving&&timetableStatus==="DRAFT"} onDragStart={ev=>{setDraggedEntry(e);setMoveMessage("");ev.dataTransfer.effectAllowed="move";ev.dataTransfer.setData("text/plain",e._id||"")}} onDragEnd={()=>setDraggedEntry(null)} title={e.duration>1?`Multi-period class: ${e.duration} periods`:"Drag to another period"}>
                <strong>{e.subject?.name||"Subject"}</strong>
                {e.duration>1 && <b>{e.duration} periods</b>}
                {viewMode!=="Faculty"&&<span>{e.faculty?.name||"Faculty"}</span>}
                {viewMode!=="Room"&&<small>{e.room?.name||"Room"}</small>}
                {viewMode!=="Section"&&<small>{e.section?.name||"Section"}</small>}
                {timetableStatus==="DRAFT" && <select className="tt-room-select" value={refId(e.room)} disabled={roomChanging} onChange={ev=>changeRoom(e,ev.target.value)} onClick={ev=>ev.stopPropagation()} onMouseDown={ev=>ev.stopPropagation()}><option value={refId(e.room)}>{e.room?.name||"Current room"}</option>{rooms.filter(r=>refId(r)!==refId(e.room)).map(r=><option key={refId(r)} value={refId(r)}>{r.name}</option>)}</select>}
                <em>↕ Drag</em>
              </div> : e ? <div className="tt-continuation">↳ {e.subject?.name||"Continued"}</div> : <span className="muted">—</span>}
            </div>
          })}
        </React.Fragment>
      })}
      </div>
    </div>}

    {(approvalHistory?.length || timetable?.approvalHistory?.length) ? <section className="approval-history panel">
      <div className="panel-head"><div><h3>Approval History</h3><p>Every workflow transition is recorded with remarks and user details.</p></div></div>
      <div className="table-wrap"><table><thead><tr><th>Date/Time</th><th>From</th><th>To</th><th>User</th><th>Role</th><th>Remarks</th></tr></thead><tbody>{(timetable?.approvalHistory||approvalHistory||[]).slice().reverse().map((h,i)=><tr key={h._id||i}><td>{h.changedAt?new Date(h.changedAt).toLocaleString():"—"}</td><td>{h.from||"—"}</td><td><span className={`status-badge ${String(h.to||"").toLowerCase()}`}>{h.to}</span></td><td>{h.user?.name||h.username||"—"}</td><td>{h.role||"—"}</td><td>{h.note||"—"}</td></tr>)}</tbody></table></div>
    </section> : null}
    {timetable?.warnings?.length>0&&<div className="warning">{timetable.warnings.join(" ")}</div>}
  </div>;
}



