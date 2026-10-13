import React, {lazy, Suspense, useEffect, useState} from "react";
import axios from "axios";
import {API, API_CONFIGURATION_ERROR} from "../core/api";
import {getPageForPath, getPathForPage} from "../core/pageRoutes";
import {refId} from "../core/utils";
import {navGroupsForRole} from "../core/navigation.jsx";
import {CalendarDays, Users, BookOpen, DoorOpen, Clock3, WandSparkles, Check, History, ChevronLeft, ChevronRight, ChevronDown} from "lucide-react";
import Login from "../pages/LoginPage.jsx";

const NAV_MODULE_CHILDREN = {
  "Academic Sessions": ["Academic Structure", "Holiday Management", "Generation Readiness"],
  "Full Session Timetable": ["All Program Timetables", "Timetable", "Calendar View", "Availability", "Optimization", "My Timetable"],
  Students: ["Student Mapping", "Student Profile", "Student Promotion"],
  "Master Data Settings": ["Subject & Faculty Mapping", "Program & Section Mapping"],
  "Excel Import": ["Import Center", "Templates & Clone"],
  Reports: ["Analytics", "Validation", "Change History", "Audit Logs"]
};

const NAV_CHILD_TO_PARENT = new Map(
  Object.entries(NAV_MODULE_CHILDREN).flatMap(([parent, children]) => children.map(child => [child, parent]))
);

