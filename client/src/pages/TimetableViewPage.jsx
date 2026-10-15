import React, {useEffect, useMemo, useState} from "react";
import axios from "axios";
import {API} from "../core/api";
import {days, refId} from "../core/utils.js";
import {Check, Lock, Send, RotateCcw, ShieldCheck, History} from "lucide-react";

export default function TimetableView({timetable, data, onMoved, timetableStatus, setTimetableStatus, setMessage, approvalHistory=[], activeSession, role}={}){
  const entries=timetable?.entries||[];
  const [viewMode,setViewMode]=useState("Section");
  const [selected,setSelected]=useState("");
  const [draggedEntry,setDraggedEntry]=useState(null);
  const [moving,setMoving]=useState(false);
  const [moveMessage,setMoveMessage]=useState("");
  const [roomChanging,setRoomChanging]=useState(false);

  const sections=data?.sections||[];
  const faculty=data?.faculty||[];
  const rooms=data?.rooms||[];
  const programs=data?.programs||[];
  const idOfLocal=refId;

  // Each section has its own effective weekly clock schedule. Do not build a
  // global grid that treats the same period number in different programs as
  // the same time (e.g. PGDM 09:00 vs BBA 09:30 / 10:00).
  const sectionSlotsById=useMemo(()=>{
    const map=new Map();
    for(const section of sections){
      map.set(idOfLocal(section),resolveEffectiveTimeSlots(data?.timeslots||[],section,programs,activeSession?._id||""));
    }
    return map;
  },[sections,data?.timeslots,programs,activeSession?._id]);

  const periodSlots=useMemo(()=>{
    let candidates=[];
    if(viewMode==="Section"&&selectedItem){
      candidates=sectionSlotsById.get(idOfLocal(selectedItem))||resolveEffectiveTimeSlots(data?.timeslots||[],selectedItem,programs,activeSession?._id||"");
    }else{
      for(const entry of rows){
        const sectionId=idOfLocal(entry.section);
        const section=sections.find(item=>idOfLocal(item)===sectionId)||(typeof entry.section==="object"?entry.section:null);
        if(!section)continue;
        candidates.push(...(sectionSlotsById.get(sectionId)||resolveEffectiveTimeSlots(data?.timeslots||[],section,programs,activeSession?._id||"")));
      }
    }
    const unique=[...new Map(candidates.filter(slot=>!slot.isBreak).map(slot=>[String(slot.startTime)+"-"+String(slot.endTime),slot])).values()];
    const minutes=value=>{const parts=String(value||"").split(":").map(Number);return parts.length===2&&parts.every(Number.isFinite)?parts[0]*60+parts[1]:Number.MAX_SAFE_INTEGER;};
    return unique.sort((a,b)=>{
      if(viewMode==="Section"){
        const orderDiff=Number(a.order||0)-Number(b.order||0);
        if(orderDiff)return orderDiff;
      }
      return minutes(a.startTime)-minutes(b.startTime)||minutes(a.endTime)-minutes(b.endTime)||Number(a.order||0)-Number(b.order||0);
    });
  },[data?.timeslots,programs,activeSession?._id,sections,rows,viewMode,selectedItem,sectionSlotsById]);

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

  function getSlotForEntry(entry,slot){
    if(!entry||!slot)return null;
    const sectionId=idOfLocal(entry.section);
    const section=sections.find(item=>idOfLocal(item)===sectionId)||(typeof entry.section==="object"?entry.section:null);
    if(!section)return null;
    const sectionSlots=sectionSlotsById.get(sectionId)||resolveEffectiveTimeSlots(data?.timeslots||[],section,programs,activeSession?._id||"");
    return sectionSlots.find(candidate=>String(candidate.day)===String(slot.day)&&String(candidate.startTime)===String(slot.startTime)&&String(candidate.endTime)===String(slot.endTime))||null;
  }

  function slotIsOccupied(entry,slot){
    if(!entry||String(entry.day)!==String(slot.day))return false;
    const scopedSlot=getSlotForEntry(entry,slot);
    if(!scopedSlot)return false;
    const start=Number(entry.order||0);
    const order=Number(scopedSlot.order||0);
    return order>=start&&order<start+Math.max(1,Number(entry.duration||1));
  }

  function entryForCell(day,slot){
    return rows.find(e=>String(e.day)===String(day)&&slotIsOccupied(e,{...slot,day}));
  }

  function isEntryStart(entry,slot){
    if(!entry||String(entry.day)!==String(slot.day))return false;
    const scopedSlot=getSlotForEntry(entry,slot);
    return Boolean(scopedSlot&&Number(entry.order||0)===Number(scopedSlot.order||0));
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
      (timetableStatus === "APPROVED" && ["SUBMITTED","PUBLISHED"].includes(status)) ||
      (timetableStatus === "PUBLISHED" && status === "DRAFT") ||
      (timetableStatus === "LOCKED" && status === "PUBLISHED");
  }

  async function downloadTimetable(format){
    const extension = format === "excel" ? "xlsx" : "pdf";
    const exportView = viewMode.toLowerCase();
    try {
      setMoveMessage("");
      const response = await axios.get(`${API}/timetable/export/${format}`, {
        responseType: "blob",
        params: {
          sessionId: activeSession?._id || "",
          view: exportView,
          selectedId: selected
        }
      });
      const blobUrl = URL.createObjectURL(new Blob([response.data], {
        type: format === "excel"
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : "application/pdf"
      }));
      const anchor = document.createElement("a");
      anchor.href = blobUrl;
      const disposition = response.headers?.["content-disposition"] || "";
      const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1];
      anchor.download = filename || `timetable-${exportView}.${extension}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch (error) {
      let message = error.response?.data?.message || error.message || "Unable to export timetable.";
      if (error.response?.data instanceof Blob) {
        try {
          const payload = JSON.parse(await error.response.data.text());
          message = payload.message || message;
        } catch {}
      }
      setMoveMessage(message);
    }
  }

  async function changeStatus(status){
    const note=approvalNote.trim();
    if(needsApprovalNote(status) && note.length<3){
      setMoveMessage("Remarks are required for this workflow action (minimum 3 characters).");
      return;
    }
    setApprovalBusy(true);
    try{
      const r=await axios.patch(`${API}/timetable/status`,{status,note,sessionId:activeSession?._id||null});
      setTimetableStatus(r.data?.timetable?.status||status);
      setApprovalNote("");
      setMoveMessage(r.data?.message||`Status changed to ${status}.`);
      if(onMoved) await onMoved();
    }catch(e){setMoveMessage(e.response?.data?.message||e.message)}finally{setApprovalBusy(false)}
  }

  return <div className="panel">
    <div className="toolbar">
      <div><h3>{viewLabel} Timetable</h3><p>Multi-period classes occupy consecutive periods.</p></div>
      <div className="toolbar-actions">
        <button className="secondary" onClick={()=>downloadTimetable("excel")}>Excel</button>
        <button className="secondary" onClick={()=>downloadTimetable("pdf")}>PDF</button>
      </div>
    </div>

    <div className="status-bar">
      <div className={`status-badge ${String(timetableStatus||"DRAFT").toLowerCase()}`}><ShieldCheck size={16}/> {timetableStatus||"DRAFT"}</div>
      <div className="status-actions">
        {timetableStatus==="DRAFT" && ["ADMIN","SCHEDULER"].includes(role) && <button className="secondary" disabled={approvalBusy} onClick={()=>changeStatus("SUBMITTED")}><Send size={15}/> Submit for Review</button>}
        {timetableStatus==="SUBMITTED" && ["ADMIN","SCHEDULER"].includes(role) && <><button className="secondary" disabled={approvalBusy} onClick={()=>changeStatus("DRAFT")}><RotateCcw size={15}/> Return to Draft</button>{role==="ADMIN"&&<button className="primary" disabled={approvalBusy} onClick={()=>changeStatus("APPROVED")}><Check size={15}/> Approve</button>}</>}
        {timetableStatus==="APPROVED" && role==="ADMIN" && <><button className="secondary" disabled={approvalBusy} onClick={()=>changeStatus("SUBMITTED")}><RotateCcw size={15}/> Request Changes</button><button className="primary" disabled={approvalBusy} onClick={()=>changeStatus("PUBLISHED")}><Send size={15}/> Publish</button></>}
        {timetableStatus==="PUBLISHED" && role==="ADMIN" && <><button className="secondary" disabled={approvalBusy} onClick={()=>changeStatus("DRAFT")}><RotateCcw size={15}/> Return to Draft</button><button className="primary" disabled={approvalBusy} onClick={()=>changeStatus("LOCKED")}><Lock size={15}/> Lock Timetable</button></>}
        {timetableStatus==="LOCKED" && role==="ADMIN" && <button className="secondary" disabled={approvalBusy} onClick={()=>changeStatus("PUBLISHED")}><Lock size={15}/> Unlock to Published</button>}
      </div>
      {!["DRAFT"].includes(timetableStatus) && <div className="approval-note-box">
        <label>Workflow remarks (required when approving, publishing, returning, requesting changes, or unlocking)
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

    {!periodSlots.length ? <div className="empty-state"><h3>No time slots configured</h3><p>Add Time Slots first, then generate the timetable.</p></div> : !selectedItem ? <div className="empty-state"><h3>No {viewMode.toLowerCase()} found</h3><p>Add the required master data first.</p></div> : <div className="tt-grid-scroll"><div className="tt-grid">
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
    </div></div>}

    {(approvalHistory?.length || timetable?.approvalHistory?.length) ? <section className="approval-history panel">
      <div className="panel-head"><div><h3>Approval History</h3></div></div>
      <div className="table-wrap"><table><thead><tr><th>Date/Time</th><th>From</th><th>To</th><th>User</th><th>Role</th><th>Remarks</th></tr></thead><tbody>{(timetable?.approvalHistory||approvalHistory||[]).slice().reverse().map((h,i)=><tr key={h._id||i}><td>{h.changedAt?new Date(h.changedAt).toLocaleString():"—"}</td><td>{h.from||"—"}</td><td><span className={`status-badge ${String(h.to||"").toLowerCase()}`}>{h.to}</span></td><td>{h.user?.name||h.username||"—"}</td><td>{h.role||"—"}</td><td>{h.note||"—"}</td></tr>)}</tbody></table></div>
    </section> : null}
    {timetable?.warnings?.length>0&&<div className="warning">{timetable.warnings.join(" ")}</div>}
  </div>;
}
