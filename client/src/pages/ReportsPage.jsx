import React, {useEffect, useMemo, useState} from "react";
import axios from "axios";
import {API} from "../core/api";
import {Metric, Progress} from "../components/SharedComponents.jsx";
import {
  X, FileSpreadsheet, RotateCcw, Activity, Search, Users, BookOpen,
  CalendarDays, Building2, AlertTriangle, Download, ChevronDown,
  ClipboardList, CheckCircle2
} from "lucide-react";

const WEEK_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const shortDay = day => String(day || "").slice(0, 3);

function EmptyRow({columns, children}) {
  return <tr><td colSpan={columns}><span className="report-empty-cell">{children}</span></td></tr>;
}

function SectionHeading({icon:Icon, title, subtitle, count}) {
  return <div className="report-section-heading">
    <div className="report-section-title">
      {Icon && <span className="report-section-icon"><Icon size={17}/></span>}
      <div><h3>{title}</h3>{subtitle && <p>{subtitle}</p>}</div>
    </div>
    {count !== undefined && <span className="report-count">{count}</span>}
  </div>;
}

export default function Reports({activeSession}={}) {
  const [report,setReport] = useState(null);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");
  const [filter,setFilter] = useState("ALL");
  const [facultyQuery,setFacultyQuery] = useState("");
  const [subjectQuery,setSubjectQuery] = useState("");
  const [subjectStatus,setSubjectStatus] = useState("ALL");
  const [expandedFacultyId,setExpandedFacultyId] = useState("");
  const [workloadSort,setWorkloadSort] = useState("periods");
  const [exporting,setExporting] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const params = activeSession?._id ? {params:{sessionId:activeSession._id}} : {};
      const response = await axios.get(`${API}/reports/summary`, params);
      setReport(response.data);
      setExpandedFacultyId("");
    } catch(e) {
      setError(e.response?.data?.message || e.message || "Unable to load reports.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(()=>{load();},[activeSession?._id]);

  async function download(type) {
    setExporting(type);
    setError("");
    try {
      const params = activeSession?._id ? {params:{sessionId:activeSession._id}} : {};
      const response = await axios.get(`${API}/reports/export/${type}`,{...params,responseType:"blob"});
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement("a");
      anchor.href = url;
      const disposition = response.headers?.["content-disposition"] || "";
      const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1];
      anchor.download = filename || `timetable-report.${type==="excel"?"xlsx":"pdf"}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(()=>URL.revokeObjectURL(url),1000);
    } catch(e) {
      let message = e.response?.data?.message || e.message || "Unable to export this report.";
      if(e.response?.data instanceof Blob) {
        try {
          const payload = JSON.parse(await e.response.data.text());
          message = payload.message || message;
        } catch {}
      }
      setError(message);
    } finally {
      setExporting("");
    }
  }

  const summary = report?.summary || {requiredSessions:0,scheduledSessions:0,coverage:0,unscheduledSessions:0,periods:0};
  const validation = report?.validation || {errors:0,warnings:0,issues:[]};
  const faculty = report?.faculty || [];
  const subjects = report?.subjects || [];
  const rooms = report?.rooms || [];
  const sections = report?.sections || [];
  const daily = report?.daily || [];
  const issues = (report?.validation?.issues || report?.issues || [])
    .filter(item=>filter==="ALL" || String(item.severity).toUpperCase()===filter);

  const sortedFaculty = useMemo(()=>{
    const query=facultyQuery.trim().toLowerCase();
    return faculty.filter(item=>!query||String(item.name||"").toLowerCase().includes(query))
      .slice()
      .sort((a,b)=>workloadSort==="name"
        ? String(a.name||"").localeCompare(String(b.name||""))
        : workloadSort==="classes"
          ? Number(b.classes||0)-Number(a.classes||0) || String(a.name||"").localeCompare(String(b.name||""))
          : Number(b.periods||0)-Number(a.periods||0) || String(a.name||"").localeCompare(String(b.name||"")));
  },[faculty,facultyQuery,workloadSort]);

  const filteredSubjects = useMemo(()=>{
    const query=subjectQuery.trim().toLowerCase();
    return subjects.filter(item=>{
      const text=[item.name,item.code,item.faculty,item.section].map(v=>String(v||"")).join(" ").toLowerCase();
      const queryMatch=!query||text.includes(query);
      const statusMatch=subjectStatus==="ALL"||
        (subjectStatus==="GAP"&&Number(item.unscheduled||0)>0)||
        (subjectStatus==="UNASSIGNED"&&!item.facultyId);
      return queryMatch&&statusMatch;
    }).sort((a,b)=>Number(b.unscheduled||0)-Number(a.unscheduled||0)||String(a.name||"").localeCompare(String(b.name||"")));
  },[subjects,subjectQuery,subjectStatus]);

  const unassignedSubjects = subjects.filter(item=>!item.facultyId);
  const subjectGaps = subjects.filter(item=>Number(item.unscheduled||0)>0);
  const totalFacultyPeriods = faculty.reduce((sum,item)=>sum+Number(item.periods||0),0);
  const maxDayPeriods = Math.max(1,...daily.map(item=>Number(item.periods||0)));
  const hasTimetable = Boolean(report?.timetable);

  if(loading) return <div className="panel"><h3>Reports</h3><p>Preparing academic and workload reports...</p></div>;
  if(error&&!report) return <div className="panel"><h3>Reports</h3><div className="message error">{error}</div><button className="primary" onClick={load}>Retry</button></div>;

  return <div className="reports-page">
    <div className="analytics-toolbar reports-toolbar">
      <div><h2>Academic Reports</h2><p>Workload, coverage, room usage and timetable issues.</p></div>
      <div className="form-actions">
        <button className="secondary" onClick={load} disabled={loading||Boolean(exporting)}><RotateCcw size={15}/> Refresh</button>
        <button className="secondary" onClick={()=>download("excel")} disabled={Boolean(exporting)}><FileSpreadsheet size={15}/>{exporting==="excel"?"Exporting…":"Export Excel"}</button>
        <button className="primary" onClick={()=>download("pdf")} disabled={Boolean(exporting)}><Download size={15}/>{exporting==="pdf"?"Exporting…":"Export PDF"}</button>
      </div>
    </div>

    {error&&<div className="message error reports-error">{error}</div>}

    <div className="cards analytics-cards reports-metrics">
      <Metric label="Required Sessions" value={summary.requiredSessions}/>
      <Metric label="Scheduled Sessions" value={summary.scheduledSessions}/>
      <Metric label="Coverage" value={`${Number(summary.coverage||0).toFixed(1)}%`}/>
      <Metric label="Unscheduled" value={summary.unscheduledSessions}/>
      <Metric label="Validation Errors" value={validation.errors}/>
      <Metric label="Warnings" value={validation.warnings}/>
    </div>

    <section className="panel reports-context-panel">
      <SectionHeading icon={ClipboardList} title="Report Context"/>
      <div className="report-context">
        <div><span>Academic Session</span><strong>{report?.session?.name||activeSession?.name||"Not configured"}</strong></div>
        <div><span>Timetable Version</span><strong>{report?.timetable?.versionLabel||"Current"}</strong></div>
        <div><span>Status</span><strong>{report?.timetable?.status||"No timetable"}</strong></div>
        <div><span>Scheduled Periods</span><strong>{summary.periods||0}</strong></div>
      </div>
      {!hasTimetable&&<div className="report-notice"><AlertTriangle size={16}/> No timetable is saved for this session yet. Workload and utilization reports will populate after a timetable is generated.</div>}
    </section>

    <section className="panel report-panel">
      <SectionHeading icon={Users} title="Faculty Workload" subtitle="Compare teaching load and open a faculty member for subject and daily detail." count={faculty.length}/>
      <div className="report-toolbar-row">
        <label className="report-search"><Search size={15}/><input value={facultyQuery} onChange={e=>setFacultyQuery(e.target.value)} placeholder="Search faculty name" aria-label="Search faculty workload"/></label>
        <label className="report-sort">Sort by
          <select value={workloadSort} onChange={e=>setWorkloadSort(e.target.value)} aria-label="Sort faculty workload">
            <option value="periods">Most periods</option><option value="classes">Most classes</option><option value="name">Faculty name</option>
          </select>
        </label>
      </div>
      <div className="table-wrap report-table-wrap">
        <table className="report-table">
          <thead><tr><th>Faculty</th><th>Classes</th><th>Periods</th><th>Working Days</th><th>Daily Peak</th><th>Load Share</th><th>Details</th></tr></thead>
          <tbody>
            {sortedFaculty.map(item=>{
              const dailyMax=Math.max(0,...(item.dailyBreakdown||[]).map(day=>Number(day.periods||0)));
              const isExpanded=expandedFacultyId===item.id;
              return <React.Fragment key={item.id}>
                <tr className={isExpanded?"report-parent-row expanded":""}>
                  <td><strong>{item.name}</strong></td><td>{item.classes}</td><td><strong>{item.periods}</strong></td><td>{item.workingDays}</td><td>{dailyMax||0} periods</td>
                  <td><div className="report-load-cell"><Progress value={item.utilization}/><small>{Number(item.utilization||0).toFixed(0)}% of busiest load</small></div></td>
                  <td><button type="button" className="report-detail-toggle" aria-expanded={isExpanded} onClick={()=>setExpandedFacultyId(isExpanded?"":item.id)}>{isExpanded?"Hide":"Details"} <ChevronDown size={14}/></button></td>
                </tr>
                {isExpanded&&<tr className="report-detail-row"><td colSpan={7}>
                  <div className="faculty-detail-grid">
                    <div className="faculty-detail-block">
                      <h4>Subject allocation</h4>
                      {(item.subjectBreakdown||[]).length?<div className="table-wrap compact"><table><thead><tr><th>Subject</th><th>Section</th><th>Required / week</th><th>Scheduled</th><th>Gap</th></tr></thead><tbody>
                        {item.subjectBreakdown.map(subject=><tr key={subject.id}><td><strong>{subject.name}</strong>{subject.code&&<small className="report-subcode">{subject.code}</small>}</td><td>{subject.section||"—"}</td><td>{subject.required}</td><td>{subject.scheduled}</td><td className={subject.unscheduled>0?"missing-cell":""}>{subject.unscheduled}</td></tr>)}
                      </tbody></table></div>:<div className="report-empty-note">No subject assignments found for this faculty member.</div>}
                    </div>
                    <div className="faculty-detail-block">
                      <h4>Daily teaching load</h4>
                      <div className="faculty-day-grid">
                        {WEEK_DAYS.map(day=>{
                          const data=(item.dailyBreakdown||[]).find(value=>value.day===day);
                          return <div className="faculty-day-card" key={day}><span>{shortDay(day)}</span><strong>{data?.periods||0}</strong><small>{data?.classes||0} classes</small></div>;
                        })}
                      </div>
                    </div>
                  </div>
                </td></tr>}
              </React.Fragment>;
            })}
            {!sortedFaculty.length&&<EmptyRow columns={7}>No faculty workload matches the search.</EmptyRow>}
          </tbody>
        </table>
      </div>
      <p className="report-footnote">Load share compares period totals with the busiest faculty member; it is not a contractual workload or capacity percentage.</p>
    </section>

    <section className="panel report-panel">
      <SectionHeading icon={BookOpen} title="Subject Session Coverage" subtitle="Find subjects that are under-scheduled or lack a faculty mapping." count={subjects.length}/>
      <div className="report-toolbar-row">
        <label className="report-search"><Search size={15}/><input value={subjectQuery} onChange={e=>setSubjectQuery(e.target.value)} placeholder="Search subject, code, faculty or section" aria-label="Search subject coverage"/></label>
        <label className="report-sort">Show
          <select value={subjectStatus} onChange={e=>setSubjectStatus(e.target.value)} aria-label="Filter subject coverage">
            <option value="ALL">All subjects</option><option value="GAP">Coverage gaps</option><option value="UNASSIGNED">No faculty assigned</option>
          </select>
        </label>
      </div>
      <div className="report-summary-pills">
        <span><AlertTriangle size={14}/>{subjectGaps.length} coverage gaps</span>
        <span><Users size={14}/>{unassignedSubjects.length} without faculty</span>
        <span><CheckCircle2 size={14}/>{Math.max(0,subjects.length-subjectGaps.length)} fully covered by current report</span>
      </div>
      <div className="table-wrap report-table-wrap">
        <table className="report-table">
          <thead><tr><th>Subject</th><th>Section</th><th>Faculty</th><th>Required / week</th><th>Scheduled</th><th>Unscheduled</th><th>Coverage</th></tr></thead>
          <tbody>{filteredSubjects.map(item=>{
            const coverage=item.required>0?Math.min(100,Number(item.scheduled||0)/Number(item.required)*100):(item.scheduled>0?100:0);
            return <tr key={item.id}>
              <td><strong>{item.name}</strong>{item.code&&<small className="report-subcode">{item.code}</small>}</td><td>{item.section||"—"}</td><td>{item.faculty||<span className="report-warning-text">Not assigned</span>}</td>
              <td>{item.required}</td><td>{item.scheduled}</td><td className={item.unscheduled>0?"missing-cell":""}>{item.unscheduled}</td>
              <td><div className="report-load-cell"><Progress value={coverage}/><small>{coverage.toFixed(0)}%</small></div></td>
            </tr>;
          })}{!filteredSubjects.length&&<EmptyRow columns={7}>No subjects match these filters.</EmptyRow>}</tbody>
        </table>
      </div>
    </section>

    <div className="analytics-grid report-grid">
      <section className="panel report-panel">
        <SectionHeading icon={Building2} title="Room Load" subtitle="Room assignments compared with the busiest room." count={rooms.length}/>
        <div className="table-wrap report-table-wrap"><table className="report-table"><thead><tr><th>Room</th><th>Type</th><th>Classes</th><th>Periods</th><th>Relative Load</th></tr></thead><tbody>
          {rooms.map(item=><tr key={item.id}><td><strong>{item.name}</strong></td><td>{item.type}</td><td>{item.classes}</td><td>{item.periods}</td><td><div className="report-load-cell"><Progress value={item.utilization}/><small>{Number(item.utilization||0).toFixed(0)}%</small></div></td></tr>)}
          {!rooms.length&&<EmptyRow columns={5}>No room assignments in this timetable.</EmptyRow>}
        </tbody></table></div>
        <p className="report-footnote">Relative load is a comparison across rooms, not seat capacity or room availability.</p>
      </section>

      <section className="panel report-panel">
        <SectionHeading icon={Users} title="Section Workload" subtitle="Scheduled classes compared with required weekly sessions." count={sections.length}/>
        <div className="table-wrap report-table-wrap"><table className="report-table"><thead><tr><th>Section</th><th>Classes</th><th>Periods</th><th>Required</th><th>Coverage</th></tr></thead><tbody>
          {sections.slice().sort((a,b)=>Number(b.periods||0)-Number(a.periods||0)).map(item=><tr key={item.id}><td><strong>{item.label}</strong></td><td>{item.classes}</td><td>{item.periods}</td><td>{item.required}</td><td><div className="report-load-cell"><Progress value={item.coverage}/><small>{Number(item.coverage||0).toFixed(0)}%</small></div></td></tr>)}
          {!sections.length&&<EmptyRow columns={5}>No section workload data available.</EmptyRow>}
        </tbody></table></div>
      </section>
    </div>

    <section className="panel report-panel">
      <SectionHeading icon={CalendarDays} title="Daily Distribution" subtitle="Total scheduled periods by weekday."/>
      <div className="report-daily-chart">{(daily.length?daily:WEEK_DAYS.map(day=>({day,periods:0,classes:0}))).map(item=><div className="report-daily-row" key={item.day}><strong>{shortDay(item.day)}</strong><div className="report-daily-track"><span style={{width:`${Math.min(100,Number(item.periods||0)/maxDayPeriods*100)}%`}}/></div><b>{item.periods||0}</b><small>{item.classes||0} classes</small></div>)}</div>
    </section>

    <section className="panel report-panel">
      <SectionHeading icon={AlertTriangle} title="Unscheduled Subjects" subtitle="Subjects whose required weekly sessions exceed scheduled sessions." count={subjectGaps.length}/>
      {subjectGaps.length?<div className="table-wrap report-table-wrap"><table className="report-table"><thead><tr><th>Subject</th><th>Code</th><th>Faculty</th><th>Section</th><th>Required</th><th>Scheduled</th><th>Unscheduled</th></tr></thead><tbody>
        {subjectGaps.map(item=><tr key={item.id}><td>{item.name}</td><td>{item.code||"—"}</td><td>{item.faculty||"Not assigned"}</td><td>{item.section||"—"}</td><td>{item.required}</td><td>{item.scheduled}</td><td className="missing-cell">{item.unscheduled}</td></tr>)}
      </tbody></table></div>:<div className="report-empty-state"><CheckCircle2 size={22}/><strong>No subject coverage gaps found</strong><span>The report has no subjects with unscheduled weekly sessions.</span></div>}
    </section>

    <section className="panel report-panel">
      <SectionHeading icon={Activity} title="Conflict & Validation Report" subtitle="Issues detected by the timetable validation/reporting engine." count={issues.length}/>
      <div className="view-tabs">{[["ALL","All"],["ERROR","Errors"],["WARNING","Warnings"]].map(([value,label])=><button type="button" key={value} className={filter===value?"view-tab active":"view-tab"} onClick={()=>setFilter(value)}>{label}</button>)}</div>
      {issues.length?<div className="validation-list">{issues.map((item,index)=><div className={`validation-item ${String(item.severity||"warning").toLowerCase()}`} key={`${item.category}-${index}`}><div className="validation-icon">{String(item.severity).toLowerCase()==="error"?<X size={16}/>:<Activity size={16}/>}</div><div><strong>{item.category}</strong><p>{item.message}</p></div></div>)}</div>:<div className="report-empty-state"><CheckCircle2 size={22}/><strong>No matching issues</strong><span>No issues were found for this filter in the current report.</span></div>}
    </section>
  </div>;
}
