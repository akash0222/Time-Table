import React, {lazy, Suspense, useEffect, useRef, useState} from "react";
import axios from "axios";
import {API, API_CONFIGURATION_ERROR} from "../core/api";
import {getPageForPath, getPathForPage} from "../core/pageRoutes";
import {refId} from "../core/utils";
import {navGroupsForRole} from "../core/navigation.jsx";
import {CalendarDays, Users, BookOpen, DoorOpen, Clock3, WandSparkles, Check, History, ChevronLeft, ChevronRight, ChevronDown, Menu, X, Search, UserRound, KeyRound, LogOut, ShieldCheck} from "lucide-react";
import Login from "../pages/LoginPage.jsx";

// The eight navigation group headings are the only main modules.
// Every page within a group is a direct submodule/link (no nested page parents).
function buildNavigationTree(group) {
  return group.items.map(item => ({ ...item, routeAllowed: true, children: [] }));
}

const SIDEBAR_MIN_WIDTH = 210;
const SIDEBAR_MAX_WIDTH = 420;
const SIDEBAR_DEFAULT_WIDTH = 258;

const NAV_MENU_LAYOUT = {
  "Academic Setup": [
    { type: "page", name: "Academic Sessions" },
    { type: "group", label: "Program & Section Structure", pages: ["Academic Structure", "Program & Section Mapping"] },
    { type: "page", name: "Holiday Management" },
    { type: "group", label: "Master Data & Mapping", pages: ["Master Data Settings", "Subject & Faculty Mapping"] }
  ],
  "Timetable & Scheduling": [
    { type: "group", label: "Generation & Optimization", pages: ["Generation Readiness", "Availability", "Optimization"] },
    { type: "group", label: "Timetable Views", pages: ["Full Session Timetable", "All Program Timetables", "Timetable", "Calendar View"] },
    { type: "page", name: "Approval & Versions" }
  ],
  "Students & Operations": [
    { type: "group", label: "Student Management", pages: ["Students", "Student Mapping", "Student Profile", "Student Promotion"] },
    { type: "group", label: "Attendance & Fees", pages: ["Attendance", "Fees"] }
  ],
  "Tools & Sharing": [
    { type: "group", label: "Import & Data Transfer", pages: ["Excel Import", "Import Center"] },
    { type: "group", label: "Templates & Sharing", pages: ["Templates & Clone", "Public Sharing"] }
  ],
  "Reports & Audit": [
    { type: "page", name: "Reports" },
    { type: "page", name: "Analytics" },
    { type: "group", label: "Validation & Audit History", pages: ["Validation", "Audit Logs", "Change History"] }
  ]
};

function buildFlyoutEntries(group, query = "") {
  const available = new Map(group.items.map(item => [item.name, item]));
  const normalizedQuery = String(query || "").trim().toLowerCase();
  if (normalizedQuery) {
    const matchingNames = new Set(
      group.items.filter(item => item.name.toLowerCase().includes(normalizedQuery)).map(item => item.name)
    );
    for (const rule of NAV_MENU_LAYOUT[group.label] || []) {
      if (rule.type === "group" && rule.label.toLowerCase().includes(normalizedQuery)) {
        rule.pages.forEach(name => { if (available.has(name)) matchingNames.add(name); });
      }
    }
    return group.items.filter(item => matchingNames.has(item.name)).map(item => ({ type: "page", ...item }));
  }

  const layout = NAV_MENU_LAYOUT[group.label] || group.items.map(item => ({ type: "page", name: item.name }));
  const entries = [];
  const used = new Set();
  for (const rule of layout) {
    if (rule.type === "page") {
      const item = available.get(rule.name);
      if (item && !used.has(item.name)) {
        entries.push({ type: "page", ...item });
        used.add(item.name);
      }
      continue;
    }
    const children = (rule.pages || []).map(name => available.get(name)).filter(Boolean);
    children.forEach(item => used.add(item.name));
    if (children.length === 1) entries.push({ type: "page", ...children[0] });
    else if (children.length > 1) entries.push({ type: "group", label: rule.label, items: children });
  }
  for (const item of group.items) {
    if (!used.has(item.name)) entries.push({ type: "page", ...item });
  }
  return entries;
}
const STUDENT_LIST_PAGES = new Set(["Students", "Student Mapping", "Student Profile"]);

function clampSidebarWidth(value) {
  const width = Number(value);
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Number.isFinite(width) && width > 0 ? width : SIDEBAR_DEFAULT_WIDTH));
}

