import React, {useEffect, useState} from "react";
import axios from "axios";
import {API} from "../core/api";
import {CalendarOff, Clock3} from "lucide-react";

export default function HolidayManagement({sessions=[],activeSession,role,setMessage}){
  const canEdit=["ADMIN","SCHEDULER"].includes(role);
  const [sessionId,setSessionId]=useState(activeSession?._id||"");
  const [session,setSession]=useState(null);
  const [holidayDate,setHolidayDate]=useState("");
  const [holidays,setHolidays]=useState([]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");

  useEffect(()=>{
    if(activeSession?._id && !sessionId) setSessionId(activeSession._id);
  },[activeSession?._id]);

  async function loadSession(id=sessionId){
    if(!id){setSession(null);setHolidays([]);return;}
    setLoading(true);setError("");
    try{
      const r=await axios.get(`${API}/academic-sessions/${id}`);
      const s=r.data||null;
      setSession(s);
      setHolidays((s?.holidayDates||[]).filter(Boolean).sort());
    }catch(e){
      setError(e.response?.data?.message||e.message);
    }finally{setLoading(false);}
  }

  useEffect(()=>{loadSession(sessionId)},[sessionId]);

  async function saveDates(next){
    if(!sessionId || !canEdit) return;
    const clean=[...new Set(next.filter(Boolean).map(String))].sort();
    setLoading(true);setError("");
    try{
      const r=await axios.patch(`${API}/sessions/${sessionId}/holidays`,{holidayDates:clean});
      setSession(r.data);
      setHolidays((r.data?.holidayDates||[]).sort());
      setMessage(`Holiday calendar updated. ${clean.length} holiday date(s) configured. Sundays remain automatic holidays.`);
    }catch(e){
      setError(e.response?.data?.message||e.message);
    }finally{setLoading(false);}
  }

  function addHoliday(){
    if(!holidayDate)return;
    const d=new Date(`${holidayDate}T00:00:00Z`);
    if(d.getUTCDay()===0){
      setError("Sunday is already a default holiday and cannot be added as a separate date.");
      return;
    }
    if(session?.startDate && holidayDate<String(session.startDate).slice(0,10) || session?.endDate && holidayDate>String(session.endDate).slice(0,10)){
      setError("Holiday date must fall inside the selected academic session.");
      return;
    }
    if(!holidays.includes(holidayDate)) saveDates([...holidays,holidayDate]);
    setHolidayDate("");
  }

  function removeHoliday(date){saveDates(holidays.filter(x=>x!==date));}

  const sundayCount=session?.startDate&&session?.endDate
    ? (()=>{let n=0,d=new Date(`${String(session.startDate).slice(0,10)}T00:00:00Z`),e=new Date(`${String(session.endDate).slice(0,10)}T00:00:00Z`);while(d<=e){if(d.getUTCDay()===0)n++;d.setUTCDate(d.getUTCDate()+1)}return n})()
    : 0;

  return <div className="holiday-management">
    <div className="analytics-toolbar">
      <div><h2>Holiday Management</h2><p>Define academic-session holiday dates. Classes will never be scheduled on configured holidays or on Sunday.</p></div>
      <span className="status-badge approved"><CalendarOff size={14}/> Sunday: Default Holiday</span>
    </div>

    <section className="panel">
      <div className="form-grid">
        <div className="field">
          <label>Academic Session</label>
          <select value={sessionId} onChange={e=>setSessionId(e.target.value)}>
            <option value="">Select session</option>
            {sessions.map(s=><option key={s._id} value={s._id}>{s.name}{s.active?" (Active)":""}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Holiday Date</label>
          <div style={{display:"flex",gap:8}}>
            <input type="date" value={holidayDate} min={session?.startDate?String(session.startDate).slice(0,10):undefined} max={session?.endDate?String(session.endDate).slice(0,10):undefined} onChange={e=>{setHolidayDate(e.target.value);setError("")}} disabled={!sessionId||!canEdit}/>
            <button className="primary" type="button" onClick={addHoliday} disabled={!sessionId||!holidayDate||!canEdit||loading}>Add Holiday</button>
          </div>
          <small className="field-help">Select a date within the academic session. Sunday is automatically excluded.</small>
        </div>
      </div>

      {error&&<div className="message error" style={{marginTop:14}}>{error}</div>}

      <div className="holiday-summary-grid">
        <div><span>Configured Holidays</span><strong>{holidays.length}</strong></div>
        <div><span>Automatic Sunday Holidays</span><strong>{sundayCount}</strong></div>
        <div><span>Selected Session</span><strong>{session?.name||"—"}</strong></div>
      </div>
    </section>

    <section className="panel">
      <div className="panel-head">
        <div><h3>Configured Holiday Dates</h3><p>These dates are stored against the academic session and are automatically applied when the Full Session Timetable is generated.</p></div>
        {loading&&<span className="muted">Saving…</span>}
      </div>
      {!sessionId ? <div className="empty-state">Select an academic session to manage holidays.</div> :
       !holidays.length ? <div className="empty-state">No additional holiday dates configured. Sunday is already a holiday.</div> :
       <div className="holiday-date-list">
         {holidays.map(d=><div className="holiday-date-row" key={d}>
           <div><CalendarOff size={17}/><strong>{d}</strong><span>{new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN",{weekday:"long",day:"2-digit",month:"short",year:"numeric",timeZone:"UTC"})}</span></div>
           {canEdit&&<button className="secondary danger" onClick={()=>removeHoliday(d)} disabled={loading}>Remove</button>}
         </div>)}
       </div>}
    </section>

    <section className="panel holiday-rule-panel">
      <div className="panel-head"><div><h3>Holiday Rules</h3><p>These rules are enforced by the timetable generators.</p></div></div>
      <div className="holiday-rules">
        <div><CalendarOff size={18}/><div><strong>Sunday</strong><span>Always a holiday. Sunday cannot be scheduled even if Sunday Time Slots exist.</span></div></div>
        <div><CalendarOff size={18}/><div><strong>Configured Dates</strong><span>Every date listed above is excluded from Full Session Timetable scheduling.</span></div></div>
        <div><Clock3 size={18}/><div><strong>Weekly Timetable</strong><span>The weekly timetable works by weekday; date-specific holidays are applied when generating the date-wise Full Session Timetable.</span></div></div>
      </div>
    </section>
  </div>;
}
