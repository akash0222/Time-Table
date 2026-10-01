import React, {useEffect, useMemo, useState} from "react";
import axios from "axios";
import {CalendarDays, Users, BookOpen, DoorOpen, Clock3, WandSparkles, Database, Trash2, Settings2, Check, X, FileSpreadsheet, Upload, Lock, Send, RotateCcw, ShieldCheck, BarChart3, Activity, Bell, UserCheck, RefreshCw, Copy, QrCode, History, ClipboardCheck, UserPlus, DollarSign, GraduationCap, Search, ArrowRight, UsersRound} from "lucide-react";
import {API, days, apiName, refId} from "../core/api";
import {Input, Select} from "../components/FormControls";
import {Metric, Progress} from "../components/Metrics";
import {localToday, authRole} from "../core/helpers";

export function Dashboard({cards,generate,seed,loading,latest,role}){
  const quick=[
    {label:"Academic Sessions",icon:CalendarDays,desc:"Manage program-wise calendars",tab:"Academic Sessions"},
    {label:"Full Session Timetable",icon:CalendarDays,desc:"Generate the complete academic plan",tab:"Full Session Timetable"},
    {label:"All Program Timetables",icon:CalendarDays,desc:"View every program timetable in one place",tab:"All Program Timetables"},
    {label:"Students",icon:UserPlus,desc:"Manage student records",tab:"Students"},
    {label:"Attendance",icon:UserCheck,desc:"Mark and review attendance",tab:"Attendance"},
    {label:"Fees",icon:DollarSign,desc:"Invoices and collections",tab:"Fees"},
    {label:"Reports",icon:BarChart3,desc:"View academic reports",tab:"Reports"}
  ];
  const constraints=["Faculty availability","Faculty workload limits","No faculty double-booking","No section double-booking","No room double-booking","Weekly subject requirements","Room type matching","Program-wise session dates"];
  return <div className="dashboard-page">
    <section className="dashboard-welcome">
      <div className="dashboard-welcome-copy">
        <span className="eyebrow">ACADEMIC OPERATIONS</span>
        <h2>Everything you need to run the timetable.</h2>
        <p>Manage sessions, people, attendance, fees and scheduling from one clean workspace.</p>
      </div>
      <div className="dashboard-actions">
        {role==="ADMIN"&&<button className="secondary" onClick={seed} disabled={loading}><Database size={17}/> Load Demo Data</button>}
        {["ADMIN","SCHEDULER"].includes(role)&&<button className="primary" onClick={generate} disabled={loading}><WandSparkles size={17}/> {loading?"Generating...":"Generate Timetable"}</button>}
      </div>
    </section>

    <section className="dashboard-section">
      <div className="section-heading"><div><h3>Workspace overview</h3><p>Current master data available to the timetable engine.</p></div></div>
      <div className="metric-card-grid">{cards.map(([n,v,I])=><div className="metric-card" key={n}><div className="metric-icon"><I size={21}/></div><div><span>{n}</span><strong>{v}</strong></div></div>)}</div>
    </section>

    <section className="dashboard-section">
      <div className="section-heading"><div><h3>Quick access</h3><p>Open frequently used modules directly.</p></div></div>
      <div className="quick-card-grid">{quick.map(({label,icon:Icon,desc,tab:name})=><button className="quick-card" key={label} onClick={()=>document.querySelector(`[data-nav="${name}"]`)?.click()}><span className="quick-card-icon"><Icon size={20}/></span><span className="quick-card-copy"><strong>{label}</strong><small>{desc}</small></span><span className="quick-arrow">→</span></button>)}</div>
    </section>

    <section className="dashboard-section dashboard-two-col">
      <div className="dashboard-card">
        <div className="section-heading compact"><div><h3>Scheduling rules</h3><p>Constraints used during timetable generation.</p></div><span className="mini-badge">ACTIVE</span></div>
        <div className="constraint-card-grid">{constraints.map(x=><div className="constraint-card" key={x}><Check size={15}/><span>{x}</span></div>)}</div>
      </div>
      <div className="dashboard-card">
        <div className="section-heading compact"><div><h3>Latest generation</h3><p>{latest?.entries?.length?`${latest.entries.length} timetable entries generated.`:"No timetable generated yet."}</p></div></div>
        {latest?.entries?.length>0?<div className="generation-card-grid">
          <div><span>Coverage</span><strong>{latest.optimizationMetrics?.coveragePercent??"—"}%</strong></div>
          <div><span>Score</span><strong>{latest.optimizationScore??latest.optimizationMetrics?.optimizationScore??"—"}</strong></div>
          <div><span>Runs</span><strong>{latest.optimizationRuns||latest.optimization?.runsCompleted||1}</strong></div>
        </div>:<div className="dashboard-empty"><CalendarDays size={25}/><span>Generate a timetable to see generation results here.</span></div>}
      </div>
    </section>
  </div>;
}


