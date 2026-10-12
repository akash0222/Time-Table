import React, {useEffect, useState} from "react";
import axios from "axios";
import {API} from "../core/api";
import {days} from "../core/utils.js";
import {CalendarDays, Settings2, Check, X} from "lucide-react";

export default function AvailabilityMatrix({data,reload,setMessage}){
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
