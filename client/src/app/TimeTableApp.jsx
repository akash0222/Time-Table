import React, {useEffect, useState} from "react";
import axios from "axios";
import {API, API_CONFIGURATION_ERROR} from "../core/api";
import {getPageForPath, getPathForPage} from "../core/pageRoutes";
import {refId} from "../core/utils";
import {navGroupsForRole} from "../core/navigation.jsx";
import {CalendarDays, Users, BookOpen, DoorOpen, Clock3, WandSparkles, Check, History, ChevronLeft, ChevronRight} from "lucide-react";
import Login from "../pages/LoginPage.jsx";
import Attendance from "../pages/AttendancePage.jsx";
import Students from "../pages/StudentsPage.jsx";
import StudentMapping from "../pages/StudentMappingPage.jsx";
import StudentProfile from "../pages/StudentProfilePage.jsx";
import StudentPromotion from "../pages/StudentPromotionPage.jsx";
import FeeManagement from "../pages/FeeManagementPage.jsx";
import FullSessionTimetable from "../pages/FullSessionTimetablePage.jsx";
import AllProgramTimetables from "../pages/AllProgramTimetablesPage.jsx";
import AcademicSessions from "../pages/AcademicSessionsPage.jsx";
import AcademicStructure from "../pages/AcademicStructurePage.jsx";
import HolidayManagement from "../pages/HolidayManagementPage.jsx";
import TimetableTemplates from "../pages/TimetableTemplatesPage.jsx";
import PublicSharing from "../pages/PublicSharingPage.jsx";
import Dashboard from "../pages/DashboardPage.jsx";
import PersonalTimetable from "../pages/PersonalTimetablePage.jsx";
import CalendarView from "../pages/CalendarViewPage.jsx";
import FacultyPortal from "../pages/FacultyPortalPage.jsx";
import SectionPortal from "../pages/SectionPortalPage.jsx";
import Notifications from "../pages/NotificationsPage.jsx";
import ChangeHistory from "../pages/ChangeHistoryPage.jsx";
import UserManagement from "../pages/UserManagementPage.jsx";
import Analytics from "../pages/AnalyticsPage.jsx";
import Reports from "../pages/ReportsPage.jsx";
import AuditLogs from "../pages/AuditLogsPage.jsx";
import Optimization from "../pages/OptimizationPage.jsx";
import GenerationReadiness from "../pages/GenerationReadinessPage.jsx";
import Validation from "../pages/ValidationPage.jsx";
import TimetableView from "../pages/TimetableViewPage.jsx";
import TimetableVersions from "../pages/TimetableVersionsPage.jsx";
import SchedulerSettings from "../pages/SchedulerSettingsPage.jsx";
import MasterDataSettings from "../pages/MasterDataSettingsPage.jsx";
import SubjectFacultyMapping from "../pages/SubjectFacultyMappingPage.jsx";
import ExcelImport from "../pages/ExcelImportPage.jsx";
import MasterView from "../pages/MasterViewPage.jsx";
import AvailabilityMatrix from "../pages/AvailabilityMatrixPage.jsx";