// A cached user profile is not proof of an active session. The access token
// must exist too, otherwise the shell can render while every protected API
// call fails with "Authentication required".
function readStoredAuth() {
  try {
    const token = localStorage.getItem("tt_token");
    const storedUser = localStorage.getItem("tt_user");
    if (!token || !storedUser) {
      localStorage.removeItem("tt_user");
      return null;
    }
    const user = JSON.parse(storedUser);
    if (!user || typeof user !== "object" || !user.username || !user.role) {
      localStorage.removeItem("tt_token");
      localStorage.removeItem("tt_user");
      return null;
    }
    return user;
  } catch {
    try { localStorage.removeItem("tt_token"); localStorage.removeItem("tt_user"); } catch {}
    return null;
  }
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
const ApprovalVersions = lazy(() => import("../pages/ApprovalVersionsPage.jsx"));
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
  const [auth,setAuth]=useState(readStoredAuth);
  const [tab,setTabState]=useState(()=>getPageForPath(window.location.pathname));
  const setTab=(nextTab)=>setTabState(nextTab);
  const skipNextRouteSyncRef=useRef(false);

  // Browser-history navigation keeps each module addressable as its own page.
  useEffect(()=>{
    const syncPageFromUrl=()=>setTabState(getPageForPath(window.location.pathname));
    window.addEventListener("popstate",syncPageFromUrl);
    return ()=>window.removeEventListener("popstate",syncPageFromUrl);
  },[]);

  useEffect(()=>{
    // A login callback has already synchronously committed /dashboard. Skip
    // one route-sync pass so an older tab state cannot push its URL back.
    if(skipNextRouteSyncRef.current){
      skipNextRouteSyncRef.current=false;
      return;
    }
    const currentPath=window.location.pathname;

    // Protected page URLs should never display the sign-in form while keeping
    // a misleading /dashboard or other module path in the address bar.
    if(!auth){
      // A successful sign-in always starts from the Dashboard, regardless of
      // which protected URL was last visited before the session expired.
      if(currentPath!=="/login")window.history.replaceState({page:"Login"},"","/login");
      document.title="Sign in | Scheduly";
      return;
    }

    const visiblePages=navGroupsForRole(auth.role).flatMap(group=>group.items.map(item=>item.name));
    if(tab!=="Dashboard" && !visiblePages.includes(tab)){
      setMessage("This page is not available for your account role.");
      window.history.replaceState({page:"Dashboard"},"",getPathForPage("Dashboard"));
      setTabState("Dashboard");
      return;
    }

    const targetPath=getPathForPage(tab);
    const pageFromUrl=getPageForPath(currentPath);
    const canonicalPath=getPathForPage(pageFromUrl);

    // /login is only the authentication entry point. Once signed in, always
    // replace it with Dashboard instead of restoring a stale previous page.
    if(currentPath==="/login"){
      try { sessionStorage.removeItem("tt_return_to"); } catch {}
      window.history.replaceState({page:"Dashboard"},"",getPathForPage("Dashboard"));
      if(tab!=="Dashboard")setTabState("Dashboard");
      document.title="Scheduly";
      return;
    }

    // Normalize old aliases/unknown URLs without leaving a broken history step.
    if(currentPath!==canonicalPath && pageFromUrl===tab){
      window.history.replaceState({page:tab},"",canonicalPath);
    }else if(currentPath!==targetPath){
      window.history.pushState({page:tab},"",targetPath);
    }
    document.title=tab==="Dashboard" ? "Scheduly" : `${tab} | Scheduly`;
  },[tab,auth?.role,Boolean(auth)]);
  const [mobileNavOpen,setMobileNavOpen]=useState(false);
  const [sidebarCollapsed,setSidebarCollapsed]=useState(()=>{
    try{return localStorage.getItem("tt_sidebar_collapsed")==="true";}catch{return false;}
  });
  const [profileOpen,setProfileOpen]=useState(false);
  const [showPasswordModal,setShowPasswordModal]=useState(false);
  const [passwordSaving,setPasswordSaving]=useState(false);
  const [passwordForm,setPasswordForm]=useState({currentPassword:"",newPassword:"",confirmPassword:""});
  const profileMenuRef=useRef(null);
  const [sidebarWidth,setSidebarWidth]=useState(()=>{
    try{return clampSidebarWidth(localStorage.getItem("tt_sidebar_width")||SIDEBAR_DEFAULT_WIDTH);}
    catch{return SIDEBAR_DEFAULT_WIDTH;}
  });
  const sidebarResizeRef=useRef(null);
  const [navQuery,setNavQuery]=useState("");
  const [searchResultsOpen,setSearchResultsOpen]=useState(false);
  const [searchResultIndex,setSearchResultIndex]=useState(-1);
  const navSearchRef=useRef(null);
  const navSearchWrapRef=useRef(null);
  const [activeNavGroup,setActiveNavGroup]=useState(null);
  const [activeNavSubgroup,setActiveNavSubgroup]=useState(null);
  const [flyoutTop,setFlyoutTop]=useState(190);
  const [subFlyoutPosition,setSubFlyoutPosition]=useState({top:190,left:548});
  const navCloseTimerRef=useRef(null);


  const [data,setData]=useState({faculty:[],subjects:[],sections:[],rooms:[],timeslots:[],programs:[],semesters:[],students:[]});
  const [latest,setLatest]=useState(null);
  const [message,setMessage]=useState("");
  const [loading,setLoading]=useState(false);
  const [showGenerationDialog,setShowGenerationDialog]=useState(false);
  const [selectedProgramIds,setSelectedProgramIds]=useState([]);
  const [settings,setSettings]=useState({maxConsecutiveFaculty:2,maxConsecutiveSection:3,avoidSameSubjectSameDay:true,distributeSubjectAcrossDays:true,avoidFirstLastPeriod:false,holidayDays:["Sunday"],generationRuns:8,generationTimeLimitMs:30000});
  const [timetableStatus,setTimetableStatus]=useState("DRAFT");
  const [activeSession,setActiveSession]=useState(null);
  const [sessions,setSessions]=useState([]);
  const [versionList,setVersionList]=useState([]);
  const [approvalHistory,setApprovalHistory]=useState([]);
  const loadRef=useRef(null);
  const isLoadingDataRef=useRef(false);
  const pendingRefreshRef=useRef(false);

  async function load({verifyAccount=true}={}){
    // Another tab, a stale browser storage entry, or a previous 401 may have
    // removed the token while this shell still holds the cached user in React.
    // Stop before firing a batch of guaranteed-401 requests and return to login.
    if(!localStorage.getItem("tt_token")){
      try { localStorage.removeItem("tt_user"); } catch {}
      setAuth(null);
      setMessage("");
      setData({faculty:[],subjects:[],sections:[],rooms:[],timeslots:[],programs:[],semesters:[],students:[]});
      setActiveSession(null);
      setSessions([]);
      setLatest(null);
      setVersionList([]);
      setApprovalHistory([]);
      setTimetableStatus("DRAFT");
      return;
    }
    if(!API){
      setMessage(API_CONFIGURATION_ERROR);
      return;
    }

    if(isLoadingDataRef.current){
      // Do not lose a focus/visibility refresh if the initial batch is still loading.
      pendingRefreshRef.current=true;
      return;
    }
    isLoadingDataRef.current=true;
    try{
      const loadErrors=[];
      // Student lists can be large; only fetch them when a student-list page is active.
      // Background dashboard/focus refreshes should not download every student record.
      const keys=Object.keys(data).filter(key=>key!=="students");

    // Fetch account hydration, all master-data resources, and session data in
    // parallel. Previously /auth/me and session resolution were serial gates,
    // adding several avoidable network round trips after every sign-in.
    const request = promise => promise
      .then(response=>({ok:true,value:response.data}))
      .catch(error=>({ok:false,error}));
    const [meResult,results,sessionsResult,activeSessionResult]=await Promise.all([
      verifyAccount ? request(axios.get(`${API}/auth/me`)) : Promise.resolve({ok:true,value:null,skipped:true}),
      Promise.all(keys.map(async k=>{
        const result=await request(axios.get(`${API}/${k}`));
        if(!result.ok)loadErrors.push(`${k}: ${result.error.response?.data?.message||result.error.message||"request failed"}`);
        return result;
      })),
      request(axios.get(`${API}/sessions`)),
      request(axios.get(`${API}/sessions/active`))
    ]);

    if(verifyAccount){
      if(meResult.ok){
        const fresh=meResult.value?.user;
        if(fresh){setAuth(fresh);localStorage.setItem("tt_user",JSON.stringify(fresh));}
      }else if(meResult.error.response?.status!==401){
        loadErrors.push(`Account check: ${meResult.error.response?.data?.message||meResult.error.message||"request failed"}`);
      }
    }
    const next={...data};
    keys.forEach((k,i)=>{
      const value=results[i]?.value;
      // Don't wipe previously loaded data just because one endpoint failed.
      next[k]=results[i]?.ok
        ? (Array.isArray(value)?value:(Array.isArray(value?.data)?value.data:[]))
        : (Array.isArray(data[k])?data[k]:[]);
    });
    setData(next);

    // The independent session endpoint responses arrived in parallel above.
    // Context-specific timetable/settings requests are handled by one effect
    // when activeSession changes, avoiding a second duplicate set of requests.
    const sessionRows=sessionsResult.ok
      ? (Array.isArray(sessionsResult.value)?sessionsResult.value:[])
      : (Array.isArray(sessions)?sessions:[]);
    if(sessionsResult.ok){
      setSessions(sessionRows);
    }else{
      loadErrors.push(`Academic sessions: ${sessionsResult.error.response?.data?.message||sessionsResult.error.message||"request failed"}`);
    }
    const resolvedActiveSession=activeSessionResult.ok
      ? (activeSessionResult.value||sessionRows.find(session=>session.active)||null)
      : (sessionRows.find(session=>session.active)||null);
    if(!activeSessionResult.ok&&sessionsResult.ok){
      // /sessions is the compatibility fallback when /sessions/active isn't
      // available; don't report a noisy load error when fallback resolved it.
      if(!resolvedActiveSession)loadErrors.push(`Active session: ${activeSessionResult.error.response?.data?.message||activeSessionResult.error.message||"request failed"}`);
    }
    setActiveSession(resolvedActiveSession);
    if(!resolvedActiveSession?._id){
      setVersionList([]);
      setLatest(null);
      setTimetableStatus("DRAFT");
      setApprovalHistory([]);
    }

    if(loadErrors.length){
      setMessage(`Some data could not be loaded. Check the backend/API configuration, then retry. ${loadErrors.slice(0,3).join(" | ")}`);
    }else{
      // Clear only a stale load/API error; retain unrelated action feedback.
      setMessage(current=>/^Some data could not be loaded\./i.test(String(current||""))||/^Backend API is not configured\./i.test(String(current||""))?"":current);
      }
    } finally {
      isLoadingDataRef.current=false;
      if(pendingRefreshRef.current){
        pendingRefreshRef.current=false;
        Promise.resolve().then(()=>loadRef.current?.({verifyAccount:false}))
          .catch(error=>setMessage(error.response?.data?.message||"Unable to refresh application data."));
      }
    }
  }
  async function reloadStudentData(){
    await load({verifyAccount:false});
    if(!API)return;
    const response=await axios.get(`${API}/students`);
    const rows=Array.isArray(response.data)?response.data:(Array.isArray(response.data?.data)?response.data.data:[]);
    setData(current=>({...current,students:rows}));
  }

  // Revalidate server-backed records when the user returns to an open tab.
  // Keep the mounted page, but refresh its data instead of showing pre-reset records.
  loadRef.current=load;
  useEffect(()=>{
    if(!auth) return;
    // Coalesce concurrent refreshes in load(). A short event cooldown only
    // prevents focus + visibilitychange from firing duplicate batches; the
    // first focus event must still refresh records that changed while the tab
    // was open.
    let lastRefreshAt=0;
    const refreshIfVisible=()=>{
      if(document.visibilityState==="hidden") return;
      const now=Date.now();
      if(now-lastRefreshAt<3000) return;
      lastRefreshAt=now;
      loadRef.current?.({verifyAccount:false}).catch(e=>setMessage(e.response?.data?.message||"Unable to refresh application data."));
    };
    const onVisibilityChange=()=>{ if(document.visibilityState==="visible") refreshIfVisible(); };
    window.addEventListener("focus",refreshIfVisible);
    document.addEventListener("visibilitychange",onVisibilityChange);
    return ()=>{
      window.removeEventListener("focus",refreshIfVisible);
      document.removeEventListener("visibilitychange",onVisibilityChange);
    };
  },[auth?.username]);
  useEffect(()=>{if(auth) load().catch(e=>setMessage(e.response?.data?.message||"Unable to load application data. Please retry."));},[auth?.username]);

  // Load the potentially large student list only when a screen needs it.
  // The request is cancelled on navigation so an old response cannot overwrite newer UI state.
  useEffect(()=>{
    if(!auth || !STUDENT_LIST_PAGES.has(tab)) return undefined;
    if(!API){setMessage(API_CONFIGURATION_ERROR);return undefined;}
    let active=true;
    axios.get(`${API}/students`)
      .then(response=>{
        if(!active)return;
        const rows=Array.isArray(response.data)?response.data:(Array.isArray(response.data?.data)?response.data.data:[]);
        setData(current=>({...current,students:rows}));
      })
      .catch(error=>{
        if(active)setMessage(error.response?.data?.message||"Unable to load student records. Please retry.");
      });
    return ()=>{active=false;};
  },[auth?.username,tab]);
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

  // The navigation stays fixed-width on desktop; only mobile uses the drawer.
  useEffect(()=>{
    const onKeyboardShortcut=event=>{
      if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="k"){
        event.preventDefault();
        setSearchResultsOpen(true);
        if(window.matchMedia("(max-width: 1000px)").matches)setMobileNavOpen(true);
        requestAnimationFrame(()=>navSearchRef.current?.focus());
      }else if(event.key==="Escape"&&document.activeElement===navSearchRef.current){
        setNavQuery("");
        setSearchResultIndex(0);
        setSearchResultsOpen(false);
        navSearchRef.current?.blur();
      }
    };
    window.addEventListener("keydown",onKeyboardShortcut);
    return ()=>window.removeEventListener("keydown",onKeyboardShortcut);
  },[navQuery]);

  useEffect(()=>{
    if(!mobileNavOpen)return;
    const closeOnEscape=event=>{if(event.key==="Escape"){setMobileNavOpen(false);setActiveNavGroup(null);}};
    window.addEventListener("keydown",closeOnEscape);
    return ()=>window.removeEventListener("keydown",closeOnEscape);
  },[mobileNavOpen]);

  useEffect(()=>{
    const closeSearchOutside=event=>{
      if(!navSearchWrapRef.current?.contains(event.target))setSearchResultsOpen(false);
    };
    document.addEventListener("pointerdown",closeSearchOutside);
    return ()=>document.removeEventListener("pointerdown",closeSearchOutside);
  },[]);

  useEffect(()=>{
    if(!profileOpen)return;
    const closeOutside=event=>{if(!profileMenuRef.current?.contains(event.target))setProfileOpen(false);};
    const closeEscape=event=>{if(event.key==="Escape")setProfileOpen(false);};
    document.addEventListener("pointerdown",closeOutside);
    window.addEventListener("keydown",closeEscape);
    return ()=>{
      document.removeEventListener("pointerdown",closeOutside);
      window.removeEventListener("keydown",closeEscape);
    };
  },[profileOpen]);

  useEffect(()=>{
    if(!showPasswordModal)return;
    const closeEscape=event=>{if(event.key==="Escape"&&!passwordSaving)setShowPasswordModal(false);};
    window.addEventListener("keydown",closeEscape);
    return ()=>window.removeEventListener("keydown",closeEscape);
  },[showPasswordModal,passwordSaving]);

  useEffect(()=>{
    if(!showGenerationDialog)return;
    const closeDialogOnEscape=event=>{
      if(event.key==="Escape"){
        event.preventDefault();
        setShowGenerationDialog(false);
      }
    };
    window.addEventListener("keydown",closeDialogOnEscape);
    return ()=>window.removeEventListener("keydown",closeDialogOnEscape);
  },[showGenerationDialog]);

  useEffect(()=>{
    if(!activeNavGroup)return;
    const close=event=>{
      if(event.key==="Escape"){setActiveNavGroup(null);setActiveNavSubgroup(null);}
    };
    window.addEventListener("keydown",close);
    return ()=>window.removeEventListener("keydown",close);
  },[activeNavGroup]);

  useEffect(()=>()=>{
    if(navCloseTimerRef.current)window.clearTimeout(navCloseTimerRef.current);
  },[]);

  function cancelNavClose(){
    if(navCloseTimerRef.current){
      window.clearTimeout(navCloseTimerRef.current);
      navCloseTimerRef.current=null;
    }
  }

  function scheduleNavClose(){
    cancelNavClose();
    // A short grace period lets the pointer cross the small gap between panels.
    navCloseTimerRef.current=window.setTimeout(()=>{
      setActiveNavGroup(null);
      setActiveNavSubgroup(null);
      navCloseTimerRef.current=null;
    },180);
  }

  function navigateToNavPage(page,groupLabel){
    // Clear page-scoped status (for example, "Editing mappings" from User Management)
    // before switching modules, so it does not appear to describe the next page.
    setMessage("");
    setTab(page);
    setNavQuery("");
    setSearchResultsOpen(false);
    setSearchResultIndex(0);
    setActiveNavGroup(null);
    setActiveNavSubgroup(null);
    setMobileNavOpen(false);
    setProfileOpen(false);
  }

  function persistSidebarWidth(width){
    try{localStorage.setItem("tt_sidebar_width",String(clampSidebarWidth(width)));}catch{}
  }

  function startSidebarResize(event){
    if(window.matchMedia("(max-width: 1000px)").matches)return;
    event.preventDefault();
    sidebarResizeRef.current={pointerId:event.pointerId,startX:event.clientX,startWidth:sidebarWidth};
    try{event.currentTarget.setPointerCapture(event.pointerId);}catch{}
  }

  function moveSidebarResize(event){
    const drag=sidebarResizeRef.current;
    if(!drag||drag.pointerId!==event.pointerId)return;
    const next=clampSidebarWidth(drag.startWidth+(event.clientX-drag.startX));
    setSidebarWidth(next);
    persistSidebarWidth(next);
  }

  function stopSidebarResize(event){
    const drag=sidebarResizeRef.current;
    if(!drag||drag.pointerId!==event.pointerId)return;
    sidebarResizeRef.current=null;
    persistSidebarWidth(sidebarWidth);
    try{
      if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
    }catch{}
  }

  function handleSidebarResizeKeyDown(event){
    let next=sidebarWidth;
    if(event.key==="ArrowLeft")next=sidebarWidth-10;
    else if(event.key==="ArrowRight")next=sidebarWidth+10;
    else if(event.key==="Home")next=SIDEBAR_MIN_WIDTH;
    else if(event.key==="End")next=SIDEBAR_MAX_WIDTH;
    else return;
    event.preventDefault();
    next=clampSidebarWidth(next);
    setSidebarWidth(next);
    persistSidebarWidth(next);
  }

  function toggleSidebar(){
    if(window.matchMedia("(max-width: 1000px)").matches){
      setMobileNavOpen(value=>{
        const next=!value;
        if(!next)setActiveNavGroup(null);
        return next;
      });
      return;
    }
    setSidebarCollapsed(current=>{
      const next=!current;
      try{localStorage.setItem("tt_sidebar_collapsed",String(next));}catch{}
      if(next)setActiveNavGroup(null);
      return next;
    });
  }

  function logout(){
    const currentPath=window.location.pathname;
    try {
      sessionStorage.setItem("tt_return_to",getPathForPage(getPageForPath(currentPath)));
    } catch {}
    localStorage.removeItem("tt_token");
    localStorage.removeItem("tt_user");
    setProfileOpen(false);
    setMobileNavOpen(false);
    setActiveNavGroup(null);
    setAuth(null);
    setTabState("Dashboard");
    window.history.replaceState({page:"Login"},"","/login");
    document.title="Sign in | Scheduly";
  }

  // End the session after 30 minutes without user interaction. JWT expiry
  // remains a separate hard limit enforced by the backend.
  useEffect(()=>{
    if(!auth)return undefined;
    let tokenTimeoutId=null;
    let idleTimeoutId=null;
    let idleDeadline=Date.now()+30*60*1000;
    const clearTimers=()=>{
      if(tokenTimeoutId)window.clearTimeout(tokenTimeoutId);
      if(idleTimeoutId)window.clearTimeout(idleTimeoutId);
    };
    const expireSession=(message="Your session has expired. Please sign in again.")=>{
      clearTimers();
      try { sessionStorage.setItem("tt_auth_notice",message); } catch {}
      logout();
    };
    const scheduleTokenExpiry=()=>{
      if(tokenTimeoutId)window.clearTimeout(tokenTimeoutId);
      const currentToken=localStorage.getItem("tt_token");
      if(!currentToken){logout();return;}
      try{
        const parts=currentToken.split(".");
        if(parts.length!==3)throw new Error("Invalid session token");
        const payload=JSON.parse(window.atob(parts[1].replace(/-/g,"+").replace(/_/g,"/")));
        const expiresAt=Number(payload.exp)*1000;
        if(!Number.isFinite(expiresAt)||expiresAt<=Date.now()){
          expireSession();
          return;
        }
        tokenTimeoutId=window.setTimeout(()=>expireSession(),Math.min(expiresAt-Date.now(),2147480000));
      }catch{
        expireSession();
      }
    };
    const checkIdle=()=>{
      if(Date.now()>=idleDeadline){
        expireSession("You were signed out after 30 minutes of inactivity. Please sign in again.");
        return;
      }
      if(idleTimeoutId)window.clearTimeout(idleTimeoutId);
      idleTimeoutId=window.setTimeout(checkIdle,Math.max(1000,idleDeadline-Date.now()));
    };
    const recordActivity=()=>{
      idleDeadline=Date.now()+30*60*1000;
      checkIdle();
    };
    const activityEvents=["pointerdown","pointermove","keydown","scroll","touchstart","click"];
    activityEvents.forEach(eventName=>window.addEventListener(eventName,recordActivity,{passive:true}));
    const handleStorage=(event)=>{
      if(event.key==="tt_token"&&!event.newValue){
        expireSession("You have been signed out. Please sign in again.");
      } else if(event.key==="tt_token"&&event.newValue){
        scheduleTokenExpiry();
        recordActivity();
      }
    };
    const handleVisibility=()=>{
      if(document.visibilityState==="visible")checkIdle();
    };
    scheduleTokenExpiry();
    checkIdle();
    window.addEventListener("storage",handleStorage);
    document.addEventListener("visibilitychange",handleVisibility);
    return ()=>{
      clearTimers();
      activityEvents.forEach(eventName=>window.removeEventListener(eventName,recordActivity));
      window.removeEventListener("storage",handleStorage);
      document.removeEventListener("visibilitychange",handleVisibility);
    };
  },[Boolean(auth)]);

  function positionFlyout(event){
    const rect=event.currentTarget.getBoundingClientRect();
    const isPhone=window.matchMedia("(max-width: 700px)").matches;
    // Mobile flyouts use a centered overlay; desktop flyouts track their module,
    // while keeping enough room below for the submenu to scroll.
    const top=isPhone
      ? Math.max(16,Math.round(window.innerHeight*0.1))
      : Math.max(16,Math.min(rect.top,window.innerHeight-220));
    setFlyoutTop(top);
  }

  function showNavGroup(event,group){
    const original=navGroupsForRole(auth.role).find(item=>item.label===group.label)||group;
    if(original.items.length<=1){
      setActiveNavGroup(null);
      setActiveNavSubgroup(null);
      return;
    }
    positionFlyout(event);
    setActiveNavGroup(group.label);
    setActiveNavSubgroup(null);
  }

  function openNavSubgroup(event,entry){
    const buttonRect=event.currentTarget.getBoundingClientRect();
    const parentPanel=event.currentTarget.closest(".nav-flyout-panel");
    const panelRect=parentPanel?.getBoundingClientRect();
    const panelWidth=254;
    const gap=8;
    let left=(panelRect?.right ?? buttonRect.right)+gap;
    if(left+panelWidth>window.innerWidth-8){
      left=Math.max(8,(panelRect?.left ?? buttonRect.left)-panelWidth-gap);
    }
    const estimatedHeight=Math.min(window.innerHeight-24,entry.items.length*42+64);
    const top=Math.max(12,Math.min(buttonRect.top,window.innerHeight-estimatedHeight-12));
    setSubFlyoutPosition({top,left});
    setActiveNavSubgroup(entry.label);
  }

  function openNavGroup(event,group){
    const original=navGroupsForRole(auth.role).find(item=>item.label===group.label)||group;
    // Search filters the flyout's children; it must not turn a multi-page module
    // into a direct-navigation button when only one result matches.
    if(original.items.length===1){
      navigateToNavPage(original.items[0].name,group.label);
      setActiveNavGroup(null);
      setActiveNavSubgroup(null);
      return;
    }
    positionFlyout(event);
    // Hover/focus may have already opened this group before the click event.
    // Selecting the module should keep its submenu open, not immediately toggle it closed.
    setActiveNavGroup(group.label);
    setActiveNavSubgroup(null);
  }

  function navigateFromDashboard(page){
    for(const group of navGroupsForRole(auth.role)){
      if(group.items.some(item=>item.name===page)){
        navigateToNavPage(page,group.label);
        return;
      }
    }
    setMessage("");
    setTab(page);
    setNavQuery("");
    setMobileNavOpen(false);
  }

  const normalizedNavQuery=navQuery.trim().toLowerCase();
  const visibleNavGroups=auth?navGroupsForRole(auth.role):[];
  const pageSearchResults=normalizedNavQuery?visibleNavGroups.flatMap(group=>group.items
    .filter(item=>item.name.toLowerCase().includes(normalizedNavQuery))
    .map(item=>({...item,groupLabel:group.label}))
  ).slice(0,8):[];

  if(!auth) return <Suspense fallback={<PageLoading label="sign in" />}><Login onLogin={u=>{
    // Reset route + tab together and ignore one pending route-sync pass.
    skipNextRouteSyncRef.current=true;
    setTabState("Dashboard");
    window.history.replaceState({page:"Dashboard"},"",getPathForPage("Dashboard"));
    setAuth(u);
    try { sessionStorage.removeItem("tt_return_to"); } catch {}
    document.title="Scheduly";
  }} /></Suspense>;

  async function generate(programIds=selectedProgramIds){
    setShowGenerationDialog(false);
    setLoading(true);
    setMessage("");
    try {
      if(!activeSession?._id){
        navigateToNavPage("Academic Sessions","Academic Setup");
        setMessage("Generation was not started. Set an active academic session first.");
        return;
      }

      // Always run the authoritative readiness endpoint before attempting generation.
      // Warnings are surfaced in the Readiness page, but blocking errors stop generation.
      let preflight;
      try{
        preflight=(await axios.get(`${API}/timetable/readiness`,{params:{sessionId:activeSession._id,programIds:(programIds||[]).join(",")}})).data;
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
      const selectedPrograms=new Set((programIds||[]).map(String));
      const selectedProgramRecords=(data.programs||[]).filter(program=>selectedPrograms.has(String(program._id)));
      const selectedProgramNames=new Set(selectedProgramRecords.flatMap(program=>[program.name,program.code].filter(Boolean).map(value=>String(value).trim().toLowerCase())));
      const isSelectedSection=sec=>!selectedPrograms.size || selectedPrograms.has(refId(sec.programId)) || selectedProgramNames.has(String(sec.program||"").trim().toLowerCase());
      const currentSectionIds=new Set(
        (data.sections||[])
          .filter(sec=>(!currentSessionId || refId(sec.academicSession)===currentSessionId) && isSelectedSection(sec))
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

      const r=await axios.post(`${API}/timetable/generate`,{academicSessionId:activeSession?._id,programIds:programIds||[],generationRuns:Number(settings.generationRuns||8),generationTimeLimitMs:Number(settings.generationTimeLimitMs||30000)});
      setLatest(r.data);
      setTab("Timetable");
      const count=r.data.entries?.length||0;
      const warnings=Array.isArray(r.data.warnings)?r.data.warnings:[];
      setMessage(
        count>0
          ? `Generated ${count} timetable entries${programIds?.length?` for ${(data.programs||[]).filter(p=>programIds.includes(String(p._id))).map(p=>p.name).join(", ")}`:""} using the best candidate from ${r.data.optimization?.runsCompleted||1} generation run(s).${warnings.length?" "+warnings[0]:""}`
          : `Generated 0 timetable entries. ${warnings.join(" ")||"No valid placement was found. Check your Faculty, Section, Room, Availability and Time Slot settings."}`
      );
      await load();
    }catch(e){
      const responseData=e.response?.data||{};
      const detailErrors=Array.isArray(responseData.validation?.errors)
        ? responseData.validation.errors
        : Array.isArray(responseData.errors) ? responseData.errors : [];
      const detailText=detailErrors.length
        ? " Details: "+detailErrors.slice(0,5).join(" | ")+(detailErrors.length>5?" (+"+(detailErrors.length-5)+" more)":"")
        : "";
      setMessage((responseData.message||e.message||"Timetable generation failed.")+detailText);
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



  return <div
    className={`app ${mobileNavOpen ? "mobile-nav-open" : ""} ${sidebarCollapsed ? "sidebar-collapsed" : ""} ${activeNavGroup ? "nav-flyout-open" : ""}`}
    style={{"--sidebar-width":`${sidebarCollapsed ? 76 : sidebarWidth}px`,"--sidebar-expanded-width":`${sidebarWidth}px`}}
  >
    <aside className="erp-sidebar" onMouseEnter={cancelNavClose} onMouseLeave={scheduleNavClose}>
      <div className="sidebar-brand-row">
        <div className="brand" aria-label="Scheduly home">
          <img className="scheduly-logo-mark" src="/scheduly.svg" alt="" />
          <span>Scheduly</span>
        </div>
        <button
          type="button"
          className="sidebar-toggle"
          onClick={toggleSidebar}
          aria-label={mobileNavOpen?"Close navigation":sidebarCollapsed?"Expand navigation":"Collapse navigation"}
          title={mobileNavOpen?"Close navigation":sidebarCollapsed?"Expand navigation":"Collapse navigation"}
          aria-expanded={!sidebarCollapsed}
        >{mobileNavOpen?<X size={17}/>:sidebarCollapsed?<ChevronRight size={17}/>:<ChevronLeft size={17}/>}</button>
      </div>
      <div className="workspace-label">ACADEMIC WORKSPACE</div>
      <nav
        className="sidebar-nav module-nav"
        aria-label="Main navigation"
        onScroll={()=>{
          if(activeNavGroup){
            setActiveNavGroup(null);
            setActiveNavSubgroup(null);
          }
        }}
      >
        {visibleNavGroups.map(group=>{
          const active=activeNavGroup===group.label;
          const current=group.items.some(item=>item.name===tab);
          const Icon=group.items[0]?.Icon||Activity;
          return <div className="nav-module-entry" key={group.label}>
            <button
              type="button"
              className={`nav-module-button${current?" has-current":""}${active?" is-open":""}`}
              onMouseEnter={event=>showNavGroup(event,group)}
              onFocus={event=>showNavGroup(event,group)}
              onClick={event=>openNavGroup(event,group)}
              aria-expanded={active}
              aria-haspopup={group.items.length>1?"dialog":undefined}
              title={group.label}
              data-nav-module={group.label}
              data-nav-group={group.label}
            >
              <Icon size={18}/>
              <span>{group.label}</span>
              {group.items.length>1&&<ChevronRight className="nav-module-chevron" size={15}/>}
            </button>
          </div>;
        })}
      </nav>
      <div className="side-bottom">
        {(["ADMIN","SCHEDULER"].includes(auth.role)) && <button className="primary full" onClick={()=>{setSelectedProgramIds((data.programs||[]).filter(p=>p.active!==false).map(p=>String(p._id)));setShowGenerationDialog(true);}} disabled={loading}><WandSparkles size={17}/><span>Generate Timetable</span></button>}
      </div>
      <div
        className="sidebar-resize-handle"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize navigation sidebar"
        aria-valuemin={SIDEBAR_MIN_WIDTH}
        aria-valuemax={SIDEBAR_MAX_WIDTH}
        aria-valuenow={sidebarWidth}
        aria-valuetext={`${sidebarWidth} pixels wide`}
        tabIndex={0}
        onPointerDown={startSidebarResize}
        onPointerMove={moveSidebarResize}
        onPointerUp={stopSidebarResize}
        onPointerCancel={stopSidebarResize}
        onKeyDown={handleSidebarResizeKeyDown}
      />
    </aside>
    {activeNavGroup&&(()=>{
      // Keep role permissions authoritative while presenting submodules as nested flyouts.
      const group=navGroupsForRole(auth.role).find(item=>item.label===activeNavGroup);
      if(!group)return null;
      const entries=buildFlyoutEntries(group);
      const activeSubgroup=entries.find(entry=>entry.type==="group"&&entry.label===activeNavSubgroup);
      const renderPageLink=(item,parentLabel=null) => <button type="button" key={item.name} data-nav={item.name} data-nav-group={group.label} data-nav-parent={parentLabel||undefined} aria-current={tab===item.name?"page":undefined} className={tab===item.name?"nav-flyout-item active":"nav-flyout-item"} onMouseEnter={()=>{if(!parentLabel)setActiveNavSubgroup(null);}} onFocus={()=>{if(!parentLabel)setActiveNavSubgroup(null);}} onClick={()=>navigateToNavPage(item.name,group.label)}>
        <span className="nav-flyout-marker" aria-hidden="true"/><span>{item.name}</span>{tab===item.name&&<Check size={15}/>}
      </button>;
      return <div className="nav-flyout-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget){setActiveNavGroup(null);setActiveNavSubgroup(null);}}}>
        <section className="nav-flyout-panel" role="dialog" aria-label={group.label+" submenu"} onMouseEnter={cancelNavClose} onMouseLeave={scheduleNavClose} style={{top:flyoutTop,maxHeight:"calc(100dvh - "+flyoutTop+"px - 18px)"}}>
          <header className="nav-flyout-header"><strong>{group.label}</strong><button type="button" onClick={()=>{setActiveNavGroup(null);setActiveNavSubgroup(null);}} aria-label="Close submenu"><X size={16}/></button></header>
          <div className="nav-flyout-items">
            {entries.map(entry=>entry.type==="page"
              ? renderPageLink(entry)
              : <button type="button" key={entry.label} data-nav-submenu={entry.label} data-nav-group={group.label} aria-haspopup="dialog" aria-expanded={activeNavSubgroup===entry.label} className={"nav-flyout-item nav-flyout-submenu"+(activeNavSubgroup===entry.label?" active":"")} onMouseEnter={event=>openNavSubgroup(event,entry)} onFocus={event=>openNavSubgroup(event,entry)} onClick={event=>openNavSubgroup(event,entry)}>
                  <span className="nav-flyout-marker" aria-hidden="true"/><span>{entry.label}</span><ChevronRight size={15} className="nav-flyout-submenu-chevron"/>
                </button>)}
            {!entries.length&&<p className="nav-search-empty">No submodules found.</p>}
          </div>
        </section>
        {activeSubgroup&&<section className="nav-subflyout-panel" role="dialog" aria-label={activeSubgroup.label+" pages"} onMouseEnter={cancelNavClose} onMouseLeave={scheduleNavClose} style={{top:subFlyoutPosition.top,left:subFlyoutPosition.left,maxHeight:"calc(100dvh - "+subFlyoutPosition.top+"px - 12px)"}}>
          <header className="nav-flyout-header"><strong>{activeSubgroup.label}</strong><button type="button" onClick={()=>setActiveNavSubgroup(null)} aria-label="Close nested submenu"><X size={16}/></button></header>
          <div className="nav-flyout-items">{activeSubgroup.items.map(item=>renderPageLink(item,activeSubgroup.label))}</div>
        </section>}
      </div>;
    })()}
    {showPasswordModal&&<div className="modal-backdrop password-modal-backdrop" role="presentation" onClick={event=>{if(event.target===event.currentTarget&&!passwordSaving)setShowPasswordModal(false);}}>
      <section className="modal-panel password-modal-panel" role="dialog" aria-modal="true" aria-label="Change Password" aria-labelledby="change-password-title">
        <div className="modal-header">
          <div><h2 id="change-password-title">Change Password</h2><p>Choose a new password with at least 10 characters.</p></div>
          <button type="button" className="icon-button" onClick={()=>setShowPasswordModal(false)} aria-label="Close Change Password" disabled={passwordSaving}><X size={18}/></button>
        </div>
        <form className="password-change-form" onSubmit={changePassword}>
          <label>Current password<input type="password" autoComplete="current-password" required value={passwordForm.currentPassword} onChange={event=>setPasswordForm(form=>({...form,currentPassword:event.target.value}))}/></label>
          <label>New password<input type="password" autoComplete="new-password" minLength={10} required value={passwordForm.newPassword} onChange={event=>setPasswordForm(form=>({...form,newPassword:event.target.value}))}/></label>
          <label>Confirm new password<input type="password" autoComplete="new-password" minLength={10} required value={passwordForm.confirmPassword} onChange={event=>setPasswordForm(form=>({...form,confirmPassword:event.target.value}))}/></label>
          <div className="password-change-actions">
            <button type="button" className="secondary" onClick={()=>setShowPasswordModal(false)} disabled={passwordSaving}>Cancel</button>
            <button type="submit" className="primary" disabled={passwordSaving}><KeyRound size={15}/>{passwordSaving?"Updating...":"Update Password"}</button>
          </div>
        </form>
      </section>
    </div>}
    {showGenerationDialog&&<div className="modal-backdrop generation-modal-backdrop" role="presentation" onClick={event=>{if(event.target===event.currentTarget)setShowGenerationDialog(false);}}>
      <section className="modal-panel generation-modal-panel" role="dialog" aria-modal="true" aria-labelledby="generate-program-title">
        <div className="modal-header">
          <div><h2 id="generate-program-title">Generate Timetable</h2><p>Select the program(s) to generate for {activeSession?.name||"the active academic session"}.</p></div>
          <button type="button" className="icon-button" onClick={()=>setShowGenerationDialog(false)} aria-label="Close dialog"><X size={18}/></button>
        </div>
        <div className="modal-actions" style={{display:"flex",gap:8,marginBottom:12}}>
          <button type="button" className="secondary" onClick={()=>setSelectedProgramIds((data.programs||[]).filter(p=>p.active!==false).map(p=>String(p._id)))}>Select all</button>
          <button type="button" className="secondary" onClick={()=>setSelectedProgramIds([])}>Clear selection</button>
        </div>
        <div className="modal-program-list">
          {(data.programs||[]).filter(p=>p.active!==false).map(program=><label key={program._id} className="modal-program-option">
            <input type="checkbox" checked={selectedProgramIds.includes(String(program._id))} onChange={event=>setSelectedProgramIds(previous=>event.target.checked?[...new Set([...previous,String(program._id)])]:previous.filter(id=>id!==String(program._id)))}/>
            <span><strong>{program.name}</strong>{program.code&&<small style={{display:"block",opacity:.7}}>{program.code}</small>}</span>
          </label>)}
          {!(data.programs||[]).some(p=>p.active!==false)&&<p>No active programs found. Add or activate a program first.</p>}
        </div>
        <p className="generation-conflict-note">Only sections mapped to the selected programs will be generated. Before saving, the generator reserves existing classes from other programs and checks faculty, room, section, daily-load, and consecutive-period conflicts. Existing programs are preserved; if a conflict-free timetable cannot be completed, nothing is saved.</p>
        <div className="modal-footer" style={{display:"flex",justifyContent:"flex-end",gap:8}}>
          <button type="button" className="secondary" onClick={()=>setShowGenerationDialog(false)}>Cancel</button>
          <button type="button" className="primary" disabled={loading||!selectedProgramIds.length} onClick={()=>generate(selectedProgramIds)}><WandSparkles size={16}/> Generate selected ({selectedProgramIds.length})</button>
        </div>
      </section>
    </div>}
    {mobileNavOpen&&<button type="button" className="sidebar-backdrop" aria-label="Close navigation" onClick={()=>{setMobileNavOpen(false);setActiveNavGroup(null);setActiveNavSubgroup(null);}}/>}
    <main className="erp-main">
      <header className="app-topbar">
        <div className="topbar-leading">
          <button
            type="button"
            className="mobile-nav-trigger"
            aria-label={mobileNavOpen?"Close navigation":"Open navigation"}
            aria-expanded={mobileNavOpen}
            onClick={()=>setMobileNavOpen(value=>{const next=!value;if(next)setProfileOpen(false);return next;})}
          >{mobileNavOpen?<X size={18}/>:<Menu size={18}/>}<span>Menu</span></button>
          <div className="topbar-session">
            <span className="topbar-session-icon"><CalendarDays size={19}/></span>
            <span className="topbar-session-copy">
              <small>ACADEMIC SESSION</small>
              <strong>{activeSession?.name||"No active session"}</strong>
            </span>
            <span className={activeSession?"topbar-session-status active":"topbar-session-status"} aria-label={activeSession?"Active session":"No active session"}/>
          </div>
        </div>
        <div className="topbar-actions">
          <div className="topbar-search-wrap" ref={navSearchWrapRef}>
            <div className="nav-search topbar-search" role="search">
              <Search size={17} aria-hidden="true"/>
              <input
                ref={navSearchRef}
                className="nav-search-input"
                type="search"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={Boolean(searchResultsOpen&&normalizedNavQuery)}
                aria-controls="page-search-results"
                value={navQuery}
                onFocus={()=>setSearchResultsOpen(true)}
                onChange={event=>{setNavQuery(event.target.value);setSearchResultIndex(-1);setSearchResultsOpen(true);}}
                onKeyDown={event=>{
                  if(event.key==="ArrowDown"&&pageSearchResults.length){
                    event.preventDefault();
                    setSearchResultsOpen(true);
                    setSearchResultIndex(index=>Math.min(index+1,pageSearchResults.length-1));
                  }else if(event.key==="ArrowUp"&&pageSearchResults.length){
                    event.preventDefault();
                    setSearchResultsOpen(true);
                    setSearchResultIndex(index=>Math.max(index-1,0));
                  }else if(event.key==="Enter"&&normalizedNavQuery){
                    if(pageSearchResults.length){
                      event.preventDefault();
                      const result=pageSearchResults[Math.max(0,Math.min(searchResultIndex,pageSearchResults.length-1))];
                      navigateToNavPage(result.name,result.groupLabel);
                    }
                  }
                }}
                placeholder="Search pages..."
                aria-label="Search pages"
                aria-describedby="nav-search-shortcut"
                autoComplete="off"
              />
              <kbd id="nav-search-shortcut" className="nav-search-shortcut">Ctrl K</kbd>
            </div>
            {searchResultsOpen&&normalizedNavQuery&&<div id="page-search-results" className="page-search-results" role="listbox" aria-label="Matching pages">
              {pageSearchResults.length
                ? pageSearchResults.map((result,index)=><button
                    type="button"
                    key={result.name}
                    role="option"
                    aria-selected={index===searchResultIndex}
                    data-search-result={result.name}
                    className={index===searchResultIndex?"page-search-result active":"page-search-result"}
                    onMouseEnter={()=>setSearchResultIndex(index)}
                    onMouseDown={event=>event.preventDefault()}
                    onClick={()=>navigateToNavPage(result.name,result.groupLabel)}
                  >
                    <span className="page-search-result-icon"><Search size={14}/></span>
                    <span className="page-search-result-copy"><strong>{result.name}</strong><small>{result.groupLabel}</small></span>
                    <ChevronRight size={15} className="page-search-result-arrow"/>
                  </button>)
                : <div className="page-search-empty" role="status">No pages match “{navQuery.trim()}”.</div>}
            </div>}
          </div>
          <div className="header-profile-wrap" ref={profileMenuRef}>
            <button
              type="button"
              className="header-profile-trigger"
              aria-haspopup="menu"
              aria-expanded={profileOpen}
              onClick={()=>{setProfileOpen(value=>!value);setActiveNavGroup(null);}}
            >
              <span className="header-profile-avatar">{String(auth.name||auth.username||"U").trim().charAt(0).toUpperCase()}</span>
              <span className="header-profile-trigger-copy">
                <strong>Profile</strong>
                <small>{auth.name||auth.username||"User"} · {String(auth.role||"USER").replace(/_/g," ")}</small>
              </span>
              <ChevronDown size={15} className={profileOpen?"profile-chevron open":"profile-chevron"}/>
            </button>
            {profileOpen&&<div className="header-profile-menu" role="menu" aria-label="Profile menu">
              <div className="header-profile-summary">
                <span className="header-profile-avatar large"><UserRound size={22}/></span>
                <span><strong>{auth.name||auth.username||"User"}</strong><small>{String(auth.role||"USER").replace(/_/g," ")}</small></span>
              </div>
              <div className="header-profile-details">
                <div><span>Username</span><strong>{auth.username||"—"}</strong></div>
                <div><span>Account role</span><strong>{String(auth.role||"USER").replace(/_/g," ")}</strong></div>
              </div>
              <button
                type="button"
                className="header-profile-menu-item"
                role="menuitem"
                onPointerDown={event=>event.stopPropagation()}
                onClick={event=>{
                  event.preventDefault();
                  event.stopPropagation();
                  setPasswordForm({currentPassword:"",newPassword:"",confirmPassword:""});
                  setShowPasswordModal(true);
                  setProfileOpen(false);
                }}
              >
                <KeyRound size={16}/><span>Change Password</span>
              </button>
              <button type="button" className="header-profile-menu-item logout" role="menuitem" onClick={logout}>
                <LogOut size={16}/><span>Logout</span>
              </button>
            </div>}
          </div>
        </div>
      </header>
      {tab==="Dashboard"&&<header className="page-heading"><div><h1>{tab}</h1></div></header>}
      {message && <div className={`message ${/error|network|failed|unable|cannot|start the backend|could not be loaded|not configured/i.test(message)?"error":"success"}`} role={/error|network|failed|unable|cannot|start the backend|could not be loaded|not configured/i.test(message)?"alert":"status"} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}><span style={{flex:1,minWidth:0}}>{message}{/some data could not be loaded|backend api is not configured/i.test(message) && <button className="secondary" type="button" onClick={()=>load()} style={{marginLeft:10}}>Retry</button>}</span><button type="button" className="message-dismiss" aria-label="Dismiss message" title="Dismiss message" onClick={()=>setMessage("")} style={{padding:"4px 7px",flexShrink:0}}><X size={15}/></button></div>}


      <Suspense fallback={<PageLoading label={tab} />}>
      {tab==="Attendance" && <Attendance data={data} auth={auth} setMessage={setMessage}/>}
      {tab==="Students" && <Students data={data} sessions={sessions} activeSession={activeSession} reload={reloadStudentData} setMessage={setMessage}/>}
      {tab==="Student Mapping" && <StudentMapping data={data} sessions={sessions} activeSession={activeSession} reload={reloadStudentData} setMessage={setMessage}/>}
      {tab==="Student Profile" && <StudentProfile data={data} setMessage={setMessage}/>}
      {tab==="Student Promotion" && <StudentPromotion data={data} sessions={sessions} activeSession={activeSession} reload={load} setMessage={setMessage}/>}
      {tab==="Fees" && <FeeManagement data={data} sessions={sessions} auth={auth} setMessage={setMessage}/>}
      {tab==="Full Session Timetable" && <FullSessionTimetable sessions={sessions} activeSession={activeSession} role={auth.role}/>}
      {tab==="All Program Timetables" && <AllProgramTimetables timetable={latest} data={data} activeSession={activeSession}/>} 
      {tab==="Academic Sessions" && <AcademicSessions sessions={sessions} programs={data.programs} semesters={data.semesters} activeSession={activeSession} setSessions={setSessions} setActiveSession={setActiveSession} setMessage={setMessage}/>}
      {tab==="Academic Structure" && <AcademicStructure sessions={sessions} activeSession={activeSession} programs={data.programs} data={data} reload={load} setMessage={setMessage}/>}
      {tab==="Holiday Management" && <HolidayManagement sessions={sessions} activeSession={activeSession} role={auth.role} setMessage={setMessage}/> }
      {tab==="Templates & Clone" && <TimetableTemplates sessions={sessions} activeSession={activeSession} setLatest={setLatest} setMessage={setMessage}/>}
      {tab==="Public Sharing" && <PublicSharing data={data} setMessage={setMessage}/>}
      {tab==="Dashboard" && <Dashboard cards={cards} generate={()=>{setSelectedProgramIds((data.programs||[]).filter(p=>p.active!==false).map(p=>String(p._id)));setShowGenerationDialog(true);}} loading={loading} latest={latest} role={auth.role} onNavigate={navigateFromDashboard} activeSession={activeSession}/>}
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
      {tab==="Approval & Versions" && <ApprovalVersions activeSession={activeSession} role={auth.role} onRefresh={load} setMessage={setMessage}/>}
      {tab==="Settings" && <SchedulerSettings settings={settings} setSettings={setSettings} setMessage={setMessage} activeSession={activeSession}/>} 
      {tab==="Master Data Settings" && <MasterDataSettings data={data} setData={setData} reload={load} setMessage={setMessage} sessions={sessions}/>}
      {(tab==="Subject & Faculty Mapping") && <SubjectFacultyMapping data={data} sessions={sessions} activeSession={activeSession} reload={load} setMessage={setMessage}/>}
      {tab==="Program & Section Mapping" && <AcademicStructure sessions={sessions} activeSession={activeSession} programs={data.programs} data={data} reload={load} setMessage={setMessage}/>}
      {tab==="Import Center" && <ExcelImport reload={load} setMessage={setMessage}/>}
      {["Programs","Faculty","Subjects","Sections","Rooms","Time Slots"].includes(tab) &&
        <MasterView type={tab} data={data} setData={setData} reload={load} sessions={sessions} setMessage={setMessage}/>}
      {tab==="Availability" && <AvailabilityMatrix data={data} reload={load} setMessage={setMessage}/>}
      {tab==="Excel Import" && <ExcelImport reload={load} setMessage={setMessage}/>}
      </Suspense>
    </main>
  </div>
}
