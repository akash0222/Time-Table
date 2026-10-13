import React, {lazy, Suspense, useEffect, useRef, useState} from "react";
import axios from "axios";
import {API, API_CONFIGURATION_ERROR} from "../core/api";
import {getPageForPath, getPathForPage} from "../core/pageRoutes";
import {refId} from "../core/utils";
import {navGroupsForRole} from "../core/navigation.jsx";
import {CalendarDays, Users, BookOpen, DoorOpen, Clock3, WandSparkles, Check, History, ChevronLeft, ChevronRight, ChevronDown, Menu, X, Search} from "lucide-react";
import Login from "../pages/LoginPage.jsx";

// The eight navigation group headings are the only main modules.
// Every page within a group is a direct submodule/link (no nested page parents).
function buildNavigationTree(group) {
  return group.items.map(item => ({ ...item, routeAllowed: true, children: [] }));
}

const Attendance = lazy(() => import("../pages/AttendancePage.jsx"));
const Students = lazy(() => import("../pages/StudentsPage.jsx"));
const StudentMapping = lazy(() => import("../pages/StudentMappingPage.jsx"));
const StudentProfile = lazy(() => import("../pages/StudentProfilePage.jsx"));
const StudentPromotion = lazy(() => import("../pages/StudentPromotionPage.jsx"));
const FeeManagement = lazy(() => import("../pages/FeeManagementPage.jsx"));
const FullSessionTimetable = lazy(() => import("../pages/FullSessionTimetablePage.jsx"));
const AllProgramTimetables = lazy(() => import("../pages/AllProgramTimetablesPage.jsx"));
const AcademicSessions = lazy(() => import("../pages/AcademicSessionsPage.jsx"));
const AcademicStructure = lazy(() => import("../pages/AcademicStructurePage.jsx"));
const HolidayManagement = lazy(() => import("../pages/HolidayManagementPage.jsx"));
const TimetableTemplates = lazy(() => import("../pages/TimetableTemplatesPage.jsx"));
const PublicSharing = lazy(() => import("../pages/PublicSharingPage.jsx"));
const Dashboard = lazy(() => import("../pages/DashboardPage.jsx"));
const PersonalTimetable = lazy(() => import("../pages/PersonalTimetablePage.jsx"));
const CalendarView = lazy(() => import("../pages/CalendarViewPage.jsx"));
const FacultyPortal = lazy(() => import("../pages/FacultyPortalPage.jsx"));
const SectionPortal = lazy(() => import("../pages/SectionPortalPage.jsx"));
const Notifications = lazy(() => import("../pages/NotificationsPage.jsx"));
const ChangeHistory = lazy(() => import("../pages/ChangeHistoryPage.jsx"));
const UserManagement = lazy(() => import("../pages/UserManagementPage.jsx"));
const Analytics = lazy(() => import("../pages/AnalyticsPage.jsx"));
const Reports = lazy(() => import("../pages/ReportsPage.jsx"));
const AuditLogs = lazy(() => import("../pages/AuditLogsPage.jsx"));
const Optimization = lazy(() => import("../pages/OptimizationPage.jsx"));
const GenerationReadiness = lazy(() => import("../pages/GenerationReadinessPage.jsx"));
const Validation = lazy(() => import("../pages/ValidationPage.jsx"));
const TimetableView = lazy(() => import("../pages/TimetableViewPage.jsx"));
const TimetableVersions = lazy(() => import("../pages/TimetableVersionsPage.jsx"));
const SchedulerSettings = lazy(() => import("../pages/SchedulerSettingsPage.jsx"));
const MasterDataSettings = lazy(() => import("../pages/MasterDataSettingsPage.jsx"));
const SubjectFacultyMapping = lazy(() => import("../pages/SubjectFacultyMappingPage.jsx"));
const ExcelImport = lazy(() => import("../pages/ExcelImportPage.jsx"));
const MasterView = lazy(() => import("../pages/MasterViewPage.jsx"));
const AvailabilityMatrix = lazy(() => import("../pages/AvailabilityMatrixPage.jsx"));

