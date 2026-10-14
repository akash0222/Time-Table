import React, {useEffect, useState} from "react";
import axios from "axios";
import {API} from "../core/api";
import {days, refId} from "../core/utils.js";
import {CalendarOff, FileSpreadsheet, FileDown} from "lucide-react";

export default function FullSessionTimetable({sessions,activeSession,role}){
  const [sessionId,setSessionId]=useState(activeSession?._id||"");
  const [holidays,setHolidays]=useState("");
  const [plans,setPlans]=useState([]);
  const [plan,setPlan]=useState(null);
  const [weekIndex,setWeekIndex]=useState(0);
  const [sectionId,setSectionId]=useState("");
  const [facultyId,setFacultyId]=useState("");
  const [busy,setBusy]=useState(false);
  const [exportBusy,setExportBusy]=useState(false);
  const [error,setError]=useState("");
  useEffect(()=>{if(activeSession?._id&&!sessionId)setSessionId(activeSession._id)},[activeSession?._id]);
  useEffect(()=>{
    const sessionRows=Array.isArray(sessions)?sessions:[];
    if(sessionId&&!sessionRows.some(item=>String(item._id)===String(sessionId))){
      const activeId=activeSession?._id&&sessionRows.some(item=>String(item._id)===String(activeSession._id))
        ?String(activeSession._id):"";
      setSessionId(activeId);setSectionId("");setFacultyId("");
    }
  },[sessions,activeSession?._id]);
  useEffect(()=>{
    let current=true;
    setPlan(null);setWeekIndex(0);setPlans([]);
    if(!sessionId){setError("");return ()=>{current=false};}
    setError("");
    axios.get(`${API}/session-plans?sessionId=${encodeURIComponent(sessionId)}`)
      .then(r=>{if(current)setPlans(r.data||[])})
      .catch(e=>{if(current){setPlans([]);setError(e.response?.data?.message||e.message)}})
    return ()=>{current=false};
  },[sessionId]);
  async function openPlan(id){setBusy(true);setError("");try{const r=await axios.get(`${API}/session-plans/${id}`);setPlan(r.data);setWeekIndex(0)}catch(e){setError(e.response?.data?.message||e.message)}finally{setBusy(false)}}
  async function generateFull(){if(!window.confirm('Generate and save a new full academic session plan? Existing plans will be preserved.'))return;setBusy(true);setError("");try{const dates=holidays.split(/[\s,;]+/).map(x=>x.trim()).filter(Boolean);const r=await axios.post(`${API}/session-plans/generate`,{sessionId,holidays:dates});const p=await axios.get(`${API}/session-plans?sessionId=${sessionId}`);setPlans(p.data||[]);await openPlan(r.data.id)}catch(e){setError(e.response?.data?.message||e.message)}finally{setBusy(false)}}
  async function publish(){if(!plan||!window.confirm('Publish this full-session timetable version?'))return;setBusy(true);try{await axios.patch(`${API}/session-plans/${plan._id}/publish`);const r=await axios.get(`${API}/session-plans?sessionId=${sessionId}`);setPlans(r.data||[]);await openPlan(plan._id)}catch(e){setError(e.response?.data?.message||e.message)}finally{setBusy(false)}}
  async function exportPlan(format,targetPlan=plan,applyFilters=true){
    if(!targetPlan||exportBusy)return;
    setExportBusy(true);
    setError("");
    try{
      const response=await axios.get(`${API}/session-plans/${targetPlan._id}/export/${format}`,{
        responseType:"blob",
        params:applyFilters?{sectionId,facultyId}:{}
      });
      const blobUrl=URL.createObjectURL(new Blob([response.data],{
        type:format==="excel"
          ?"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          :"application/pdf"
      }));
      const anchor=document.createElement("a");
      anchor.href=blobUrl;
      const disposition=response.headers?.["content-disposition"]||"";
      const filename=disposition.match(/filename="?([^";]+)"?/i)?.[1];
      anchor.download=filename||`full-session-timetable-v${targetPlan.version}.${format==="excel"?"xlsx":"pdf"}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(()=>URL.revokeObjectURL(blobUrl),1000);
    }catch(e){
      let message=e.response?.data?.message||e.message||"Unable to export full-session timetable.";
      if(e.response?.data instanceof Blob){
        try{
          const payload=JSON.parse(await e.response.data.text());
          message=payload.message||message;
        }catch{}
      }
      setError(message);
    }finally{
      setExportBusy(false);
    }
  }
  const week=plan?.weeks?.[weekIndex];
  const entries=(week?.entries||[]).filter(e=>(!sectionId||refId(e.section)===sectionId)&&(!facultyId||refId(e.faculty)===facultyId)).sort((a,b)=>a.date.localeCompare(b.date)||a.startTime.localeCompare(b.startTime));
  const sectionOptions=[...new Map((plan?.weeks||[]).flatMap(w=>w.entries||[]).filter(e=>e.section).map(e=>[refId(e.section),e.section])).values()];
  const facultyOptions=[...new Map((plan?.weeks||[]).flatMap(w=>w.entries||[]).filter(e=>e.faculty).map(e=>[refId(e.faculty),e.faculty])).values()];
  const timeColumns=[...new Map(entries.map(e=>[`${e.startTime}|${e.endTime}|${e.order}`,{startTime:e.startTime,endTime:e.endTime,order:Number(e.order||0)}])).values()].sort((a,b)=>a.order-b.order);
  const entryAt=(date,col)=>entries.find(e=>e.date===date&&String(e.startTime)===String(col.startTime)&&String(e.endTime)===String(col.endTime));
  return <div>
    <section className="panel" style={{padding:22,marginBottom:18}}>
      <h2>Full Academic Session Timetable</h2><p>Generate and store the complete date-wise timetable for the academic session. Each week may have a different arrangement, while subject totals are controlled for the entire session.</p>
      <div style={{display:'flex',gap:12,flexWrap:'wrap',alignItems:'end'}}>
        <label>Academic Session<br/><select value={sessionId} onChange={e=>setSessionId(e.target.value)}><option value="">Select session</option>{sessions.map(s=><option key={s._id} value={s._id}>{s.name} ({String(s.startDate||'').slice(0,10)} to {String(s.endDate||'').slice(0,10)})</option>)}</select></label>
        {['ADMIN','SCHEDULER'].includes(role)&&<>
          <button className="secondary" type="button" onClick={()=>document.querySelector('[data-nav="Holiday Management"]')?.click()}><CalendarOff size={15}/> Manage Holidays</button>
          <label>Holiday dates (YYYY-MM-DD, separated by commas)<br/><textarea rows={2} style={{minWidth:300}} value={holidays} onChange={e=>setHolidays(e.target.value)} placeholder="Use Holiday Management for permanent dates"/></label>
          <button className="primary" disabled={!sessionId||busy} onClick={generateFull}>{busy?'Generating...':'Generate Full Session'}</button>
        </>}
      </div>
      {error&&<p style={{color:'#b91c1c',whiteSpace:'pre-wrap'}}>{error}</p>}
      <p style={{fontSize:12,color:'#64748b'}}>The generator does not repeat one fixed weekly timetable. It distributes each subject’s Total Sessions across the academic weeks, respects Max Classes / Week, handles holidays, and saves every dated class in the session plan. No partial plan is saved.</p>
    </section>
    <section className="panel" style={{padding:22,marginBottom:18}}>
      <h3>Saved Full-Session Versions</h3>
      <div style={{display:'grid',gap:10}}>
        {plans.map(p=><div key={p._id} style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',padding:'8px 0',borderBottom:'1px solid #edf0f4'}}>
          <button className={plan?._id===p._id?'primary':'secondary'} onClick={()=>openPlan(p._id)}>Version {p.version} · {p.status} · {p.weeks?.length||0} weeks</button>
          <button className="secondary" type="button" disabled={exportBusy||busy} onClick={()=>exportPlan("excel",p,false)}><FileSpreadsheet size={15}/> Excel</button>
          <button className="secondary" type="button" disabled={exportBusy||busy} onClick={()=>exportPlan("pdf",p,false)}><FileDown size={15}/> PDF</button>
        </div>)}
        {!plans.length&&<p>No session-wide plans generated yet.</p>}
      </div>
    </section>
    {plan&&<section className="panel" style={{padding:22}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,flexWrap:'wrap'}}>
        <h3>Version {plan.version} · {plan.status} · {plan.weeks.length} academic weeks · {plan.totalEntries} classes</h3>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          <button className="secondary" type="button" disabled={exportBusy||busy} onClick={()=>exportPlan("excel")}><FileSpreadsheet size={15}/>{exportBusy?"Exporting...":"Export Excel"}</button>
          <button className="secondary" type="button" disabled={exportBusy||busy} onClick={()=>exportPlan("pdf")}><FileDown size={15}/>{exportBusy?"Exporting...":"Export PDF"}</button>
          {plan.status==='DRAFT'&&['ADMIN','SCHEDULER'].includes(role)&&<button className="primary" disabled={busy||exportBusy} onClick={publish}>Publish Full Session</button>}
        </div>
      </div>
      <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap',margin:'12px 0'}}><button className="secondary" disabled={weekIndex===0} onClick={()=>setWeekIndex(i=>i-1)}>← Previous Week</button><select value={weekIndex} onChange={e=>setWeekIndex(Number(e.target.value))}>{plan.weeks.map((w,i)=><option key={i} value={i}>Week {w.weekNumber}: {w.startDate} – {w.endDate}</option>)}</select><button className="secondary" disabled={weekIndex>=plan.weeks.length-1} onClick={()=>setWeekIndex(i=>i+1)}>Next Week →</button></div>
      <div style={{display:'flex',gap:12,flexWrap:'wrap',marginBottom:14}}><label>Section<br/><select value={sectionId} onChange={e=>setSectionId(e.target.value)}><option value="">All sections</option>{sectionOptions.map(s=><option key={s._id} value={s._id}>{s.name}</option>)}</select></label><label>Faculty<br/><select value={facultyId} onChange={e=>setFacultyId(e.target.value)}><option value="">All faculty</option>{facultyOptions.map(f=><option key={f._id} value={f._id}>{f.name}</option>)}</select></label></div>
      <p>{week?.workingDates?.length||0} working days · {week?.entries?.length||0} classes · {week?.variationPercent||0}% placement variation vs preceding week</p>
      <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',minWidth:760}}><thead><tr><th style={{padding:10,borderBottom:'1px solid #ddd',textAlign:'left'}}>Week / Date</th><th style={{padding:10,borderBottom:'1px solid #ddd',textAlign:'left'}}>Day</th>{timeColumns.map(col=><th key={`${col.startTime}-${col.endTime}`} style={{padding:10,borderBottom:'1px solid #ddd',textAlign:'left',whiteSpace:'nowrap'}}>{col.startTime}–{col.endTime}</th>)}</tr></thead><tbody>{(week?.calendarDates||((week?.workingDates||[]).map(date=>({date,day:new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US',{weekday:'long',timeZone:'UTC'}),status:'WORKING'})))).map(item=>{const date=item.date;const day=item.day;const holiday=item.status==='HOLIDAY';return <tr key={date} style={holiday?{background:'#fff7ed'}:{}}><td style={{padding:10,borderBottom:'1px solid #eee',fontWeight:700,whiteSpace:'nowrap'}}>{date}</td><td style={{padding:10,borderBottom:'1px solid #eee'}}>{day}</td>{timeColumns.map(col=>{const e=holiday?null:entryAt(date,col);return <td key={`${date}-${col.startTime}`} style={{padding:8,borderBottom:'1px solid #eee',verticalAlign:'top',minWidth:150}}>{holiday?<div style={{padding:8,borderRadius:8,background:'#ffedd5',fontWeight:700,color:'#9a3412'}}>Holiday</div>:e?<div style={{padding:8,borderRadius:8,background:'#eff6ff'}}><strong>{e.subject?.code||e.subject?.name||'Subject'}</strong><div style={{fontSize:12,color:'#475569'}}>{e.subject?.name||''}</div><div style={{fontSize:12}}>{e.faculty?.name||'Faculty'}</div><div style={{fontSize:12}}>{e.section?.name||'Section'} · {e.room?.name||'Room'}</div>{Number(e.duration||1)>1&&<small>{e.duration} periods</small>}</div>:<span style={{color:'#94a3b8'}}>—</span>}</td>})}</tr>})}</tbody></table>{!entries.length&&<p>No entries for selected filters or this week.</p>}</div>
    </section>}
  </div>;
}
