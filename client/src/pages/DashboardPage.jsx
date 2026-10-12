import React from "react";
import {CalendarDays, CalendarOff, WandSparkles, Check, BarChart3, UserCheck, UserPlus, GraduationCap, TrendingUp, Clock3, Sparkles, ArrowUpRight} from "lucide-react";

export default function Dashboard({cards,generate,loading,latest,role}){
  const quick=[
    {label:"Academic Sessions",icon:CalendarDays,desc:"Manage program-wise calendars",tab:"Academic Sessions"},
    {label:"Holiday Management",icon:CalendarOff,desc:"Define holidays and block class scheduling",tab:"Holiday Management"},
    {label:"Full Session Timetable",icon:CalendarDays,desc:"Generate the complete academic plan",tab:"Full Session Timetable"},
    {label:"All Program Timetables",icon:GraduationCap,desc:"View every program timetable in one place",tab:"All Program Timetables"},
    {label:"Students",icon:UserPlus,desc:"Manage student records",tab:"Students"},
    {label:"Attendance",icon:UserCheck,desc:"Mark and review attendance",tab:"Attendance"},
    {label:"Reports",icon:BarChart3,desc:"View academic reports",tab:"Reports"}
  ];
  const constraints=["Faculty availability","Faculty workload limits","No faculty double-booking","No section double-booking","No room double-booking","Weekly subject requirements","Room type matching","Program-wise session dates"];
  const days=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  const dayNames=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
  const dayCounts=days.map((day,index)=>({day,count:(latest?.entries||[]).filter(entry=>String(entry.day||"").toLowerCase()===dayNames[index].toLowerCase()).length}));
  const maxDayCount=Math.max(1,...dayCounts.map(item=>item.count));
  const totalEntries=(latest?.entries||[]).length;
  const coverage=latest?.optimizationMetrics?.coveragePercent;
  const quality=latest?.optimizationScore??latest?.optimizationMetrics?.optimizationScore;
  return <div className="dashboard-page">
    <section className="dashboard-welcome">
      <div className="dashboard-welcome-copy">
        <span className="eyebrow">ACADEMIC OPERATIONS</span>
        <h2>Everything you need to run the timetable.</h2>
        <p>Manage academic sessions, people, master data and timetable operations from one production workspace.</p>
        <div className="dashboard-welcome-tags"><span><Check size={13}/> Connected workspace</span><span><ShieldCheckIcon/> Role-aware access</span></div>
      </div>
      <div className="dashboard-actions">
        {["ADMIN","SCHEDULER"].includes(role)&&<button className="primary dashboard-generate" onClick={generate} disabled={loading}><WandSparkles size={17}/> {loading?"Generating...":"Generate Timetable"}</button>}
      </div>
      <div className="dashboard-hero-art" aria-hidden="true"><div className="dashboard-hero-ring"/><div className="dashboard-hero-calendar"><CalendarDays size={30}/><span/><span/><span/><span/><span/><span/></div><div className="dashboard-hero-spark"><Sparkles size={18}/></div></div>
    </section>

    <section className="dashboard-section">
      <div className="section-heading"><div><h3>Workspace overview</h3><p>Current master data available to the timetable engine.</p></div><span className="dashboard-updated"><i/> Live workspace data</span></div>
      <div className="metric-card-grid">{cards.map(([n,v,I],index)=><div className={"metric-card metric-card-"+index} key={n}><div className="metric-icon"><I size={21}/></div><div><span>{n}</span><strong>{v}</strong><small>{index===0?"Teaching team":index===1?"Curriculum items":index===2?"Active groups":index===3?"Learning spaces":"Weekly periods"}</small></div><div className="metric-card-decoration" aria-hidden="true"/></div>)}</div>
    </section>

    <section className="dashboard-section">
      <div className="section-heading"><div><h3>Quick access</h3><p>Jump straight into your everyday academic tasks.</p></div></div>
      <div className="quick-card-grid">{quick.map(({label,icon:Icon,desc,tab:name})=><button className="quick-card" key={label} onClick={()=>document.querySelector('[data-nav="'+name+'"]')?.click()}><span className="quick-card-icon"><Icon size={20}/></span><span className="quick-card-copy"><strong>{label}</strong><small>{desc}</small></span><span className="quick-arrow"><ArrowUpRight size={17}/></span></button>)}</div>
    </section>

    <section className="dashboard-section dashboard-visual-grid">
      <div className="dashboard-card dashboard-chart-card">
        <div className="section-heading compact"><div><span className="dashboard-card-kicker">WEEKLY SNAPSHOT</span><h3>Class distribution</h3><p>Scheduled classes across the week.</p></div><span className="dashboard-chart-icon"><TrendingUp size={18}/></span></div>
        {totalEntries>0 ? <div className="dashboard-chart" role="img" aria-label="Bar chart of scheduled classes by day">
          <div className="dashboard-chart-y"><span>{maxDayCount}</span><span>{Math.round(maxDayCount/2)}</span><span>0</span></div>
          <div className="dashboard-chart-bars">{dayCounts.map(({day,count})=><div className="dashboard-chart-column" key={day} title={day+": "+count+" classes"}>
            <div className="dashboard-chart-bar-track"><div className="dashboard-chart-bar" style={{height:Math.max(count>0?8:0,count/maxDayCount*100)+"%"}}><span>{count||""}</span></div></div><small>{day}</small>
          </div>)}</div>
        </div> : <div className="dashboard-chart-empty"><div className="dashboard-chart-empty-art"><CalendarDays size={30}/><span><i/><i/><i/></span></div><strong>Your weekly view will appear here</strong><small>Generate a timetable to visualize class distribution.</small></div>}
        <div className="dashboard-chart-footer"><span><i/> Scheduled classes</span><strong>{totalEntries} total entries</strong></div>
      </div>
      <div className="dashboard-card dashboard-health-card">
        <div className="section-heading compact"><div><span className="dashboard-card-kicker">WORKSPACE HEALTH</span><h3>Timetable at a glance</h3><p>Quick signals from the latest generation.</p></div><span className="dashboard-chart-icon"><Sparkles size={18}/></span></div>
        <div className="dashboard-health-hero">
          <div className="dashboard-health-ring" style={{"--health-progress":Math.max(0,Math.min(100,Number(coverage)||0))+"%"}}><div><strong>{coverage!=null?Math.round(Number(coverage)):"—"}<small>{coverage!=null?"%":" "}</small></strong><span>coverage</span></div></div>
          <div className="dashboard-health-copy"><span className="dashboard-health-status"><i/>{totalEntries?"Timetable generated":"Awaiting generation"}</span><strong>{totalEntries?totalEntries+" classes scheduled":"Ready to plan"}</strong><small>{totalEntries?"Review coverage and conflicts before publishing.":"Create a timetable to unlock scheduling insights."}</small></div>
        </div>
        <div className="dashboard-health-stats"><div><span><Clock3 size={14}/> Generation runs</span><strong>{latest?.optimizationRuns||latest?.optimization?.runsCompleted||"—"}</strong></div><div><span><BarChart3 size={14}/> Optimization score</span><strong>{quality??"—"}</strong></div></div>
        <button className="dashboard-health-link" type="button" onClick={()=>document.querySelector('[data-nav="Generation Readiness"]')?.click()}>Check generation readiness <ArrowUpRight size={15}/></button>
      </div>
    </section>
    <section className="dashboard-section dashboard-card dashboard-rules-card">
      <div className="section-heading compact"><div><span className="dashboard-card-kicker">VALIDATION ENGINE</span><h3>Scheduling rules</h3><p>Constraints applied during timetable generation.</p></div><span className="mini-badge">ACTIVE</span></div>
      <div className="constraint-card-grid">{constraints.map(x=><div className="constraint-card" key={x}><Check size={15}/><span>{x}</span></div>)}</div>
    </section>
  </div>;
}

function ShieldCheckIcon(){return <Check size={13}/>;}