function PageLoading({label="page"}) {
  return <div className="page-loading" role="status" aria-live="polite">
    <span className="page-loading-spinner" aria-hidden="true"/>
    <span>Loading {String(label).toLowerCase()}…</span>
  </div>;
}

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
  const [mobileNavOpen,setMobileNavOpen]=useState(false);
  const [navQuery,setNavQuery]=useState("");
  const navSearchRef=useRef(null);
  const [focusNavSearchOnExpand,setFocusNavSearchOnExpand]=useState(false);
  const [collapsedNavGroups,setCollapsedNavGroups]=useState(()=>{
    try{return JSON.parse(localStorage.getItem("tt_nav_collapsed_groups")||"{}")}catch{return {}}
  });


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
  useEffect(()=>{
    const mobileViewport=window.matchMedia("(max-width: 1000px)").matches;
    if(!sidebarCollapsed&&focusNavSearchOnExpand&&(!mobileViewport||mobileNavOpen)){
      navSearchRef.current?.focus();
      setFocusNavSearchOnExpand(false);
    }
  },[sidebarCollapsed,focusNavSearchOnExpand,mobileNavOpen]);
  useEffect(()=>{
    const onKeyboardShortcut=event=>{
      if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="k"){
        event.preventDefault();
        if(window.matchMedia("(max-width: 1000px)").matches){
          setFocusNavSearchOnExpand(true);
          setSidebarCollapsed(false);
          setMobileNavOpen(true);
        }else if(sidebarCollapsed){
          setFocusNavSearchOnExpand(true);
          setSidebarCollapsed(false);
        }else{
          navSearchRef.current?.focus();
        }
      }else if(event.key==="Escape"&&document.activeElement===navSearchRef.current){
        if(navQuery.trim())setNavQuery("");
        navSearchRef.current?.blur();
      }
    };
    window.addEventListener("keydown",onKeyboardShortcut);
    return ()=>window.removeEventListener("keydown",onKeyboardShortcut);
  },[sidebarCollapsed,navQuery]);
  useEffect(()=>{
    if(!mobileNavOpen)return;
    const closeOnEscape=event=>{if(event.key==="Escape")setMobileNavOpen(false);};
    window.addEventListener("keydown",closeOnEscape);
    return ()=>window.removeEventListener("keydown",closeOnEscape);
  },[mobileNavOpen]);
  useEffect(()=>{localStorage.setItem("tt_nav_collapsed_groups",JSON.stringify(collapsedNavGroups));},[collapsedNavGroups]);

  // Deep links always reveal the one top-level group containing the current page.
  useEffect(()=>{
    if(!auth) return;
    const group=navGroupsForRole(auth.role).find(candidate=>candidate.items.some(item=>item.name===tab));
    if(group)setCollapsedNavGroups(previous=>previous[group.label]?{...previous,[group.label]:false}:previous);
  },[tab,auth?.role]);

  function navigateToNavPage(page,groupLabel){
    setTab(page);
    setNavQuery("");
    setMobileNavOpen(false);
    setCollapsedNavGroups(previous=>previous[groupLabel]?{...previous,[groupLabel]:false}:previous);
  }

  function navigateFromDashboard(page){
    for(const group of navGroupsForRole(auth.role)){
      if(group.items.some(item=>item.name===page)){
        navigateToNavPage(page,group.label);
        return;
      }
    }
    setTab(page);
    setNavQuery("");
    setMobileNavOpen(false);
  }

  const normalizedNavQuery=navQuery.trim().toLowerCase();
  const visibleNavGroups=auth?navGroupsForRole(auth.role).map(group=>({
    ...group,
    items:group.items.filter(item=>!normalizedNavQuery||item.name.toLowerCase().includes(normalizedNavQuery))
  })).filter(group=>group.items.length):[];

  if(!auth) return <Suspense fallback={<PageLoading label="sign in" />}><Login onLogin={u=>setAuth(u)} /></Suspense>;

  async function generate(){
    setLoading(true);
    setMessage("");
    try {
      if(!activeSession?._id){
        setTab("Academic Sessions");
        setMessage("Generation was not started. Set an active academic session first.");
        return;
      }

      // Always run the authoritative readiness endpoint before attempting generation.
      // Warnings are surfaced in the Readiness page, but blocking errors stop generation.
      let preflight;
      try{
        preflight=(await axios.get(`${API}/timetable/readiness`,{params:{sessionId:activeSession._id}})).data;
      }catch(checkError){
        setTab("Generation Readiness");
        setMessage(`Generation was not started because pre-generation checks could not be completed. ${checkError.response?.data?.message||checkError.message||"Retry the readiness check."}`);
        return;
      }
      const knownReadinessStatuses=["READY","READY_WITH_WARNINGS","NOT_READY"];
      if(!preflight||!preflight.summary||!Array.isArray(preflight.issues)||!knownReadinessStatuses.includes(preflight.status)){
        setTab("Generation Readiness");
        setMessage("Generation was blocked because the readiness service returned an incomplete result. Re-check the setup before trying again.");
        return;
      }
      const preflightErrors=Number(preflight.summary.errors||0);
      if(preflight.status==="NOT_READY"||preflightErrors>0){
        setTab("Generation Readiness");
        setMessage(`Generation blocked: ${preflightErrors||1} setup error(s) must be resolved first. Review the findings in Generation Readiness.`);
        return;
      }

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



  return <div className={`app ${sidebarCollapsed ? "sidebar-collapsed" : ""} ${mobileNavOpen ? "mobile-nav-open" : ""}`}>
    <aside className="erp-sidebar">
      <div className="brand">
        <CalendarDays size={22}/>
        <span>Time Table</span>
        <button type="button" className="sidebar-toggle" onClick={()=>{if(window.matchMedia("(max-width: 1000px)").matches){setMobileNavOpen(false);return;}setSidebarCollapsed(v=>!v);}} title={mobileNavOpen?"Close navigation":sidebarCollapsed ? "Expand navigation" : "Collapse navigation"} aria-label={mobileNavOpen?"Close navigation":sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}>
          {sidebarCollapsed ? <ChevronRight size={17}/> : <ChevronLeft size={17}/>}
        </button>
      </div>
      <div className="workspace-label">ACADEMIC WORKSPACE</div>
      <div className="nav-search" role="search">
        <Search size={16} aria-hidden="true"/>
        <input
          ref={navSearchRef}
          className="nav-search-input"
          type="search"
          value={navQuery}
          onChange={event=>setNavQuery(event.target.value)}
          placeholder="Search pages…"
          aria-label="Search pages"
          aria-describedby="nav-search-shortcut"
        />
        <kbd id="nav-search-shortcut" className="nav-search-shortcut">Ctrl K</kbd>
        <button type="button" className="nav-search-collapsed-trigger" aria-label="Search pages" title="Search pages (Ctrl+K)" onClick={()=>{setFocusNavSearchOnExpand(true);setSidebarCollapsed(false);}}><Search size={17}/></button>
      </div>
      <nav className="sidebar-nav" aria-label="Main navigation">
        {visibleNavGroups.map(group=>{
          const groupId="nav-group-"+group.label.toLowerCase().replace(/[^a-z0-9]+/g,"-");
          const groupCollapsed=!normalizedNavQuery&&Boolean(collapsedNavGroups[group.label]);
          return <div className={"nav-group"+(groupCollapsed?" is-collapsed":"")} key={group.label} data-nav-group={group.label}>
            <button
              type="button"
              className="nav-group-title"
              aria-expanded={!groupCollapsed}
              aria-controls={groupId}
              aria-label={(groupCollapsed?"Expand ":"Collapse ")+group.label}
              onClick={()=>setCollapsedNavGroups(previous=>({...previous,[group.label]:!previous[group.label]}))}
            >
              <span className="nav-group-label">{group.label}</span>
              <ChevronDown className={"nav-group-chevron"+(groupCollapsed?" is-collapsed":"")} size={13}/>
            </button>
            {!groupCollapsed&&<div className="nav-group-items" id={groupId}>
              {group.items.map(item=><button
                key={item.name}
                data-nav={item.name}
                data-nav-group={group.label}
                className={tab===item.name?"nav active":"nav"}
                title={sidebarCollapsed?item.name:undefined}
                onClick={()=>navigateToNavPage(item.name,group.label)}
                aria-current={tab===item.name?"page":undefined}
              ><item.Icon size={17}/><span className="nav-label">{item.name}</span></button>)}
            </div>}
          </div>;
        })}
        {normalizedNavQuery&&!visibleNavGroups.length&&<div className="nav-search-empty" role="status">No pages match “{navQuery.trim()}”.</div>}
      </nav>
      <div className="side-bottom">
        {(["ADMIN","SCHEDULER"].includes(auth.role)) && <button className="primary full" onClick={generate} disabled={loading}><WandSparkles size={17}/> Generate Timetable</button>}
        <div style={{padding:"10px 4px",fontSize:12,color:"#64748b"}}>{auth.name} · {auth.role}</div>
        <button className="secondary full" onClick={()=>{localStorage.removeItem("tt_token");localStorage.removeItem("tt_user");window.location.reload()}}>Logout</button>
      </div>
    </aside>
    {mobileNavOpen&&<button type="button" className="sidebar-backdrop" aria-label="Close navigation" onClick={()=>setMobileNavOpen(false)}/>}
    <main className="erp-main">
      <button
        type="button"
        className="mobile-nav-trigger"
        aria-label={mobileNavOpen?"Close navigation":"Open navigation"}
        aria-expanded={mobileNavOpen}
        onClick={()=>setMobileNavOpen(value=>!value)}
      >{mobileNavOpen?<X size={18}/>:<Menu size={18}/>}<span>Menu</span></button>
      {tab==="Dashboard"&&<header><div><h1>{tab}</h1></div></header>}
      {message && <div className={`message ${/error|network|failed|unable|cannot|start the backend|could not be loaded|not configured/i.test(message)?"error":"success"}`}>{message}{/some data could not be loaded|backend api is not configured/i.test(message) && <button className="secondary" type="button" onClick={()=>load()} style={{marginLeft:10}}>Retry</button>}</div>}


      <Suspense fallback={<PageLoading label={tab} />}>
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
      {tab==="Dashboard" && <Dashboard cards={cards} generate={generate} loading={loading} latest={latest} role={auth.role} onNavigate={navigateFromDashboard} activeSession={activeSession}/>}
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
      {tab==="Generation Readiness" && <GenerationReadiness activeSession={activeSession} onNavigate={navigateFromDashboard}/>}
      {tab==="Validation" && <Validation/>}
      {tab==="Timetable" && <TimetableView timetable={latest} data={data} onMoved={load} timetableStatus={timetableStatus} setTimetableStatus={setTimetableStatus} setMessage={setMessage} approvalHistory={approvalHistory} activeSession={activeSession} role={auth.role}/>}
      {tab==="Timetable" && <TimetableVersions activeSession={activeSession} versionList={versionList} setVersionList={setVersionList} setLatest={setLatest} setMessage={setMessage}/>}
      {tab==="Settings" && <SchedulerSettings settings={settings} setSettings={setSettings} setMessage={setMessage} activeSession={activeSession}/>} 
      {tab==="Master Data Settings" && <MasterDataSettings data={data} setData={setData} reload={load} setMessage={setMessage}/>}
      {(tab==="Subject & Faculty Mapping") && <SubjectFacultyMapping data={data} sessions={sessions} activeSession={activeSession} reload={load} setMessage={setMessage}/>}
      {tab==="Program & Section Mapping" && <AcademicStructure sessions={sessions} activeSession={activeSession} programs={data.programs} data={data} reload={load} setMessage={setMessage}/>}
      {tab==="Import Center" && <ExcelImport reload={load} setMessage={setMessage}/>}
      {["Programs","Faculty","Subjects","Sections","Rooms","Time Slots"].includes(tab) &&
        <MasterView type={tab} data={data} setData={setData} reload={load}/>}
      {tab==="Availability" && <AvailabilityMatrix data={data} reload={load} setMessage={setMessage}/>}
      {tab==="Excel Import" && <ExcelImport reload={load} setMessage={setMessage}/>}
      </Suspense>
    </main>
  </div>
}
