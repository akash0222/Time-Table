import React, {useEffect, useMemo, useState} from "react";
import axios from "axios";
import {API} from "../core/api";
import {
  CalendarDays,
  CalendarOff,
  WandSparkles,
  BarChart3,
  UserCheck,
  UserPlus,
  GraduationCap,
  TrendingUp,
  Clock3,
  ArrowUpRight,
  ClipboardCheck,
  Users,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";

const ADMIN_QUICK_ACCESS = [
  { label: "Academic Sessions", icon: CalendarDays, tab: "Academic Sessions" },
  { label: "Holiday Management", icon: CalendarOff, tab: "Holiday Management" },
  { label: "Full Session Timetable", icon: CalendarDays, tab: "Full Session Timetable" },
  { label: "All Program Timetables", icon: GraduationCap, tab: "All Program Timetables" },
  { label: "Students", icon: UserPlus, tab: "Students" },
  { label: "Attendance", icon: UserCheck, tab: "Attendance" },
  { label: "Reports", icon: BarChart3, tab: "Reports" },
  { label: "Generation Readiness", icon: ClipboardCheck, tab: "Generation Readiness" },
];

const FACULTY_QUICK_ACCESS = [
  { label: "My Timetable", icon: CalendarDays, tab: "My Timetable" },
  { label: "Faculty Portal", icon: Users, tab: "Faculty Portal" },
  { label: "Section Portal", icon: GraduationCap, tab: "Section Portal" },
  { label: "Attendance", icon: UserCheck, tab: "Attendance" },
  { label: "Student Profile", icon: UserPlus, tab: "Student Profile" },
  { label: "Analytics", icon: BarChart3, tab: "Analytics" },
];

const VIEWER_QUICK_ACCESS = [
  { label: "Full Session Timetable", icon: CalendarDays, tab: "Full Session Timetable" },
  { label: "All Program Timetables", icon: GraduationCap, tab: "All Program Timetables" },
  { label: "My Timetable", icon: CalendarDays, tab: "My Timetable" },
  { label: "Calendar View", icon: CalendarDays, tab: "Calendar View" },
  { label: "Section Portal", icon: Users, tab: "Section Portal" },
  { label: "Analytics", icon: BarChart3, tab: "Analytics" },
];

export default function Dashboard({ cards, generate, loading, latest, role, onNavigate, activeSession }) {
  const quickAccess = ["ADMIN", "SCHEDULER"].includes(role)
    ? ADMIN_QUICK_ACCESS
    : role === "FACULTY"
      ? FACULTY_QUICK_ACCESS
      : VIEWER_QUICK_ACCESS;

  const dayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const shortDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const entries = latest?.entries || [];
  const dayCounts = shortDays.map((day, index) => ({
    day,
    count: entries.filter(entry => String(entry.day || "").toLowerCase() === dayNames[index].toLowerCase()).length,
  }));
  const maxDayCount = Math.max(1, ...dayCounts.map(item => item.count));
  const totalEntries = entries.length;
  const [selectedDay, setSelectedDay] = useState("All");
  const visibleEntries = selectedDay === "All" ? entries : entries.filter(entry => String(entry.day || "").toLowerCase() === dayNames[shortDays.indexOf(selectedDay)].toLowerCase());
  const visibleCount = visibleEntries.length;
  const facultyWorkload = useMemo(() => {
    const totals = new Map();
    visibleEntries.forEach(entry => {
      const faculty = entry.facultyName || entry.faculty?.name || entry.faculty?.fullName || entry.faculty || entry.teacherName || entry.teacher;
      const name = typeof faculty === "string" ? faculty.trim() : "";
      if (!name || name === "[object Object]") return;
      totals.set(name, (totals.get(name) || 0) + 1);
    });
    return [...totals.entries()].map(([name, count]) => ({name, count})).sort((a,b) => b.count-a.count || a.name.localeCompare(b.name)).slice(0, 6);
  }, [visibleEntries]);
  const maxFacultyLoad = Math.max(1, ...facultyWorkload.map(item => item.count));
  const coverage = latest?.optimizationMetrics?.coveragePercent;
  const quality = latest?.optimizationScore ?? latest?.optimizationMetrics?.optimizationScore;
  const runs = latest?.optimizationRuns ?? latest?.optimization?.runsCompleted;

  const [readiness,setReadiness] = useState(null);
  const [readinessLoading,setReadinessLoading] = useState(false);
  const [readinessError,setReadinessError] = useState("");
  const [readinessRefreshKey,setReadinessRefreshKey] = useState(0);

  useEffect(()=>{
    let cancelled=false;
    async function loadReadiness(){
      if(!["ADMIN","SCHEDULER"].includes(role)){
        setReadiness(null);
        setReadinessError("");
        setReadinessLoading(false);
        return;
      }
      if(!activeSession?._id){
        setReadiness(null);
        setReadinessError("");
        setReadinessLoading(false);
        return;
      }
      setReadinessLoading(true);
      setReadinessError("");
      try{
        const response=await axios.get(`${API}/timetable/readiness`,{params:{sessionId:activeSession._id}});
        const payload=response.data;
        if(!payload||!payload.summary||!Array.isArray(payload.issues)||!["READY","READY_WITH_WARNINGS","NOT_READY"].includes(payload.status)){
          throw new Error("The readiness service returned an incomplete result. Re-check readiness before generating.");
        }
        if(!cancelled)setReadiness(payload);
      }catch(e){
        if(!cancelled){
          setReadiness(null);
          setReadinessError(e.response?.data?.message||"Readiness checks are temporarily unavailable.");
        }
      }finally{
        if(!cancelled)setReadinessLoading(false);
      }
    }
    loadReadiness();
    return ()=>{cancelled=true;};
  },[activeSession?._id,role,readinessRefreshKey]);

  const actionItems = useMemo(()=>{
    if(!readiness)return [];
    const destinationFor = category => {
      const value=String(category||"").toLowerCase();
      if(/section coverage|subject mapping|weekly load|duration/.test(value))return "Subject & Faculty Mapping";
      if(/section/.test(value))return "Program & Section Mapping";
      if(/faculty availability|faculty workload/.test(value))return "Availability";
      if(/faculty|room|time slot|room capacity/.test(value))return "Master Data Settings";
      return "Generation Readiness";
    };
    return (readiness.issues||[]).map((issue,index)=>({
      ...issue,
      key:issue.id||`${issue.category||"Readiness"}-${index}`,
      destination:destinationFor(issue.category),
      severity:String(issue.severity||"WARNING").toUpperCase()
    }));
  },[readiness]);
  const readinessErrors=actionItems.filter(item=>item.severity==="ERROR");
  const readinessWarnings=actionItems.filter(item=>item.severity!=="ERROR");
  const showActionCenter=["ADMIN","SCHEDULER"].includes(role);

  function navigate(tab) {
    if (onNavigate) {
      onNavigate(tab);
      return;
    }
    document.querySelector('[data-nav="' + tab + '"]')?.click();
  }

  return (
    <div className="dashboard-page dashboard-clean">
      <section className="scheduly-dashboard-hero" aria-label="Scheduly dashboard welcome">
        <div className="scheduly-hero-glow" aria-hidden="true" />
        <div className="scheduly-hero-main">
          <div className="scheduly-brand-kicker"><span className="scheduly-brand-mark"><CalendarDays size={17}/></span> SCHEDULY WORKSPACE</div>
          <h2>Plan your campus, <span>one timetable at a time.</span></h2>
          <p>Your academic scheduling overview — track readiness, review class distribution, and get to your most-used tools faster.</p>
          <div className="scheduly-hero-tags">
            <span><ShieldCheck size={14}/> Smart scheduling</span>
            <span><Users size={14}/> Connected academics</span>
            <span><CalendarDays size={14}/> Session-aware planning</span>
          </div>
        </div>
        <div className="scheduly-session-card">
          <span className="scheduly-session-label"><span className="scheduly-live-dot"/> ACTIVE ACADEMIC SESSION</span>
          <strong>{activeSession?.name || "No active session"}</strong>
          <small>{activeSession?._id ? "Dashboard data for your selected session" : "Set an active session to begin planning"}</small>
          {!activeSession?._id && ["ADMIN","SCHEDULER"].includes(role) && <button type="button" onClick={() => navigate("Academic Sessions")}>Set up session <ArrowRight size={14}/></button>}
        </div>
      </section>
      {["ADMIN", "SCHEDULER"].includes(role) && (
        <div className="dashboard-toolbar">
          <button className="primary dashboard-generate" onClick={generate} disabled={loading}>
            <WandSparkles size={17} />
            {loading ? "Generating..." : "Generate Timetable"}
          </button>
        </div>
      )}

      {showActionCenter&&<section className="dashboard-section dashboard-action-center">
        <div className="section-heading">
          <div><h3>Action Center</h3><p>Resolve setup issues before timetable generation.</p></div>
          <button type="button" className="dashboard-action-refresh" onClick={()=>setReadinessRefreshKey(value=>value+1)} aria-label="Refresh action center" title="Refresh action center"><RefreshCw size={15}/></button>
        </div>
        {!activeSession?._id
          ? <div className="dashboard-action-state warning"><AlertTriangle size={18}/><div><strong>No active academic session</strong><span>Choose or create an academic session to run pre-generation checks.</span></div><button type="button" onClick={()=>navigate("Academic Sessions")}>Open sessions <ArrowRight size={14}/></button></div>
          : readinessLoading
            ? <div className="dashboard-action-loading" role="status">Checking academic setup and scheduling resources…</div>
            : readinessError
              ? <div className="dashboard-action-state warning"><AlertTriangle size={18}/><div><strong>Readiness check unavailable</strong><span>{readinessError}</span></div><button type="button" onClick={()=>navigate("Generation Readiness")}>Review <ArrowRight size={14}/></button></div>
              : actionItems.length
                ? <div className="dashboard-action-content">
                    <div className="dashboard-action-summary">
                      <span className={readinessErrors.length?"dashboard-action-count error":"dashboard-action-count success"}>{readinessErrors.length} {readinessErrors.length===1?"error":"errors"}</span>
                      <span className="dashboard-action-count warning">{readinessWarnings.length} {readinessWarnings.length===1?"warning":"warnings"}</span>
                      <span className="dashboard-action-status">{readinessErrors.length?"Generation blocked":readinessWarnings.length?"Review recommended":"Ready to generate"}</span>
                    </div>
                    <div className="dashboard-action-list">
                      {actionItems.slice(0,5).map(item=><div className={`dashboard-action-item ${item.severity.toLowerCase()}`} key={item.key}>
                        <span className="dashboard-action-item-icon">{item.severity==="ERROR"?<AlertTriangle size={16}/>:<ShieldCheck size={16}/>}</span>
                        <div className="dashboard-action-item-copy"><strong>{item.category||"Readiness check"}</strong><p>{item.message}</p></div>
                        <button type="button" onClick={()=>navigate(item.destination)} aria-label={`Review ${item.category||"readiness"}`}>Review <ArrowRight size={14}/></button>
                      </div>)}
                    </div>
                    {actionItems.length>5&&<button className="dashboard-action-more" type="button" onClick={()=>navigate("Generation Readiness")}>View all {actionItems.length} findings <ArrowRight size={14}/></button>}
                  </div>
                : <div className="dashboard-action-state success"><CheckCircle2 size={19}/><div><strong>Ready for timetable generation</strong><span>No blocking setup issues found for {readiness?.session?.name||activeSession.name}.</span></div><button type="button" onClick={()=>navigate("Generation Readiness")}>View checks <ArrowRight size={14}/></button></div>}
      </section>}

      <section className="dashboard-section">
        <div className="section-heading"><div><h3>Overview</h3></div></div>
        <div className="metric-card-grid">
          {cards.map(([name, value, Icon], index) => (
            <div className={"metric-card metric-card-" + index} key={name}>
              <div className="metric-icon"><Icon size={21} /></div>
              <div><span>{name}</span><strong>{value}</strong></div>
              <div className="metric-card-decoration" aria-hidden="true" />
            </div>
          ))}
        </div>
      </section>

      <section className="dashboard-section">
        <div className="section-heading"><div><h3>Quick access</h3></div></div>
        <div className="quick-card-grid">
          {quickAccess.map(({ label, icon: Icon, tab }) => (
            <button className="quick-card" key={label} onClick={() => navigate(tab)} title={label}>
              <span className="quick-card-icon"><Icon size={20} /></span>
              <span className="quick-card-copy"><strong>{label}</strong></span>
              <span className="quick-arrow"><ArrowUpRight size={16} /></span>
            </button>
          ))}
        </div>
      </section>

      <section className="dashboard-section dashboard-visual-grid">
        <div className="dashboard-card dashboard-chart-card">
          <div className="section-heading compact">
            <div><h3>Class distribution</h3><p>Select a day to filter the dashboard workload.</p></div>
            <span className="dashboard-chart-icon"><TrendingUp size={18} /></span>
          </div>
          <div className="dashboard-chart-filters" role="group" aria-label="Filter timetable by day">
            {["All", ...shortDays].map(day => <button type="button" key={day} className={selectedDay === day ? "active" : ""} aria-pressed={selectedDay === day} onClick={() => setSelectedDay(day)}>{day === "All" ? "All days" : day}</button>)}
          </div>
          {totalEntries > 0 ? (
            <div className="dashboard-chart" role="img" aria-label="Bar chart of scheduled classes by day">
              <div className="dashboard-chart-y">
                <span>{maxDayCount}</span>
                <span>{Math.round(maxDayCount / 2)}</span>
                <span>0</span>
              </div>
              <div className="dashboard-chart-bars">
                {dayCounts.map(({ day, count }) => (
                  <button type="button" className={"dashboard-chart-column " + (selectedDay === day ? "selected" : "")} key={day} title={day + ": " + count + " classes"} aria-label={day + ": " + count + " classes"} aria-pressed={selectedDay === day} onClick={() => setSelectedDay(selectedDay === day ? "All" : day)}>
                    <div className="dashboard-chart-bar-track">
                      <div className="dashboard-chart-bar" style={{ height: Math.max(count > 0 ? 8 : 0, count / maxDayCount * 100) + "%" }}>
                        <span>{count || ""}</span>
                      </div>
                    </div>
                    <small>{day}</small>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="dashboard-chart-empty"><strong>No timetable generated</strong></div>
          )}
          <div className="dashboard-chart-footer">
            <span><i /> Classes scheduled</span>
            <strong>{visibleCount} / {totalEntries}</strong>
          </div>
        </div>

        <div className="dashboard-card dashboard-health-card">
          <div className="section-heading compact">
            <div><h3>Timetable at a glance</h3></div>
            <span className="dashboard-chart-icon"><Clock3 size={18} /></span>
          </div>
          <div className="dashboard-health-hero">
            <div
              className="dashboard-health-ring"
              style={{ "--health-progress": Math.max(0, Math.min(100, Number(coverage) || 0)) + "%" }}
            >
              <div>
                <strong>{coverage != null ? Math.round(Number(coverage)) : "—"}<small>{coverage != null ? "%" : ""}</small></strong>
                <span>Coverage</span>
              </div>
            </div>
            <div className="dashboard-health-copy">
              <span className="dashboard-health-status"><i />{totalEntries ? "Generated" : "Not generated"}</span>
              <strong>{totalEntries} classes scheduled</strong>
            </div>
          </div>
          <div className="dashboard-health-stats">
            <div><span><Clock3 size={14} /> Generation runs</span><strong>{runs ?? "—"}</strong></div>
            <div><span><BarChart3 size={14} /> Optimization score</span><strong>{quality ?? "—"}</strong></div>
            <div><span><CalendarDays size={14} /> Selected day</span><strong>{selectedDay === "All" ? "All days" : selectedDay}</strong></div>
          </div>
          <button className="dashboard-health-link" type="button" onClick={() => navigate("Generation Readiness")}>
            Generation readiness <ArrowUpRight size={15} />
          </button>
        </div>
      </section>
      
      <section className="dashboard-section dashboard-card dashboard-workload-card">
        <div className="section-heading">
          <div><h3>Faculty workload</h3><p>{selectedDay === "All" ? "Scheduled classes by faculty across the current timetable." : "Scheduled classes for " + selectedDay + "."}</p></div>
          <span className="dashboard-chart-icon"><Users size={18}/></span>
        </div>
        {facultyWorkload.length ? <div className="dashboard-workload-list">
          {facultyWorkload.map(({name,count}) => <div className="dashboard-workload-row" key={name}>
            <div className="dashboard-workload-person"><span className="dashboard-workload-avatar">{name.split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join("").toUpperCase()}</span><strong title={name}>{name}</strong></div>
            <div className="dashboard-workload-track" role="img" aria-label={name + ": " + count + " scheduled classes"}><span style={{width:(count/maxFacultyLoad*100)+"%"}}/></div>
            <strong className="dashboard-workload-count">{count}<small> classes</small></strong>
          </div>)}
        </div> : <div className="dashboard-workload-empty"><Users size={20}/><strong>No faculty workload data available</strong><span>Workload appears when generated timetable entries include faculty names.</span></div>}
        {facultyWorkload.length > 0 && <p className="dashboard-workload-note">Showing up to 6 faculty members, ranked by scheduled class count. Use the day filters above to compare daily workloads.</p>}
      </section>
    </div>
  );
}