export default function App(){
  const [auth,setAuth]=useState(()=>{try{return JSON.parse(localStorage.getItem("tt_user")||"null")}catch{return null}});
  const [tab,setTabState]=useState(()=>getPageForPath(window.location.pathname));
  const setTab=(nextTab)=>setTabState(nextTab);

  // Browser-history navigation keeps each module addressable as its own page.
  useEffect(()=>{
    const syncPageFromUrl=()=>setTabState(getPageForPath(window.location.pathname));
    window.addEventListener("popstate",syncPageFromUrl);
    return ()=>window.removeEventListener("popstate",syncPageFromUrl);
  },[]);

  useEffect(()=>{
    const visiblePages=navGroupsForRole(auth?.role).flatMap(group=>group.items.map(item=>item.name));
    if(auth && tab!=="Dashboard" && !visiblePages.includes(tab)){
      setMessage("This page is not available for your account role.");
      window.history.replaceState({page:"Dashboard"},"",getPathForPage("Dashboard"));
      setTabState("Dashboard");
      return;
    }
    const targetPath=getPathForPage(tab);
    const currentPath=window.location.pathname;
    const pageFromUrl=getPageForPath(currentPath);
    const canonicalPath=getPathForPage(pageFromUrl);

    // Normalize old aliases/unknown URLs without leaving a broken history step.
    if(currentPath!==canonicalPath && pageFromUrl===tab){
      window.history.replaceState({page:tab},"",canonicalPath);
    }else if(currentPath!==targetPath){
      window.history.pushState({page:tab},"",targetPath);
    }
    document.title=tab==="Dashboard" ? "Time Table" : `${tab} | Time Table`;
  },[tab,auth?.role]);
  const [sidebarCollapsed,setSidebarCollapsed]=useState(()=>localStorage.getItem("tt_sidebar_collapsed")==="true");
  const [data,setData]=useState({faculty:[],subjects:[],sections:[],rooms:[],timeslots:[],programs:[],students:[]});
  const [latest,setLatest]=useState(null);
  const [message,setMessage]=useState("");
  const [loading,setLoading]=useState(false);
  const [settings,setSettings]=useState({maxConsecutiveFaculty:2,maxConsecutiveSection:3,avoidSameSubjectSameDay:true,distributeSubjectAcrossDays:true,avoidFirstLastPeriod:false,holidayDays:["Sunday"],generationRuns:8,generationTimeLimitMs:30000});
  const [timetableStatus,setTimetableStatus]=useState("DRAFT");
  const [activeSession,setActiveSession]=useState(null);
  const [sessions,setSessions]=useState([]);
  const [versionList,setVersionList]=useState([]);
  const [approvalHistory,setApprovalHistory]=useState([]);

  async function load(){
    if(!API){
      setMessage(API_CONFIGURATION_ERROR);
      return;
    }

    const loadErrors=[];
    try {
      const me=await axios.get(`${API}/auth/me`);
      const fresh=me.data?.user;
      if(fresh){ setAuth(fresh); localStorage.setItem("tt_user",JSON.stringify(fresh)); }
    } catch(e) {
      // Keep the request-specific details below; the interceptor handles expired
      // sessions by clearing the token and reloading the page.
      if(e.response?.status!==401) loadErrors.push(`Account check: ${e.response?.data?.message||e.message||"request failed"}`);
    }

    const keys=Object.keys(data);
    const results=await Promise.all(keys.map(async k=>{
      try { const r=await axios.get(`${API}/${k}`); return {ok:true,value:r.data}; }
      catch(e) {
        loadErrors.push(`${k}: ${e.response?.data?.message||e.message||"request failed"}`);
        return {ok:false};
      }
    }));
    const next={};
    keys.forEach((k,i)=>{
      const value=results[i]?.value;
      // Don't wipe previously loaded data just because one endpoint failed.
      next[k]=results[i]?.ok
        ? (Array.isArray(value)?value:(Array.isArray(value?.data)?value.data:[]))
        : (Array.isArray(data[k])?data[k]:[]);
    });
    setData(next);

    try {
      const t=await axios.get(`${API}/timetable/latest`,{params:{sessionId:activeSession?._id||""}});
      setLatest(t.data);
    } catch(e) {
      loadErrors.push(`Latest timetable: ${e.response?.data?.message||e.message||"request failed"}`);
    }
    try {
      const sr=await axios.get(API + "/settings", { params: { sessionId: activeSession?._id || "" } });
      setSettings(sr.data);
    } catch(e) {
      loadErrors.push(`Scheduler settings: ${e.response?.data?.message||e.message||"request failed"}`);
    }
    try {
      const st=await axios.get(`${API}/timetable/status`,{params:{sessionId:activeSession?._id||""}});
      setTimetableStatus(st.data?.status||"DRAFT");
      setApprovalHistory(st.data?.approvalHistory||[]);
    } catch(e) {
      loadErrors.push(`Timetable status: ${e.response?.data?.message||e.message||"request failed"}`);
    }
    try {
      const ss=await axios.get(`${API}/sessions`);
      setSessions(ss.data||[]);
      const as=await axios.get(`${API}/sessions/active`);
      setActiveSession(as.data||null);
      if(as.data){
        const vr=await axios.get(`${API}/timetable/versions?sessionId=${as.data._id}`);
        setVersionList(vr.data||[]);
      } else {
        setVersionList([]);
      }
    } catch(e) {
      loadErrors.push(`Academic sessions: ${e.response?.data?.message||e.message||"request failed"}`);
    }

    if(loadErrors.length){
      setMessage(`Some data could not be loaded. Check the backend/API configuration, then retry. ${loadErrors.slice(0,3).join(" | ")}`);
    }
  }
  useEffect(()=>{if(auth) load().catch(e=>setMessage(e.response?.data?.message||"Start the backend server first."));},[auth?.username]);
  useEffect(()=>{
    if(!auth || !activeSession?._id) return;
    (async()=>{
      try{
        const [t,st,vr,sr]=await Promise.all([
          axios.get(`${API}/timetable/latest`,{params:{sessionId:activeSession._id}}),
          axios.get(`${API}/timetable/status`,{params:{sessionId:activeSession._id}}),
          axios.get(`${API}/timetable/versions?sessionId=${activeSession._id}`),
          axios.get(API + "/settings", { params: { sessionId: activeSession._id } })
        ]);
        setLatest(t.data);
        setTimetableStatus(st.data?.status||"DRAFT");
        setApprovalHistory(st.data?.approvalHistory||[]);
        setVersionList(vr.data||[]);
        setSettings(sr.data||{});
      }catch{}
    })();
  },[auth?.username,activeSession?._id]);

  useEffect(()=>{localStorage.setItem("tt_sidebar_collapsed",String(sidebarCollapsed));},[sidebarCollapsed]);

  if(!auth) return <Login onLogin={u=>setAuth(u)} />;

  async function generate(){
    setLoading(true);
    setMessage("");
    try {
      const currentSessionId=refId(activeSession);
      const currentSectionIds=new Set(
        (data.sections||[])
          .filter(sec=>!currentSessionId || refId(sec.academicSession)===currentSessionId)
          .map(sec=>String(sec._id))
      );
      const currentSubjects=(data.subjects||[]).filter(subject=>{
        if(!currentSessionId) return true;
        const subjectSession=refId(subject.academicSession);
        const sectionId=refId(subject.section);
        return (subjectSession===currentSessionId || !subjectSession) && currentSectionIds.has(sectionId);
      });
      const missing=currentSubjects.filter(s=>!refId(s.faculty) || !refId(s.section));
      if(missing.length){
        const names=missing.slice(0,8).map(s=>s.name).join(", ");
        setTab("Master Data Settings");
        setMessage(
          `${missing.length} subject(s) are missing Faculty or Section mapping: ${names}${missing.length>8?" ...":""}. Edit those subjects before generating.`
        );
        return;
      }

      const r=await axios.post(`${API}/timetable/generate`,{academicSessionId:activeSession?._id,generationRuns:Number(settings.generationRuns||8),generationTimeLimitMs:Number(settings.generationTimeLimitMs||30000)});
      setLatest(r.data);
      setTab("Timetable");
      const count=r.data.entries?.length||0;
      const warnings=Array.isArray(r.data.warnings)?r.data.warnings:[];
      setMessage(
        count>0
          ? `Generated ${count} timetable entries using the best candidate from ${r.data.optimization?.runsCompleted||1} generation run(s).${warnings.length?" "+warnings[0]:""}`
          : `Generated 0 timetable entries. ${warnings.join(" ")||"No valid placement was found. Check your Faculty, Section, Room, Availability and Time Slot settings."}`
      );
      await load();
    }catch(e){
      setMessage(e.response?.data?.message||e.message);
    }finally{
      setLoading(false);
    }
  }

  const cards=[
    ["Faculty",data.faculty.length,Users],
    ["Subjects",data.subjects.length,BookOpen],
    ["Sections",data.sections.length,Users],
    ["Rooms",data.rooms.length,DoorOpen],
    ["Time Slots",data.timeslots.filter(x=>!x.isBreak).length,Clock3]
  ];



  return <div className={`app ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
    <aside>
      <div className="brand">
        <CalendarDays size={22}/>
        <span>Time Table</span>
        <button type="button" className="sidebar-toggle" onClick={()=>setSidebarCollapsed(v=>!v)} title={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"} aria-label={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}>
          {sidebarCollapsed ? <ChevronRight size={17}/> : <ChevronLeft size={17}/>}
        </button>
      </div>
      <div className="workspace-label">ACADEMIC WORKSPACE</div>
      <nav className="sidebar-nav">
        {navGroupsForRole(auth.role).map(group=><div className="nav-group" key={group.label}>
          <div className="nav-group-title">{group.label}</div>
          {group.items.map(({name,Icon})=><button data-nav={name} className={tab===name?"nav active":"nav"} onClick={()=>setTab(name)} key={name}><Icon size={17}/><span>{name}</span></button>)}
        </div>)}
      </nav>
      <div className="side-bottom">
        {(["ADMIN","SCHEDULER"].includes(auth.role)) && <button className="primary full" onClick={generate} disabled={loading}><WandSparkles size={17}/> Generate Timetable</button>}
        <div style={{padding:"10px 4px",fontSize:12,color:"#64748b"}}>{auth.name} · {auth.role}</div>
        <button className="secondary full" onClick={()=>{localStorage.removeItem("tt_token");localStorage.removeItem("tt_user");window.location.reload()}}>Logout</button>
      </div>
    </aside>
    <main>
      <header><div><h1>{tab}</h1><p>Production academic timetable management workspace.</p></div>
        <div className="status"><span></span> Production</div>
      </header>
      {message && <div className={`message ${/error|network|failed|unable|cannot|start the backend|could not be loaded|not configured/i.test(message)?"error":"success"}`}>{message}{/some data could not be loaded|backend api is not configured/i.test(message) && <button className="secondary" type="button" onClick={()=>load()} style={{marginLeft:10}}>Retry</button>}</div>}


      {tab==="Attendance" && <Attendance data={data} auth={auth} setMessage={setMessage}/>}
      {tab==="Students" && <Students data={data} reload={load} setMessage={setMessage}/>}
      {tab==="Student Mapping" && <StudentMapping data={data} sessions={sessions} activeSession={activeSession} reload={load} setMessage={setMessage}/>}
      {tab==="Student Profile" && <StudentProfile data={data} setMessage={setMessage}/>}
      {tab==="Student Promotion" && <StudentPromotion data={data} sessions={sessions} activeSession={activeSession} reload={load} setMessage={setMessage}/>}
      {tab==="Fees" && <FeeManagement data={data} sessions={sessions} auth={auth} setMessage={setMessage}/>}
      {tab==="Full Session Timetable" && <FullSessionTimetable sessions={sessions} activeSession={activeSession} role={auth.role}/>}
      {tab==="All Program Timetables" && <AllProgramTimetables timetable={latest} data={data} activeSession={activeSession}/>} 
      {tab==="Academic Sessions" && <AcademicSessions sessions={sessions} programs={data.programs} activeSession={activeSession} setSessions={setSessions} setActiveSession={setActiveSession} setMessage={setMessage}/>}
      {tab==="Academic Structure" && <AcademicStructure sessions={sessions} activeSession={activeSession} programs={data.programs} data={data} reload={load} setMessage={setMessage}/>}
      {tab==="Holiday Management" && <HolidayManagement sessions={sessions} activeSession={activeSession} role={auth.role} setMessage={setMessage}/> }
      {tab==="Templates & Clone" && <TimetableTemplates sessions={sessions} activeSession={activeSession} setLatest={setLatest} setMessage={setMessage}/>}
      {tab==="Public Sharing" && <PublicSharing data={data} setMessage={setMessage}/>}
      {tab==="Dashboard" && <Dashboard cards={cards} generate={generate} loading={loading} latest={latest} role={auth.role}/>}
      {tab==="My Timetable" && <PersonalTimetable auth={auth} data={data}/> }
      {tab==="Calendar View" && <CalendarView timetable={latest} data={data} role={auth.role} onMoved={load} setMessage={setMessage}/>}
      {tab==="Faculty Portal" && <FacultyPortal activeSession={activeSession}/>}
      {tab==="Section Portal" && <SectionPortal/>}
      {tab==="Notifications" && <Notifications auth={auth} data={data} setMessage={setMessage}/>}
      {tab==="Change History" && <ChangeHistory activeSession={activeSession} versionList={versionList}/>}
      {tab==="User Management" && <UserManagement data={data} setMessage={setMessage}/>}
      {tab==="Analytics" && <Analytics activeSession={activeSession}/>}
      {tab==="Reports" && <Reports activeSession={activeSession}/>}
      {tab==="Audit Logs" && <AuditLogs/>}
      {tab==="Optimization" && <Optimization/>}
      {tab==="Generation Readiness" && <GenerationReadiness activeSession={activeSession}/>}
      {tab==="Validation" && <Validation/>}
      {tab==="Timetable" && <TimetableView timetable={latest} data={data} onMoved={load} timetableStatus={timetableStatus} setTimetableStatus={setTimetableStatus} setMessage={setMessage} approvalHistory={approvalHistory} activeSession={activeSession} role={auth.role}/>}
      {tab==="Timetable" && <TimetableVersions activeSession={activeSession} versionList={versionList} setVersionList={setVersionList} setLatest={setLatest} setMessage={setMessage}/>}
      {tab==="Settings" && <SchedulerSettings settings={settings} setSettings={setSettings} setMessage={setMessage} activeSession={activeSession}/>} 
      {tab==="Master Data Settings" && <MasterDataSettings data={data} setData={setData} reload={load} setMessage={setMessage}/>}
      {(tab==="Subject & Faculty Mapping") && <SubjectFacultyMapping data={data} sessions={sessions} activeSession={activeSession} reload={load} setMessage={setMessage}/>}
      {(tab==="Program & Section Mapping" || tab==="Academic Structure") && <AcademicStructure sessions={sessions} activeSession={activeSession} programs={data.programs} data={data} reload={load} setMessage={setMessage}/>}
      {tab==="Import Center" && <ExcelImport reload={load} setMessage={setMessage}/>}
      {["Programs","Faculty","Subjects","Sections","Rooms","Time Slots"].includes(tab) &&
        <MasterView type={tab} data={data} setData={setData} reload={load}/>}
      {tab==="Availability" && <AvailabilityMatrix data={data} reload={load} setMessage={setMessage}/>}
      {tab==="Excel Import" && <ExcelImport reload={load} setMessage={setMessage}/>}
    </main>
  </div>
}