function buildNavigationTree(group) {
  const byName = new Map(group.items.map(item => [item.name, item]));
  const consumed = new Set();
  const result = [];

  for (const item of group.items) {
    if (consumed.has(item.name)) continue;
    const childNames = NAV_MODULE_CHILDREN[item.name];

    if (childNames) {
      const children = childNames.filter(name => byName.has(name)).map(name => byName.get(name));
      children.forEach(child => consumed.add(child.name));
      result.push({ ...item, routeAllowed: true, children });
      continue;
    }

    const parentName = NAV_CHILD_TO_PARENT.get(item.name);
    if (parentName && !byName.has(parentName)) {
      const visibleChildren = NAV_MODULE_CHILDREN[parentName]
        .filter(name => byName.has(name))
        .map(name => byName.get(name));
      visibleChildren.forEach(child => consumed.add(child.name));
      if (visibleChildren.length) {
        result.push({
          name: parentName,
          Icon: visibleChildren[0].Icon,
          routeAllowed: false,
          children: visibleChildren
        });
      }
      continue;
    }

    if (parentName) continue;
    result.push({ ...item, routeAllowed: true, children: [] });
  }

  return result;
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
  const [collapsedNavGroups,setCollapsedNavGroups]=useState(()=>{
    try{return JSON.parse(localStorage.getItem("tt_nav_collapsed_groups")||"{}")}catch{return {}}
  });
  const [expandedNavModules,setExpandedNavModules]=useState(()=>{
    const defaults={"Academic Sessions":true,"Full Session Timetable":true};
    try{
      const saved=localStorage.getItem("tt_nav_expanded_modules");
      return saved ? {...defaults,...JSON.parse(saved)} : defaults;
    }catch{return defaults;}
  });
  useEffect(()=>{
    const parent=Object.entries(NAV_MODULE_CHILDREN).find(([,children])=>children.includes(tab))?.[0];
    if(parent) setExpandedNavModules(previous=>previous[parent]?previous:{...previous,[parent]:true});
  },[tab]);

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
  useEffect(()=>{localStorage.setItem("tt_nav_collapsed_groups",JSON.stringify(collapsedNavGroups));},[collapsedNavGroups]);
  useEffect(()=>{localStorage.setItem("tt_nav_expanded_modules",JSON.stringify(expandedNavModules));},[expandedNavModules]);

  // If a deep-linked page is open, reveal its navigation group and parent module.
  useEffect(()=>{
    if(!auth) return;
    for(const group of navGroupsForRole(auth.role)){
      const tree=buildNavigationTree(group);
      for(const item of tree){
        if(item.name===tab || item.children.some(child=>child.name===tab)){
          setCollapsedNavGroups(previous=>previous[group.label]?{...previous,[group.label]:false}:previous);
          if(item.children.some(child=>child.name===tab)){
            setExpandedNavModules(previous=>previous[item.name]?previous:{...previous,[item.name]:true});
          }
          return;
        }
      }
    }
  },[tab,auth?.role]);

  function navigateToNavPage(page,groupLabel,moduleName){
    setTab(page);
    setCollapsedNavGroups(previous=>previous[groupLabel]?{...previous,[groupLabel]:false}:previous);
    if(moduleName) setExpandedNavModules(previous=>previous[moduleName]?previous:{...previous,[moduleName]:true});
  }

  function navigateFromDashboard(page){
    for(const group of navGroupsForRole(auth.role)){
      for(const item of buildNavigationTree(group)){
        if(item.name===page){
          navigateToNavPage(page,group.label,item.children.length?item.name:undefined);
          return;
        }
        if(item.children.some(child=>child.name===page)){
          navigateToNavPage(page,group.label,item.name);
          return;
        }
      }
    }
    setTab(page);
  }


  if(!auth) return <Suspense fallback={<PageLoading label="sign in" />}><Login onLogin={u=>setAuth(u)} /></Suspense>;

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
    <aside className="erp-sidebar">
      <div className="brand">
        <CalendarDays size={22}/>
        <span>Time Table</span>
        <button type="button" className="sidebar-toggle" onClick={()=>setSidebarCollapsed(v=>!v)} title={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"} aria-label={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}>
          {sidebarCollapsed ? <ChevronRight size={17}/> : <ChevronLeft size={17}/>}
        </button>
      </div>
      <div className="workspace-label">ACADEMIC WORKSPACE</div>
      <nav className="sidebar-nav" aria-label="Main navigation">
        {navGroupsForRole(auth.role).map(group=>{
          const groupId="nav-group-"+group.label.toLowerCase().replace(/[^a-z0-9]+/g,"-");
          const groupCollapsed=Boolean(collapsedNavGroups[group.label]);
          return <div className={"nav-group"+(groupCollapsed?" is-collapsed":"")} key={group.label}>
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
              {buildNavigationTree(group).map(item=>{
                const hasChildren=item.children.length>0;
                const moduleExpanded=Boolean(expandedNavModules[item.name]);
                const moduleId="nav-module-"+item.name.toLowerCase().replace(/[^a-z0-9]+/g,"-");
                if(!hasChildren){
                  return <button
                    data-nav={item.name}
                    title={sidebarCollapsed?item.name:undefined}
                    className={tab===item.name?"nav active":"nav"}
                    onClick={()=>navigateToNavPage(item.name,group.label)}
                    key={item.name}
                    aria-current={tab===item.name?"page":undefined}
                  ><item.Icon size={17}/><span className="nav-label">{item.name}</span></button>;
                }
                const toggleModule=()=>setExpandedNavModules(previous=>({...previous,[item.name]:!previous[item.name]}));
                return <div className={"nav-module"+(moduleExpanded?" is-expanded":"")} key={item.name}>
                  <div className="nav-module-row">
                    {item.routeAllowed
                      ? <button
                          data-nav={item.name}
                          title={sidebarCollapsed?item.name:undefined}
                          className={"nav nav-module-link"+(tab===item.name?" active":"")}
                          onClick={()=>navigateToNavPage(item.name,group.label,item.name)}
                          aria-current={tab===item.name?"page":undefined}
                        ><item.Icon size={17}/><span className="nav-label">{item.name}</span></button>
                      : <button
                          type="button"
                          title={sidebarCollapsed?item.name:undefined}
                          className="nav nav-module-link nav-module-only"
                          onClick={toggleModule}
                          aria-expanded={moduleExpanded}
                          aria-controls={moduleId}
                        ><item.Icon size={17}/><span className="nav-label">{item.name}</span><ChevronDown className="nav-module-only-chevron" size={13}/></button>}
                    {item.routeAllowed&&<button
                      type="button"
                      className="nav-module-toggle"
                      onClick={toggleModule}
                      aria-label={(moduleExpanded?"Collapse ":"Expand ")+item.name+" submodules"}
                      aria-expanded={moduleExpanded}
                      aria-controls={moduleId}
                      title={(moduleExpanded?"Collapse ":"Expand ")+item.name+" submodules"}
                    ><ChevronDown size={14}/></button>}
                  </div>
                  {moduleExpanded&&!sidebarCollapsed&&<div className="nav-subitems" id={moduleId}>
                    {item.children.map(child=><button
                      data-nav={child.name}
                      className={"nav nav-subitem"+(tab===child.name?" active":"")}
                      key={child.name}
                      title={child.name}
                      onClick={()=>navigateToNavPage(child.name,group.label,item.name)}
                      aria-current={tab===child.name?"page":undefined}
                    ><span className="nav-subitem-marker" aria-hidden="true"/><child.Icon size={15}/><span className="nav-label">{child.name}</span></button>)}
                  </div>}
                </div>;
              })}
            </div>}
          </div>;
        })}
      </nav>
      <div className="side-bottom">
        {(["ADMIN","SCHEDULER"].includes(auth.role)) && <button className="primary full" onClick={generate} disabled={loading}><WandSparkles size={17}/> Generate Timetable</button>}
        <div style={{padding:"10px 4px",fontSize:12,color:"#64748b"}}>{auth.name} · {auth.role}</div>
        <button className="secondary full" onClick={()=>{localStorage.removeItem("tt_token");localStorage.removeItem("tt_user");window.location.reload()}}>Logout</button>
      </div>
    </aside>
    <main className="erp-main">
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
      {tab==="Dashboard" && <Dashboard cards={cards} generate={generate} loading={loading} latest={latest} role={auth.role} onNavigate={navigateFromDashboard}/>}
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
