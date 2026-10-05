import React, {useEffect, useMemo, useState} from "react";
import {Routes, Route, useLocation, useNavigate, useParams} from "react-router-dom";
import axios from "axios";
import {CalendarDays, Users, BookOpen, DoorOpen, Clock3, WandSparkles, Database, Trash2, Settings2, Check, X, FileSpreadsheet, Upload, Lock, Send, RotateCcw, ShieldCheck,BarChart3,Activity,Bell,UserCheck,RefreshCw,Copy,QrCode,History,ClipboardCheck,UserPlus,DollarSign,GraduationCap,Search,ArrowRight,UsersRound} from "lucide-react";
import AppSidebar from "../components/AppSidebar";
import AppHeader from "../components/AppHeader";
import AllProgramTimetables from "../modules/AllProgramTimetables";
import {ProgramSectionMapping} from "../modules/MasterData";
import {navGroupsForRole} from "../config/navigation";

const API=(import.meta.env.VITE_API_URL||"http://localhost:5000/api").replace(/\/$/,"");
axios.defaults.timeout=20000;
axios.interceptors.request.use(config=>{
  const token=localStorage.getItem("tt_token");
  if(token) config.headers.Authorization=`Bearer ${token}`;
  return config;
});
axios.interceptors.response.use(r=>r,err=>{
  if(err.response?.status===401 && localStorage.getItem("tt_token")){
    localStorage.removeItem("tt_token");
    localStorage.removeItem("tt_user");
    window.location.reload();
  }
  return Promise.reject(err);
});
const days=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const apiName={programs:"Programs",faculty:"Faculty",subjects:"Subjects",sections:"Sections",rooms:"Rooms",timeslots:"Time Slots"};
function refId(v){return String(v?._id??v??"");}

function ERPWorkspace(){
  const [auth,setAuth]=useState(()=>{try{return JSON.parse(localStorage.getItem("tt_user")||"null")}catch{return null}});
  const location=useLocation();
  const navigate=useNavigate();
  const routeMap={
    "/dashboard":"Dashboard",
    "/academic-sessions":"Academic Sessions",
    "/full-session-timetable":"Full Session Timetable",
    "/all-program-timetables":"All Program Timetables",
    "/timetable":"Timetable",
    "/calendar":"Calendar View",
    "/my-timetable":"My Timetable",
    "/students":"Students",
    "/students/mapping":"Student Mapping",
    "/students/profile":"Student Profile",
    "/students/promotion":"Student Promotion",
    "/attendance":"Attendance",
    "/fees":"Fees",
    "/faculty-portal":"Faculty Portal",
    "/section-portal":"Section Portal",
    "/master-data":"Master Data Settings",
    "/program-section-mapping":"Program & Section Mapping",
    "/excel-import":"Excel Import",
    "/templates":"Templates & Clone",
    "/public-sharing":"Public Sharing",
    "/reports":"Reports",
    "/analytics":"Analytics",
    "/notifications":"Notifications",
    "/change-history":"Change History",
    "/validation":"Validation",
    "/optimization":"Optimization",
    "/audit-logs":"Audit Logs",
    "/users":"User Management",
    "/settings":"Settings"
  };
  const tabMap=Object.fromEntries(Object.entries(routeMap).map(([path,name])=>[name,path]));
  const tabFromPath=routeMap[location.pathname]||"Dashboard";
  const [tab,setTab]=useState(tabFromPath);
  const [sidebarCollapsed,setSidebarCollapsed]=useState(()=>localStorage.getItem("tt_sidebar_collapsed")==="1");
  const [mobileNavOpen,setMobileNavOpen]=useState(false);
  const [searchOpen,setSearchOpen]=useState(false);
  const [searchQuery,setSearchQuery]=useState("");
  useEffect(()=>{setTab(tabFromPath)},[tabFromPath]);
  useEffect(()=>{localStorage.setItem("tt_sidebar_collapsed",sidebarCollapsed?"1":"0")},[sidebarCollapsed]);
  function goTab(name){
    setTab(name);
    navigate(tabMap[name]||"/dashboard");
  }
  const navGroups=useMemo(()=>navGroupsForRole(auth?.role||"STUDENT"),[auth?.role]);
  const searchItems=useMemo(()=>navGroups.flatMap(g=>g.items.map(x=>({name:x.name,group:g.label,path:tabMap[x.name]||"/dashboard"}))).filter(x=>x.name.toLowerCase().includes(searchQuery.trim().toLowerCase())),[navGroups,searchQuery]);
  useEffect(()=>{
    const onKey=e=>{
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){e.preventDefault();setSearchOpen(true);}
      if(e.key==="Escape"){setSearchOpen(false);setMobileNavOpen(false);}
    };
    window.addEventListener("keydown",onKey);
    return()=>window.removeEventListener("keydown",onKey);
  },[]);
  const [data,setData]=useState({faculty:[],subjects:[],sections:[],rooms:[],timeslots:[],programs:[],students:[]});
  const [latest,setLatest]=useState(null);
  const [message,setMessage]=useState("");
  const [loading,setLoading]=useState(false);
  const [settings,setSettings]=useState({maxConsecutiveFaculty:2,maxConsecutiveSection:3,avoidSameSubjectSameDay:true,distributeSubjectAcrossDays:true,avoidFirstLastPeriod:false,generationRuns:8,generationTimeLimitMs:30000});
  const [timetableStatus,setTimetableStatus]=useState("DRAFT");
  const [activeSession,setActiveSession]=useState(null);
  const [sessions,setSessions]=useState([]);
  const [versionList,setVersionList]=useState([]);
  const [approvalHistory,setApprovalHistory]=useState([]);

  async function load(){
    try { const me=await axios.get(`${API}/auth/me`); const fresh=me.data?.user; if(fresh){ setAuth(fresh); localStorage.setItem("tt_user",JSON.stringify(fresh)); } } catch {}
    const keys=Object.keys(data);
    const results=await Promise.all(keys.map(k=>axios.get(`${API}/${k}`).then(r=>r.data)));
    const next={}; keys.forEach((k,i)=>next[k]=results[i]); setData(next);
    const t=await axios.get(`${API}/timetable/latest`); setLatest(t.data);
    try { const sr=await axios.get(`${API}/settings`); setSettings(sr.data); } catch {}
    try { const st=await axios.get(`${API}/timetable/status`); setTimetableStatus(st.data?.status||"DRAFT"); setApprovalHistory(st.data?.approvalHistory||[]); } catch {}
    try {
      const ss=await axios.get(`${API}/sessions`);
      setSessions(ss.data||[]);
      const as=await axios.get(`${API}/sessions/active`);
      setActiveSession(as.data||null);
      if(as.data){
        const vr=await axios.get(`${API}/timetable/versions?sessionId=${as.data._id}`);
        setVersionList(vr.data||[]);
      }
    } catch {}

  }
  useEffect(()=>{if(auth) load().catch(e=>setMessage(e.response?.data?.message||"Start the backend server first."));},[auth]);

  if(!auth) return <Login onLogin={u=>setAuth(u)} />;

  async function seed(){
    setLoading(true); setMessage("");
    try { const r=await axios.post(`${API}/seed`); setMessage(`Demo data loaded: ${Object.entries(r.data.counts).map(([k,v])=>`${k} ${v}`).join(", ")}`); await load(); }
    catch(e){setMessage(e.response?.data?.message||e.message)} finally{setLoading(false)}
  }
  async function generate(){
    setLoading(true);
    setMessage("");
    try {
      const missing=data.subjects.filter(s=>!refId(s.faculty) || !refId(s.section));
      if(missing.length){
        const names=missing.slice(0,8).map(s=>s.name).join(", ");
        goTab("Master Data Settings");
        setMessage(
          `${missing.length} subject(s) are missing Faculty or Section mapping: ${names}${missing.length>8?" ...":""}. Edit those subjects before generating.`
        );
        return;
      }

      const r=await axios.post(`${API}/timetable/generate`,{academicSessionId:activeSession?._id,generationRuns:Number(settings.generationRuns||8),generationTimeLimitMs:Number(settings.generationTimeLimitMs||30000)});
      setLatest(r.data);
      goTab("Timetable");
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

  const uiStyles = `
    .message.success{border-color:#86efac;background:#f0fdf4;color:#166534}
    .message.error{border-color:#fca5a5;background:#fef2f2;color:#991b1b}
    .view-tabs{display:flex;gap:8px;margin:18px 0 12px;flex-wrap:wrap}
    .view-tab{border:1px solid #dbe3ef;background:#fff;padding:10px 16px;border-radius:10px;cursor:pointer;font-weight:600}
    .view-tab.active{background:#2563eb;color:#fff;border-color:#2563eb}
    .view-filter{margin:0 0 18px;padding:14px;background:#f8fafc;border-radius:12px}
    .view-filter select{min-width:260px}
    .settings-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin-top:18px}
    .setting-check{display:flex;gap:12px;align-items:flex-start;border:1px solid #e2e8f0;border-radius:12px;padding:16px;background:#fff;cursor:pointer}
    .setting-check input{margin-top:3px}
    .setting-check span{display:flex;flex-direction:column;gap:5px}.setting-check small{color:#64748b}
    .settings-footer{margin-top:20px;display:flex;justify-content:flex-end}
    .form-actions{display:flex;gap:8px;align-items:end}
    .missing-cell{background:#fff1f2;color:#b91c1c;font-weight:700}
    .tt-continuation{padding:8px;color:#64748b;font-size:12px;font-style:italic}
    .validation-list{display:flex;flex-direction:column;gap:10px}.validation-item{display:flex;gap:12px;align-items:flex-start;border:1px solid #e2e8f0;border-radius:12px;padding:14px;background:#fff}.validation-item.error{border-color:#fecaca;background:#fff7f7}.validation-item.warning{border-color:#fde68a;background:#fffbeb}.validation-icon{width:30px;height:30px;border-radius:8px;display:grid;place-items:center;background:#f1f5f9}.validation-item.error .validation-icon{background:#fee2e2;color:#b91c1c}.validation-item.warning .validation-icon{background:#fef3c7;color:#92400e}.validation-item strong{font-size:13px}.validation-item p{margin:4px 0 0;color:#475569}.faculty-portal-head{display:flex;justify-content:space-between;align-items:flex-end;gap:18px;margin-bottom:18px}.faculty-portal-head h2{margin:0}.faculty-portal-head p{margin:5px 0 0;color:#64748b}.faculty-profile{display:flex;align-items:center;gap:14px;margin-bottom:18px}.faculty-avatar{width:52px;height:52px;border-radius:14px;display:grid;place-items:center;background:#e0ecff;color:#2563eb}.faculty-profile-main{display:flex;flex-direction:column;gap:3px;flex:1}.faculty-profile-main strong{font-size:19px}.faculty-profile-main span,.faculty-profile-main small{color:#64748b}.faculty-status{display:flex;flex-direction:column;align-items:flex-end;gap:5px}.faculty-status small{color:#64748b}.faculty-portal-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:18px}.portal-notifications{display:flex;flex-direction:column;gap:10px}.portal-note{display:flex;align-items:flex-start;gap:10px;padding:12px;border-radius:10px;background:#f8fafc;border:1px solid #e2e8f0;color:#334155}.portal-note.warning{background:#fffbeb;border-color:#fde68a;color:#92400e}.portal-note.error{background:#fff1f2;border-color:#fecaca;color:#991b1b}.portal-note.success{background:#f0fdf4;border-color:#bbf7d0;color:#166534}.availability-summary{display:grid;grid-template-columns:1fr;gap:12px}.availability-summary div{padding:12px;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc}.availability-summary span{display:block;color:#64748b;font-size:12px;margin-bottom:4px}.availability-summary strong{font-size:14px}.portal-day-filter{min-width:150px}.faculty-class-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.faculty-class-card{display:grid;grid-template-columns:110px 1fr;gap:14px;padding:15px;border:1px solid #e2e8f0;border-radius:12px;background:#fff}.faculty-class-time{display:flex;flex-direction:column;gap:5px}.faculty-class-time strong{font-size:13px}.faculty-class-time span{color:#64748b;font-size:12px}.faculty-class-card h4{margin:0 0 3px;font-size:15px}.faculty-class-card small{color:#64748b}.faculty-class-card p{margin:8px 0;color:#475569;font-size:12px}.class-room{display:inline-block;padding:4px 8px;border-radius:999px;background:#eef2ff;color:#3730a3;font-size:11px}.faculty-daily-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:10px}.faculty-day-card{padding:14px;border:1px solid #e2e8f0;border-radius:10px;display:flex;flex-direction:column;gap:5px}.faculty-day-card span{color:#64748b;font-size:12px}.faculty-day-card b{font-size:13px}.faculty-day-card .bar{margin-top:5px}.faculty-metrics{margin-bottom:18px}
.analytics-toolbar{display:flex;justify-content:space-between;align-items:center;margin-bottom:18px}.analytics-toolbar h2{margin:0}.analytics-toolbar p{margin:4px 0 0;color:#64748b}.analytics-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}.analytics-cards{margin-bottom:18px}.progress-wrap{display:flex;align-items:center;gap:8px;min-width:130px}.progress{height:8px;flex:1;background:#e2e8f0;border-radius:999px;overflow:hidden}.progress span{display:block;height:100%;background:#2563eb;border-radius:999px}.progress-wrap small{width:42px;text-align:right;color:#64748b}.daily-chart{display:flex;flex-direction:column;gap:14px}.daily-row{display:grid;grid-template-columns:45px 1fr 35px;align-items:center;gap:10px}.bar{height:14px;background:#eef2f7;border-radius:999px;overflow:hidden}.bar span{display:block;height:100%;background:#2563eb;border-radius:999px}@media(max-width:1000px){.analytics-grid{grid-template-columns:1fr}.analytics-toolbar{align-items:flex-start;gap:12px}}
    @media(max-width:800px){.settings-grid{grid-template-columns:1fr}.view-filter{flex-direction:column}.view-filter select{min-width:0;width:100%}}.section-portal-head{display:flex;justify-content:space-between;align-items:flex-end;gap:18px;margin-bottom:18px}.section-portal-head h2{margin:0}.section-portal-head p{margin:5px 0 0;color:#64748b}.section-selector{display:flex;justify-content:space-between;align-items:center;gap:20px;margin-bottom:18px}.section-selector p{margin:5px 0 0}.section-selector select{min-width:320px}.section-profile{display:flex;align-items:center;gap:14px;margin-bottom:18px}.section-avatar{width:52px;height:52px;border-radius:14px;display:grid;place-items:center;background:#e0ecff;color:#2563eb}.section-profile-main{display:flex;flex-direction:column;gap:3px;flex:1}.section-profile-main strong{font-size:19px}.section-profile-main span,.section-profile-main small{color:#64748b}.section-class-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.section-class-card{display:grid;grid-template-columns:110px 1fr;gap:14px;padding:15px;border:1px solid #e2e8f0;border-radius:12px;background:#fff}.section-class-time{display:flex;flex-direction:column;gap:5px}.section-class-time strong{font-size:13px}.section-class-time span{color:#64748b;font-size:12px}.section-class-card h4{margin:0 0 3px;font-size:15px}.section-class-card small{color:#64748b}.section-class-card p{margin:8px 0;color:#475569;font-size:12px}.class-duration{display:inline-block;margin-left:6px;padding:4px 8px;border-radius:999px;background:#fef3c7;color:#92400e;font-size:11px}@media(max-width:800px){.section-selector{flex-direction:column;align-items:stretch}.section-selector select{min-width:0;width:100%}.section-class-grid{grid-template-columns:1fr}}
    .notification-toolbar{display:flex;justify-content:space-between;align-items:flex-end;gap:18px;margin-bottom:18px}.notification-toolbar h2{margin:0}.notification-toolbar p{margin:5px 0 0;color:#64748b}.notification-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}.notification-card{border:1px solid #e2e8f0;border-radius:14px;padding:16px;background:#fff}.notification-card.unread{border-color:#93c5fd;box-shadow:0 0 0 2px #eff6ff}.notification-top{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.notification-top h3{margin:0;font-size:16px}.notification-message{margin:10px 0;color:#475569;white-space:pre-wrap}.notification-meta{display:flex;flex-wrap:wrap;gap:7px;align-items:center;color:#64748b;font-size:12px}.notification-pill{display:inline-flex;padding:4px 8px;border-radius:999px;background:#f1f5f9;color:#475569;font-size:11px;font-weight:700}.notification-pill.URGENT{background:#fee2e2;color:#991b1b}.notification-pill.IMPORTANT{background:#fef3c7;color:#92400e}.notification-pill.NORMAL{background:#e0f2fe;color:#075985}.notification-form{display:grid;gap:12px}.notification-form textarea{min-height:120px;resize:vertical}.notification-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:12px}.notification-unread{width:8px;height:8px;border-radius:50%;background:#2563eb;display:inline-block}.notification-table-wrap{overflow:auto}.notification-table{width:100%;border-collapse:collapse}.notification-table th,.notification-table td{padding:10px;border-bottom:1px solid #edf2f7;text-align:left;font-size:13px}.notification-empty{padding:28px;text-align:center;color:#64748b;border:1px dashed #cbd5e1;border-radius:12px}.optimization-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:18px}.optimization-list{display:flex;flex-direction:column;gap:14px}.optimization-card{border:1px solid #e2e8f0;border-radius:14px;padding:16px;background:#fff}.optimization-card-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}.optimization-card h3{margin:0;font-size:16px}.optimization-reason{color:#64748b;margin:6px 0 12px}.suggestion-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.suggestion{border:1px solid #dbe3ef;border-radius:10px;padding:12px;background:#f8fafc}.suggestion strong{display:block}.suggestion small{display:block;color:#64748b;margin:4px 0 10px}.optimization-badge{display:inline-flex;padding:4px 8px;border-radius:999px;background:#eef2ff;color:#3730a3;font-size:11px;font-weight:700}.optimization-empty{padding:35px;text-align:center;color:#64748b;border:1px dashed #cbd5e1;border-radius:12px}.optimization-note{padding:12px 14px;background:#eff6ff;border:1px solid #bfdbfe;color:#1e40af;border-radius:10px;margin-bottom:18px}@media(max-width:900px){.report-context{grid-template-columns:1fr 1fr}.notification-grid{grid-template-columns:1fr}.notification-toolbar{align-items:flex-start;flex-direction:column}}

.template-clone-panel{overflow:hidden}.template-flow{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.template-step{border:1px solid #e2e8f0;border-radius:12px;padding:15px;background:#f8fafc;display:flex;flex-direction:column;gap:10px}.template-step>span{width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#182a52;color:#fff;font-weight:700}.template-step strong{display:block}.template-step small{display:block;color:#64748b;margin-top:4px}.template-step select{width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:8px;background:#fff}.template-extra{margin-top:15px}.template-warning{margin-top:14px;padding:12px 14px;border:1px solid #fed7aa;background:#fff7ed;color:#9a3412;border-radius:10px;font-size:13px}.template-clone-panel .form-actions{margin-top:15px;justify-content:flex-end}@media(max-width:900px){.template-flow{grid-template-columns:1fr}}

.generation-quality-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin-top:16px}.generation-quality-grid div{background:#f8fafc;border:1px solid #e5e7eb;border-radius:9px;padding:11px}.generation-quality-grid span{display:block;color:#64748b;font-size:11px}.generation-quality-grid strong{display:block;margin-top:4px;font-size:16px}.generation-comparison{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:14px;font-size:12px;color:#475569}.generation-comparison strong{color:#172033}.generation-comparison span{background:#eef2ff;border-radius:999px;padding:5px 8px}@media(max-width:1000px){.template-clone-panel{overflow:hidden}.template-flow{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.template-step{border:1px solid #e2e8f0;border-radius:12px;padding:15px;background:#f8fafc;display:flex;flex-direction:column;gap:10px}.template-step>span{width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#182a52;color:#fff;font-weight:700}.template-step strong{display:block}.template-step small{display:block;color:#64748b;margin-top:4px}.template-step select{width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:8px;background:#fff}.template-extra{margin-top:15px}.template-warning{margin-top:14px;padding:12px 14px;border:1px solid #fed7aa;background:#fff7ed;color:#9a3412;border-radius:10px;font-size:13px}.template-clone-panel .form-actions{margin-top:15px;justify-content:flex-end}@media(max-width:900px){.template-flow{grid-template-columns:1fr}}

.generation-quality-grid{grid-template-columns:repeat(3,1fr)}}@media(max-width:600px){.template-clone-panel{overflow:hidden}.template-flow{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.template-step{border:1px solid #e2e8f0;border-radius:12px;padding:15px;background:#f8fafc;display:flex;flex-direction:column;gap:10px}.template-step>span{width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#182a52;color:#fff;font-weight:700}.template-step strong{display:block}.template-step small{display:block;color:#64748b;margin-top:4px}.template-step select{width:100%;padding:10px;border:1px solid #cbd5e1;border-radius:8px;background:#fff}.template-extra{margin-top:15px}.template-warning{margin-top:14px;padding:12px 14px;border:1px solid #fed7aa;background:#fff7ed;color:#9a3412;border-radius:10px;font-size:13px}.template-clone-panel .form-actions{margin-top:15px;justify-content:flex-end}@media(max-width:900px){.template-flow{grid-template-columns:1fr}}

.generation-quality-grid{grid-template-columns:repeat(2,1fr)}}
    .change-history-selectors{display:grid;grid-template-columns:1fr 42px 1fr;gap:12px;align-items:end}.change-history-selectors select{width:100%}.change-arrow{display:grid;place-items:center;height:42px;font-size:22px;color:#64748b}.change-summary-cards{margin:18px 0}.change-history-list{display:flex;flex-direction:column;gap:10px}.change-history-item{display:grid;grid-template-columns:92px 1fr;gap:14px;padding:14px;border:1px solid #e2e8f0;border-radius:12px;background:#fff}.change-type{font-size:11px;font-weight:800;letter-spacing:.04em;padding:6px 9px;border-radius:999px;background:#e2e8f0;color:#475569;text-align:center;height:max-content}.change-history-item.added .change-type{background:#dcfce7;color:#166534}.change-history-item.removed .change-type{background:#fee2e2;color:#991b1b}.change-history-item.moved .change-type{background:#dbeafe;color:#1d4ed8}.change-history-item.updated .change-type{background:#fef3c7;color:#92400e}.change-main{display:flex;flex-direction:column;gap:4px}.change-main>strong{font-size:14px}.change-main>span{font-size:12px;color:#64748b}.change-main>p{margin:4px 0 0;color:#475569;font-size:13px}.change-field{display:grid;grid-template-columns:120px 1fr 25px 1fr;gap:8px;align-items:center;margin-top:6px;padding:7px 9px;border-radius:8px;background:#f8fafc;font-size:12px}.change-field b{color:#475569}.change-field span{color:#334155}.change-field em{text-align:center;color:#64748b;font-style:normal}@media(max-width:700px){.change-history-selectors{grid-template-columns:1fr}.change-arrow{display:none}.change-history-item{grid-template-columns:1fr}.change-field{grid-template-columns:1fr}.change-field em{text-align:left}}

    .student-profile-page{display:flex;flex-direction:column;gap:18px}.profile-search-bar{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.profile-search{display:flex;align-items:center;gap:9px;flex:1;min-width:260px;border:1px solid #dbe3ef;background:#fff;border-radius:12px;padding:0 12px}.profile-search input{border:0!important;box-shadow:none!important;outline:0!important;width:100%;padding:12px 4px}.profile-student-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.profile-student-card{border:1px solid #e2e8f0;background:#fff;border-radius:16px;padding:16px;text-align:left;cursor:pointer;transition:.18s;box-shadow:0 4px 12px rgba(15,23,42,.04)}.profile-student-card:hover{transform:translateY(-2px);border-color:#93c5fd;box-shadow:0 10px 24px rgba(37,99,235,.10)}.profile-student-card.selected{border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,.10)}.profile-student-top{display:flex;gap:12px;align-items:center}.profile-avatar{width:46px;height:46px;border-radius:13px;display:grid;place-items:center;background:#e8f0ff;color:#2563eb;font-weight:800;font-size:18px}.profile-student-main{min-width:0;flex:1}.profile-student-main strong{display:block;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.profile-student-main span,.profile-student-main small{display:block;color:#64748b;margin-top:3px}.profile-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.profile-stat{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:15px}.profile-stat span{display:block;color:#64748b;font-size:12px}.profile-stat strong{display:block;font-size:23px;margin-top:5px;color:#0f172a}.profile-header{display:flex;justify-content:space-between;gap:18px;align-items:center}.profile-identity{display:flex;gap:14px;align-items:center}.profile-big-avatar{width:64px;height:64px;border-radius:18px;display:grid;place-items:center;background:#e8f0ff;color:#2563eb;font-size:24px;font-weight:800}.profile-identity h2{margin:0}.profile-identity p{margin:4px 0 0;color:#64748b}.profile-actions{display:flex;gap:8px;flex-wrap:wrap}.profile-tabs{display:flex;gap:8px;flex-wrap:wrap;margin-top:4px}.profile-tabs button{border:1px solid #dbe3ef;background:#fff;border-radius:10px;padding:9px 13px;font-weight:600;cursor:pointer}.profile-tabs button.active{background:#2563eb;color:#fff;border-color:#2563eb}.profile-two-col{display:grid;grid-template-columns:1fr 1fr;gap:18px}.profile-detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.profile-detail{padding:12px;border:1px solid #e2e8f0;border-radius:11px;background:#f8fafc}.profile-detail span{display:block;color:#64748b;font-size:11px;margin-bottom:4px}.profile-detail strong{font-size:13px;word-break:break-word}.profile-list{display:flex;flex-direction:column;gap:9px}.profile-list-row{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:12px;border:1px solid #e2e8f0;border-radius:11px;background:#fff}.profile-list-row .main{min-width:0}.profile-list-row strong,.profile-list-row small{display:block}.profile-list-row small{color:#64748b;margin-top:3px}.profile-status-present{color:#166534;background:#dcfce7}.profile-status-absent{color:#991b1b;background:#fee2e2}.profile-status-late{color:#92400e;background:#fef3c7}.profile-status-leave{color:#3730a3;background:#e0e7ff}.profile-status-unmarked{color:#475569;background:#f1f5f9}.profile-status-present,.profile-status-absent,.profile-status-late,.profile-status-leave,.profile-status-unmarked{display:inline-flex;padding:4px 8px;border-radius:999px;font-size:11px;font-weight:700}.profile-edit-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.profile-edit-grid .full{grid-column:1/-1}@media(max-width:1000px){.profile-student-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.profile-summary{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:700px){.profile-student-grid,.profile-two-col,.profile-detail-grid,.profile-edit-grid{grid-template-columns:1fr}.profile-summary{grid-template-columns:1fr}.profile-header{align-items:flex-start;flex-direction:column}}
  .erp-main{min-width:0}.erp-sidebar{width:258px;transition:width .22s ease,transform .22s ease;overflow:hidden;z-index:30}.app.sidebar-collapsed .erp-sidebar{width:82px}.sidebar-brand-row{display:flex;align-items:center;gap:6px;padding-right:10px}.erp-sidebar .brand{flex:1;min-width:0;display:flex;align-items:center;gap:10px;background:none;border:0;color:#f8fafc;padding:18px 16px;font-size:18px;font-weight:800;cursor:pointer;text-align:left}.erp-sidebar .brand svg{flex:none;color:#60a5fa}.sidebar-collapse{width:34px;height:34px;border:1px solid rgba(148,163,184,.18);border-radius:9px;background:rgba(255,255,255,.05);color:#cbd5e1;display:grid;place-items:center;cursor:pointer}.sidebar-collapse svg{transition:transform .2s}.sidebar-collapse .rotated{transform:rotate(180deg)}.mobile-close{display:none}.workspace-label{padding:4px 22px 12px;color:#64748b;font-size:10px;font-weight:800;letter-spacing:.14em}.erp-sidebar.collapsed .workspace-label,.erp-sidebar.collapsed .nav-group-title,.erp-sidebar.collapsed .side-bottom span,.erp-sidebar.collapsed .sidebar-user span,.erp-sidebar.collapsed .sidebar-user strong{display:none}.erp-sidebar.collapsed .nav{justify-content:center;padding-left:0;padding-right:0}.erp-sidebar.collapsed .nav-label{display:none}.erp-sidebar.collapsed .side-bottom{padding-left:10px;padding-right:10px}.sidebar-user{padding:9px 4px;color:#94a3b8;font-size:11px;display:flex;flex-direction:column;gap:2px;white-space:nowrap}.sidebar-user strong{color:#e2e8f0;font-size:12px;overflow:hidden;text-overflow:ellipsis}.erp-header{position:sticky;top:0;z-index:20;background:rgba(248,250,252,.94);backdrop-filter:blur(12px);padding:20px 34px 14px;border-bottom:1px solid #e5eaf2}.header-main{display:flex;justify-content:space-between;gap:24px;align-items:center}.header-title-wrap{min-width:0}.header-title-wrap h1{margin:4px 0 2px}.header-title-wrap p{margin:0;color:#64748b}.breadcrumb{display:flex;align-items:center;gap:5px;color:#64748b;font-size:12px}.breadcrumb button{border:0;background:none;padding:0;color:#64748b;cursor:pointer}.breadcrumb button:hover{color:#2563eb}.breadcrumb span{color:#0f172a;font-weight:700}.header-actions{display:flex;align-items:center;gap:10px}.global-search{position:relative}.search-trigger{height:40px;border:1px solid #dbe3ef;background:#fff;border-radius:10px;padding:0 10px;display:flex;align-items:center;gap:8px;color:#64748b;cursor:pointer}.search-trigger span{font-size:12px}.search-trigger kbd{font-size:10px;padding:3px 6px;border:1px solid #dbe3ef;border-bottom-width:2px;border-radius:5px;background:#f8fafc;color:#64748b}.search-popover{position:absolute;right:0;top:48px;width:360px;background:#fff;border:1px solid #dbe3ef;border-radius:14px;box-shadow:0 18px 50px rgba(15,23,42,.16);overflow:hidden}.search-input-wrap{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #e5e7eb}.search-input-wrap input{flex:1;border:0!important;outline:0!important;box-shadow:none!important;padding:8px 0}.search-input-wrap button{border:0;background:none;cursor:pointer;color:#64748b}.search-results{max-height:360px;overflow:auto;padding:6px}.search-results>button{width:100%;display:grid;grid-template-columns:24px 1fr auto;align-items:center;gap:8px;text-align:left;border:0;background:#fff;padding:10px;border-radius:9px;cursor:pointer}.search-results>button:hover{background:#eff6ff}.search-results button span{font-weight:700;color:#172033}.search-results button small{color:#64748b}.search-empty{padding:22px;text-align:center;color:#64748b;font-size:13px}.mobile-menu-trigger{display:none}.sidebar-backdrop{display:none}
  /* Phase 38.2.1 collapsed-sidebar overflow fix */
  .erp-sidebar .sidebar-nav{overflow-x:hidden;overflow-y:auto;min-width:0;}
  .erp-sidebar .nav-group,.erp-sidebar .nav{min-width:0;max-width:100%;box-sizing:border-box;}
  .erp-sidebar.collapsed .nav{width:100%;}
  .erp-sidebar.collapsed .side-action{width:100%;box-sizing:border-box;}
  /* Phase 38.2 navigation polish */
  .erp-sidebar{box-sizing:border-box}.erp-sidebar .nav{position:relative;overflow:visible;min-height:40px}.erp-sidebar .nav-icon{width:22px;height:22px;display:grid;place-items:center;flex:none}.nav-group-toggle{width:100%;display:flex;align-items:center;justify-content:space-between;border:0;background:transparent;color:#64748b;padding:9px 18px 7px;text-align:left;font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;cursor:pointer}.nav-group-toggle:hover{color:#cbd5e1}.nav-group-toggle svg{transition:transform .18s}.nav-group-toggle .group-chevron-closed{transform:rotate(-90deg)}.nav-group.closed .nav-group-toggle{margin-bottom:2px}.student-management-hero,.student-mapping-hero{display:flex;justify-content:space-between;gap:20px;align-items:flex-end;margin-bottom:18px}.student-kpi-grid{display:grid;grid-template-columns:repeat(4,100px);gap:8px}.student-kpi-grid div,.student-mapping-stat{background:#fff;border:1px solid #dbe3ef;border-radius:12px;padding:12px;text-align:center;box-shadow:0 4px 16px rgba(15,23,42,.04)}.student-kpi-grid strong,.student-mapping-stat strong{display:block;font-size:20px;color:#172033}.student-kpi-grid span,.student-mapping-stat span{font-size:11px;color:#64748b}.student-form-tabs{display:flex;gap:8px;margin:0 0 18px;border-bottom:1px solid #e5e7eb}.student-form-tabs button{border:0;background:transparent;padding:10px 14px;border-bottom:2px solid transparent;color:#64748b;font-weight:700;cursor:pointer}.student-form-tabs button.active{color:#2563eb;border-bottom-color:#2563eb}.student-directory-filters{display:grid;grid-template-columns:2fr repeat(4,minmax(140px,1fr));gap:10px}.student-directory-filters input,.student-directory-filters select{width:100%;min-width:0}.student-map-filters{grid-template-columns:repeat(4,minmax(0,1fr))}.student-mapping-hero h2{margin:4px 0}.student-map-target{border:1px solid #bfdbfe;background:#f8fbff}.program-section-mapping-page .master-settings-hero{margin-bottom:18px}.program-section-mapping-page .view-filter input,.program-section-mapping-page .view-filter select{min-height:40px}.student-mapping-stat{min-width:120px}@media(max-width:900px){.student-management-hero,.student-mapping-hero{display:block}.student-kpi-grid{margin-top:14px;grid-template-columns:repeat(4,1fr)}.student-directory-filters{grid-template-columns:1fr 1fr}.student-map-filters{grid-template-columns:1fr 1fr}}@media(max-width:600px){.student-kpi-grid{grid-template-columns:1fr 1fr}.student-directory-filters,.student-map-filters{grid-template-columns:1fr}.student-form-tabs{overflow:auto}.student-form-tabs button{white-space:nowrap}}.erp-sidebar .nav-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.erp-sidebar .nav.active{box-shadow:inset 3px 0 0 #60a5fa}.erp-sidebar.collapsed .nav-label,.erp-sidebar.collapsed .workspace-label,.erp-sidebar.collapsed .nav-group-title,.erp-sidebar.collapsed .sidebar-user span,.erp-sidebar.collapsed .sidebar-user strong{display:none}.erp-sidebar.collapsed .nav{justify-content:center;padding-left:0;padding-right:0}.erp-sidebar.collapsed .side-bottom{padding-left:10px;padding-right:10px}.erp-sidebar.collapsed .side-action{justify-content:center;position:relative}.erp-sidebar.collapsed .side-action>svg{flex:none}.erp-sidebar.collapsed .brand span{display:none}.erp-sidebar.collapsed .brand{justify-content:center;padding-left:8px;padding-right:8px}.erp-sidebar.collapsed .sidebar-brand-row{padding-left:6px}.erp-sidebar.collapsed .sidebar-collapse{margin-left:auto}.erp-sidebar.collapsed .sidebar-user{justify-content:center;padding-left:0;padding-right:0}.erp-sidebar.collapsed .sidebar-user:before{content:"";display:block;width:8px;height:8px;border-radius:50%;background:#22c55e;box-shadow:0 0 0 4px rgba(34,197,94,.12)}

@media(max-width:1000px){.erp-header{padding:16px 20px}.header-main{align-items:flex-start}.header-actions{align-items:flex-start}.search-trigger span,.search-trigger kbd{display:none}.search-trigger{width:40px;justify-content:center}.erp-sidebar{width:258px!important;position:fixed;left:0;top:0;bottom:0;transform:translateX(-105%);box-shadow:16px 0 45px rgba(15,23,42,.22)}.erp-sidebar.mobile-open{transform:translateX(0)}.sidebar-collapse{display:none}.mobile-close{display:grid;width:34px;height:34px;border:1px solid rgba(148,163,184,.18);border-radius:9px;background:rgba(255,255,255,.05);color:#cbd5e1;place-items:center;cursor:pointer}.mobile-menu-trigger{display:grid;position:fixed;left:14px;top:14px;z-index:45;width:40px;height:40px;border:1px solid #dbe3ef;background:#fff;border-radius:10px;place-items:center;color:#172033;box-shadow:0 5px 20px rgba(15,23,42,.08)}.sidebar-backdrop{display:block;position:fixed;inset:0;z-index:25;background:rgba(15,23,42,.42);border:0}.erp-header{padding-left:70px}.search-popover{right:-8px;width:min(360px,calc(100vw - 32px))}}
@media(max-width:650px){.header-main{display:block}.header-actions{margin-top:12px;justify-content:flex-end}.header-title-wrap h1{font-size:23px}.header-title-wrap p{font-size:12px}.status{font-size:11px}.erp-header{padding-bottom:12px}.message{margin-left:14px;margin-right:14px}.search-popover{right:-4px}.breadcrumb{font-size:11px}}
  `;

  return <><style>{uiStyles}</style><div className={`app ${sidebarCollapsed?"sidebar-collapsed":""}`}>
    <AppSidebar
      auth={auth}
      groups={navGroups}
      tab={tab}
      goTab={goTab}
      seed={seed}
      generate={generate}
      loading={loading}
      collapsed={sidebarCollapsed}
      setCollapsed={setSidebarCollapsed}
      mobileOpen={mobileNavOpen}
      setMobileOpen={setMobileNavOpen}
    />
    <main className="erp-main">
      <AppHeader
        tab={tab}
        location={location}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        searchOpen={searchOpen}
        setSearchOpen={setSearchOpen}
        searchResults={searchItems}
        onNavigate={(path)=>navigate(path)}
      />
      {message && <div className={`message ${/error|network|failed|unable|cannot|start the backend/i.test(message)?"error":"success"}`}>{message}</div>}


      {tab==="Attendance" && <Attendance data={data} auth={auth} setMessage={setMessage}/>}
      {tab==="Students" && <Students data={data} reload={load} setMessage={setMessage}/>}
      {tab==="Student Mapping" && <StudentMapping data={data} reload={load} setMessage={setMessage}/>}
      {tab==="Student Profile" && <StudentProfile data={data} setMessage={setMessage}/>}
      {tab==="Student Promotion" && <StudentPromotion data={data} sessions={sessions} activeSession={activeSession} reload={load} setMessage={setMessage}/>}
      {tab==="Fees" && <FeeManagement data={data} sessions={sessions} auth={auth} setMessage={setMessage}/>}
      {tab==="Full Session Timetable" && <FullSessionTimetable sessions={sessions} activeSession={activeSession} role={auth.role}/>}
      {tab==="All Program Timetables" && <AllProgramTimetables timetable={latest} data={data}/>}
      {tab==="Academic Sessions" && <AcademicSessions sessions={sessions} programs={data.programs} activeSession={activeSession} setSessions={setSessions} setActiveSession={setActiveSession} setMessage={setMessage}/>}
      {tab==="Templates & Clone" && <TimetableTemplates sessions={sessions} activeSession={activeSession} setLatest={setLatest} setMessage={setMessage}/>}
      {tab==="Public Sharing" && <PublicSharing data={data} setMessage={setMessage}/>}
      {tab==="Dashboard" && <Dashboard cards={cards} generate={generate} seed={seed} loading={loading} latest={latest} role={auth.role}/>}
      {tab==="My Timetable" && <PersonalTimetable auth={auth} data={data}/> }
      {tab==="Calendar View" && <CalendarView timetable={latest} data={data} role={auth.role} onMoved={load} setMessage={setMessage}/>}
      {tab==="Faculty Portal" && <FacultyPortal/>}
      {tab==="Section Portal" && <SectionPortal/>}
      {tab==="Notifications" && <Notifications auth={auth} data={data} setMessage={setMessage}/>}
      {tab==="Change History" && <ChangeHistory activeSession={activeSession} versionList={versionList}/>}
      {tab==="User Management" && <UserManagement data={data} setMessage={setMessage}/>}
      {tab==="Analytics" && <Analytics/>}
      {tab==="Reports" && <Reports/>}
      {tab==="Audit Logs" && <AuditLogs/>}
      {tab==="Optimization" && <Optimization/>}
      {tab==="Validation" && <Validation/>}
      {tab==="Timetable" && <TimetableView timetable={latest} data={data} onMoved={load} timetableStatus={timetableStatus} setTimetableStatus={setTimetableStatus} setMessage={setMessage} approvalHistory={approvalHistory}/>}
      {tab==="Timetable" && <TimetableVersions activeSession={activeSession} versionList={versionList} setVersionList={setVersionList} setLatest={setLatest} setMessage={setMessage}/>}
      {tab==="Settings" && <SchedulerSettings settings={settings} setSettings={setSettings} setMessage={setMessage}/>} 
      {tab==="Master Data Settings" && <MasterDataSettings data={data} setData={setData} reload={load} setMessage={setMessage}/>}
      {tab==="Program & Section Mapping" && <ProgramSectionMapping data={data} reload={load} setMessage={setMessage}/>}
      {["Programs","Faculty","Subjects","Sections","Rooms","Time Slots"].includes(tab) &&
        <MasterView type={tab} data={data} setData={setData} reload={load}/>}
      {tab==="Availability" && <AvailabilityMatrix data={data} reload={load} setMessage={setMessage}/>}
      {tab==="Excel Import" && <ExcelImport reload={load} setMessage={setMessage}/>}
    </main>
  </div></>
}


function PublicSharing({data,setMessage}){
  const [links,setLinks]=useState([]),[timelines,setTimelines]=useState([]),[scope,setScope]=useState("FULL"),[timetableId,setTimetableId]=useState(""),[section,setSection]=useState(""),[faculty,setFaculty]=useState(""),[expiresIn,setExpiresIn]=useState("7d"),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
  async function load(){
    setLoading(true);
    try{
      const [l,t]=await Promise.all([axios.get(`${API}/share-links`),axios.get(`${API}/shareable-timetables`)]);
      setLinks(l.data||[]);setTimelines(t.data||[]);
      if(!timetableId&&t.data?.[0])setTimetableId(t.data[0]._id);
    }catch(e){setMessage(e.response?.data?.message||e.message)}finally{setLoading(false)}
  }
  useEffect(()=>{load()},[]);
  async function create(){
    if(!timetableId)return setMessage("Select a published timetable first.");
    if(scope==="SECTION"&&!section)return setMessage("Select a section.");
    if(scope==="FACULTY"&&!faculty)return setMessage("Select a faculty member.");
    setBusy(true);
    try{
      await axios.post(`${API}/share-links`,{timetableId,scope,sectionId:scope==="SECTION"?section:null,facultyId:scope==="FACULTY"?faculty:null,expiresIn});
      setMessage("Public share link created successfully.");await load();
    }catch(e){setMessage(e.response?.data?.message||e.message)}finally{setBusy(false)}
  }
  async function toggle(id){try{await axios.patch(`${API}/share-links/${id}/toggle`);await load()}catch(e){setMessage(e.response?.data?.message||e.message)}}
  async function remove(id){if(!confirm("Delete this public share link?"))return;try{await axios.delete(`${API}/share-links/${id}`);await load()}catch(e){setMessage(e.response?.data?.message||e.message)}}
  function publicUrl(token){return `${window.location.origin}/share/${token}`}
  async function copy(token){try{await navigator.clipboard.writeText(publicUrl(token));setMessage("Public link copied to clipboard.")}catch{setMessage(publicUrl(token))}}
  const labelFor=l=>l.scope==="SECTION"?`${l.section?.program||""} · ${l.section?.semester||""} · ${l.section?.name||"Section"}`:l.scope==="FACULTY"?l.faculty?.name||"Faculty":"Complete timetable";
  return <div>
    <div className="analytics-toolbar"><div><h2>Public Timetable Sharing</h2><p>Create secure read-only links without exposing the administration portal.</p></div><button className="secondary" onClick={load}><RefreshCw size={15}/> Refresh</button></div>
    <section className="panel share-create-panel">
      <div className="panel-head"><div><h3>Create Share Link</h3><p>Only published or locked timetable versions can be shared.</p></div></div>
      <div className="share-form-grid">
        <label>Timetable<select value={timetableId} onChange={e=>setTimetableId(e.target.value)}><option value="">Select published timetable</option>{timelines.map(t=><option key={t._id} value={t._id}>{t.academicSession?.name||"Session"} · {t.versionLabel||`Version ${t.version}`} · {t.status}</option>)}</select></label>
        <label>Audience<select value={scope} onChange={e=>setScope(e.target.value)}><option value="FULL">Complete timetable</option><option value="SECTION">Specific section</option><option value="FACULTY">Specific faculty</option></select></label>
        {scope==="SECTION"&&<label>Section<select value={section} onChange={e=>setSection(e.target.value)}><option value="">Select section</option>{data.sections.map(x=><option key={x._id} value={x._id}>{x.program} · {x.semester} · {x.name}</option>)}</select></label>}
        {scope==="FACULTY"&&<label>Faculty<select value={faculty} onChange={e=>setFaculty(e.target.value)}><option value="">Select faculty</option>{data.faculty.map(x=><option key={x._id} value={x._id}>{x.name}{x.code?` · ${x.code}`:""}</option>)}</select></label>}
        <label>Expires<select value={expiresIn} onChange={e=>setExpiresIn(e.target.value)}><option value="1h">1 hour</option><option value="1d">1 day</option><option value="7d">7 days</option><option value="30d">30 days</option><option value="never">Never</option></select></label>
      </div>
      <div className="share-actions"><button className="primary" onClick={create} disabled={busy||loading}>{busy?"Creating...":"Create Secure Link"}</button></div>
    </section>
    <section className="panel"><div className="panel-head"><div><h3>Existing Share Links</h3><p>Disable or delete links at any time.</p></div></div>
      {!links.length?<div className="empty-state"><h3>No share links</h3><p>Create a link above after publishing a timetable.</p></div>:<div className="share-link-list">{links.map(l=>{
        const expired=l.expiresAt&&new Date(l.expiresAt)<new Date();
        return <div className="share-link-row" key={l._id}><div className="share-link-main"><div><strong>{labelFor(l)}</strong><span>{l.scope} · {l.timetable?.versionLabel||`Version ${l.timetable?.version||""}`} · {l.timetable?.status||""}</span></div><code>{publicUrl(l.token)}</code><small>{expired ? "Expired" : l.expiresAt ? `Expires ${new Date(l.expiresAt).toLocaleString()}` : "No expiry"} · {l.accessCount||0} access{(l.accessCount||0)===1?"":"es"}</small></div><div className="share-link-actions"><button className="secondary" onClick={()=>copy(l.token)}><Copy size={14}/> Copy</button><button className="secondary" onClick={()=>window.open(`${API}/public/share/${l.token}/qr`,"_blank","noopener,noreferrer")} disabled={expired||!l.active}><QrCode size={14}/> QR</button><button className={l.active&&!expired?"secondary":"primary"} onClick={()=>toggle(l._id)} disabled={expired}>{l.active?"Disable":"Enable"}</button><button className="secondary" onClick={()=>remove(l._id)}><Trash2 size={14}/> Delete</button></div></div>
      })}</div>}
    </section>
  </div>;
}

function PublicShareView({token}){
  const [data,setData]=useState(null),[error,setError]=useState(""),[loading,setLoading]=useState(true),[day,setDay]=useState("ALL");
  useEffect(()=>{axios.get(`${API}/public/share/${token}`).then(r=>setData(r.data)).catch(e=>setError(e.response?.data?.message||"This public timetable link is unavailable.")).finally(()=>setLoading(false))},[token]);
  if(loading)return <div className="public-share-page"><div className="public-share-card"><CalendarDays size={40}/><h1>Timetable</h1><p>Loading shared timetable...</p></div></div>;
  if(error)return <div className="public-share-page"><div className="public-share-card"><X size={40}/><h1>Share link unavailable</h1><p>{error}</p></div></div>;
  const days2=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
  const rows=(data?.entries||[]).filter(e=>day==="ALL"||e.day===day).sort((a,b)=>days2.indexOf(a.day)-days2.indexOf(b.day)||Number(a.order||0)-Number(b.order||0));
  return <div className="public-share-page"><div className="public-share-shell"><div className="public-share-header"><div><div className="public-brand"><CalendarDays size={25}/> Time Table</div><h1>{data.title}</h1><p>{data.session?.name||"Academic timetable"} · {data.timetable?.versionLabel||`Version ${data.timetable?.version||""}`} · {data.timetable?.status}</p></div><div className="public-share-actions"><button className="secondary" onClick={()=>window.print()}>Print</button><button className="secondary" onClick={()=>window.open(`${API}/public/share/${token}/qr`,"_blank","noopener,noreferrer")}><QrCode size={15}/> QR Code</button></div></div><div className="public-share-toolbar"><div><strong>Read-only timetable</strong><small>Administration controls are not available from this link.</small></div><select value={day} onChange={e=>setDay(e.target.value)}><option value="ALL">All Days</option>{days2.map(d=><option key={d}>{d}</option>)}</select></div><div className="public-qr-panel"><div><strong>Mobile access</strong><p>Scan this QR code to open this read-only timetable on a phone.</p></div><img src={`${API}/public/share/${token}/qr`} alt="QR code for public timetable" /></div>{rows.length?<div className="public-class-grid">{rows.map((e,i)=><div className="public-class-card" key={e._id||i}><div className="public-time"><strong>{e.day}</strong><span>{e.startTime} – {e.endTime}</span></div><div><h3>{e.subject?.name||"Subject"}</h3>{e.subject?.code&&<small>{e.subject.code}</small>}<p>Faculty: {e.faculty?.name||"—"}</p><p>Section: {e.section?.name||"—"}</p><span className="public-room">Room: {e.room?.name||"—"}</span></div></div>)}</div>:<div className="public-empty">No classes are scheduled for this day.</div>}<div className="public-footer">Shared read-only timetable · {data.expiresAt?`Link expires ${new Date(data.expiresAt).toLocaleString()}`:"No expiry"}</div></div></div>;
}

function PublicShareRoute(){
  const {token}=useParams();
  return <PublicShareView token={token}/>;
}

function CalendarView({timetable,data,role,onMoved,setMessage}){
  const [view,setView]=useState("week");
  const [day,setDay]=useState("Monday");
  const [filter,setFilter]=useState("all");
  const [selected,setSelected]=useState("");
  const [dragged,setDragged]=useState(null);
  const [moving,setMoving]=useState(false);
  const [details,setDetails]=useState(null);

  const allTimeSlots=(data.timeslots||[])
    .filter(x=>!x.isBreak)
    .sort((a,b)=>{
      const orderDiff=Number(a.order||0)-Number(b.order||0);
      if(orderDiff!==0) return orderDiff;
      return String(a.startTime||"").localeCompare(String(b.startTime||""));
    });

  // TimeSlots are stored per day. Calendar renders days as columns, so
  // each unique order/start/end combination must appear only once as a row.
  const slots=[...new Map(
    allTimeSlots.map(slot=>[
      `${Number(slot.order||0)}|${slot.startTime||""}|${slot.endTime||""}`,
      slot
    ])
  ).values()];
  const canEdit=["ADMIN","SCHEDULER"].includes(role) && String(timetable?.status||"DRAFT")==="DRAFT";
  const filterOptions=filter==="section"?data.sections:filter==="faculty"?data.faculty:filter==="room"?data.rooms:[];
  const visibleDays=view==="day"?[day]:days;
  const entries=(timetable?.entries||[]).filter(e=>{
    if(filter==="all") return true;
    const id=refId(e[filter]);
    return id===selected;
  });
  function occupies(e,slot){
    return e.day===slot.day && Number(slot.order||0)>=Number(e.order||0) && Number(slot.order||0)<Number(e.order||0)+Math.max(1,Number(e.duration||1));
  }
  function entryAt(dayName,slot){return entries.find(e=>occupies(e,{...slot,day:dayName}));}
  function hashColor(value){
    const str=String(value||"Subject"); let h=0; for(let i=0;i<str.length;i++) h=(h*31+str.charCodeAt(i))%360;
    return `hsl(${h} 72% 94%)`;
  }
  async function moveEntry(e,targetDay,targetSlot){
    if(!canEdit||!e||moving) return;
    setMoving(true);
    try{
      const r=await axios.patch(`${API}/timetable/move`,{entryId:e._id,day:targetDay,startTime:targetSlot.startTime});
      setMessage?.(r.data?.message||"Class moved successfully.");
      await onMoved?.();
    }catch(err){setMessage?.(err.response?.data?.message||err.message||"Unable to move class.");}
    finally{setMoving(false);setDragged(null)}
  }
  return <div className="panel calendar-panel">
    <div className="toolbar"><div><h3>Interactive Calendar</h3><p>Visual weekly/day timetable. Click a class for details{canEdit?" or drag it to another period.":"."}</p></div><div className="calendar-status"><span className={`status-badge ${String(timetable?.status||"DRAFT").toLowerCase()}`}>{timetable?.status||"DRAFT"}</span></div></div>
    <div className="calendar-toolbar">
      <div className="calendar-segment"><button className={view==="week"?"active":""} onClick={()=>setView("week")}>Week</button><button className={view==="day"?"active":""} onClick={()=>setView("day")}>Day</button></div>
      {view==="day"&&<select value={day} onChange={e=>setDay(e.target.value)}>{days.map(d=><option key={d}>{d}</option>)}</select>}
      <select value={filter} onChange={e=>{setFilter(e.target.value);setSelected("")}}><option value="all">All classes</option><option value="section">Section</option><option value="faculty">Faculty</option><option value="room">Room</option></select>
      {filter!=="all"&&<select value={selected} onChange={e=>setSelected(e.target.value)}><option value="">All {filter}s</option>{filterOptions.map(x=><option key={refId(x)} value={refId(x)}>{x.name}{filter==="section"?` · ${x.program||""} ${x.semester||""}`:""}</option>)}</select>}
    </div>
    {!slots.length?<div className="empty-state"><h3>No time slots</h3><p>Configure Time Slots before using Calendar View.</p></div>:<div className="calendar-scroll"><div className="calendar-grid" style={{gridTemplateColumns:`110px repeat(${visibleDays.length}, minmax(190px,1fr))`}}>
      <div className="calendar-corner">Time</div>{visibleDays.map(d=><div className="calendar-day-head" key={d}>{d}<span>{entries.filter(e=>e.day===d).length} classes</span></div>)}
      {slots.map(slot=><React.Fragment key={slot._id||slot.order}>
        <div className="calendar-time"><strong>{slot.startTime}</strong><span>{slot.endTime}</span></div>
        {visibleDays.map(d=>{
          const e=entryAt(d,slot); const start=e&&Number(e.order||0)===Number(slot.order||0);
          return <div className="calendar-cell" key={`${d}-${slot.order}`} onDragOver={ev=>{if(canEdit){ev.preventDefault();ev.dataTransfer.dropEffect="move"}}} onDrop={ev=>{ev.preventDefault();if(dragged)moveEntry(dragged,d,slot)}}>
            {e&&start?<button className="calendar-entry" style={{background:hashColor(e.subject?.name)}} draggable={canEdit&&!moving} onDragStart={ev=>{setDragged(e);ev.dataTransfer.effectAllowed="move"}} onDragEnd={()=>setDragged(null)} onClick={()=>setDetails(e)}><strong>{e.subject?.name||"Subject"}</strong><span>{e.subject?.code||""}</span><small>{e.faculty?.name||"Faculty"}</small><small>{e.section?.name||"Section"} · {e.room?.name||"Room"}</small>{Number(e.duration||1)>1&&<b>{e.duration} periods</b>}</button>:e?<div className="calendar-continuation">↳ continued</div>:<span className="calendar-empty">Free</span>}
          </div>;
        })}
      </React.Fragment>)}
    </div></div>}
    {moving&&<div className="move-message loading">Checking constraints and moving class...</div>}
    {details&&<div className="calendar-detail-overlay" onClick={()=>setDetails(null)}><div className="calendar-detail" onClick={e=>e.stopPropagation()}><div className="panel-head"><div><h3>{details.subject?.name||"Subject"}</h3><p>{details.day} · {details.startTime}–{details.endTime}</p></div><button className="secondary" onClick={()=>setDetails(null)}>Close</button></div><div className="detail-grid"><div><span>Faculty</span><strong>{details.faculty?.name||"—"}</strong></div><div><span>Section</span><strong>{details.section?.name||"—"}</strong></div><div><span>Room</span><strong>{details.room?.name||"—"}</strong></div><div><span>Duration</span><strong>{details.duration||1} period(s)</strong></div></div></div></div>}
  </div>;
}

function Login({onLogin}){
  const [form,setForm]=useState({username:"admin",password:"admin123"});
  const [error,setError]=useState(""); const [busy,setBusy]=useState(false);
  async function submit(e){e.preventDefault();setBusy(true);setError("");try{const r=await axios.post(`${API}/auth/login`,form);localStorage.setItem("tt_token",r.data.token);localStorage.setItem("tt_user",JSON.stringify(r.data.user));onLogin(r.data.user)}catch(e){setError(e.response?.data?.message||"Unable to login.")}finally{setBusy(false)}}
  return <div className="login-page"><form className="login-card" onSubmit={submit}><div className="login-brand"><div className="login-brand-icon"><CalendarDays size={28}/></div><h1>Time Table</h1><p>Secure academic timetable management</p></div><div className="login-form"><label>Username<input value={form.username} onChange={e=>setForm({...form,username:e.target.value})} autoFocus /></label><label>Password<input type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} /></label>{error&&<div className="message error">{error}</div>}<button className="primary login-submit" disabled={busy}>{busy?"Signing in...":"Sign In"}</button><p className="login-help">Default administrator: <strong>admin / admin123</strong>. Change the password after first login.</p></div></form></div>;
}

function FacultyPortal(){
  const [report,setReport]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(""),[day,setDay]=useState("ALL");
  async function load(){setLoading(true);setError("");try{setReport((await axios.get(`${API}/faculty-portal`)).data)}catch(e){setError(e.response?.data?.message||e.message)}finally{setLoading(false)}}
  useEffect(()=>{load()},[]);
  if(loading)return <div className="panel"><h2>Faculty Portal</h2><p>Loading your timetable and workload...</p></div>;
  if(error)return <div className="panel"><h2>Faculty Portal</h2><div className="message error">{error}</div><button className="primary" onClick={load}>Retry</button></div>;
  const rows=(report?.timetableRows||[]).filter(x=>day==="ALL"||x.day===day);
  const daysWithClasses=(report?.daily||[]).filter(x=>x.classes>0).length;
  const status=report?.timetable?.status||"DRAFT";
  return <div>
    <div className="faculty-portal-head"><div><h2>Faculty Portal</h2><p>Your assigned classes, workload, availability and timetable notifications.</p></div><button className="secondary" onClick={load}><RefreshCw size={15}/> Refresh</button></div>
    <section className="faculty-profile panel"><div className="faculty-avatar"><UserCheck size={26}/></div><div className="faculty-profile-main"><strong>{report.faculty.name}</strong><span>{report.faculty.code||"Faculty"}</span><small>{report.session?.name||"No active academic session"}</small></div><div className="faculty-status"><span className={`status-badge ${status.toLowerCase()}`}>{status}</span><small>{report.timetable?.versionLabel||"Current timetable"}</small></div></section>
    <div className="cards faculty-metrics"><Metric label="Assigned Classes" value={report.summary.scheduledClasses}/><Metric label="Weekly Periods" value={report.summary.weeklyPeriods}/><Metric label="Working Days" value={`${daysWithClasses}/${report.faculty.maxWorkingDays||"—"}`}/><Metric label="Weekly Utilization" value={`${report.summary.utilization}%`}/></div>
    <div className="faculty-portal-grid"><section className="panel"><div className="panel-head"><div><h3><Bell size={17}/> Notifications</h3><p>Items relevant to your faculty assignment.</p></div></div>{(report.notifications||[]).length?<div className="portal-notifications">{report.notifications.map((n,i)=><div className={`portal-note ${n.type||"info"}`} key={i}><Bell size={15}/><span>{n.message}</span></div>)}</div>:<div className="empty-state"><h3>No notifications</h3><p>There are no faculty-specific notifications right now.</p></div>}</section><section className="panel"><div className="panel-head"><div><h3>Availability</h3><p>Your configured working availability.</p></div></div><div className="availability-summary"><div><span>Available days</span><strong>{(report.availability.availableDays||[]).join(", ")||"Not configured"}</strong></div><div><span>Unavailable slots</span><strong>{(report.availability.unavailableSlots||[]).length}</strong></div><div><span>Max classes/day</span><strong>{report.faculty.maxClassesPerDay||"—"}</strong></div></div></section></div>
    <section className="panel"><div className="panel-head"><div><h3>My Weekly Timetable</h3><p>Only classes assigned to {report.faculty.name} are shown.</p></div><select className="portal-day-filter" value={day} onChange={e=>setDay(e.target.value)}><option value="ALL">All Days</option>{days.map(d=><option key={d}>{d}</option>)}</select></div>{rows.length?<div className="faculty-class-grid">{rows.map(r=><div className="faculty-class-card" key={r.id}><div className="faculty-class-time"><strong>{r.day}</strong><span>{r.startTime} – {r.endTime}</span></div><div><h4>{r.subject}</h4>{r.subjectCode&&<small>{r.subjectCode}</small>}<p>{r.program} {r.semester} · {r.section}</p><span className="class-room">Room: {r.room}</span></div></div>)}</div>:<div className="empty-state"><h3>No assigned classes</h3><p>No classes are scheduled for the selected day.</p></div>}</section>
    <section className="panel"><div className="panel-head"><div><h3>Daily Workload</h3><p>Scheduled periods and configured daily limit.</p></div></div><div className="faculty-daily-grid">{(report.daily||[]).map(d=><div className="faculty-day-card" key={d.day}><strong>{d.day}</strong><span>{d.classes} class{d.classes===1?"":"es"}</span><b>{d.periods} period{d.periods===1?"":"s"}</b>{d.max>0&&<div className="bar"><span style={{width:`${Math.min(100,(d.classes/d.max)*100)}%`}}></span></div>}</div>)}</div></section>
    {(report.conflicts||[]).length>0&&<section className="panel"><div className="panel-head"><div><h3>My Conflict Report</h3><p>Conflicts detected within your assigned timetable.</p></div></div><div className="validation-list">{report.conflicts.map((c,i)=><div className="validation-item error" key={i}><div className="validation-icon"><X size={16}/></div><div><strong>{c.type}</strong><p>{c.message}</p></div></div>)}</div></section>}
  </div>;
}


function SectionPortal(){
  const [sections,setSections]=useState([]),[selected,setSelected]=useState(""),[report,setReport]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(""),[day,setDay]=useState("ALL");
  async function loadSections(){
    const r=await axios.get(`${API}/section-portal/sections`); const list=r.data||[]; setSections(list); if(!selected && list[0]) setSelected(String(list[0].id)); return list;
  }
  async function load(sectionId=selected){
    if(!sectionId)return; setLoading(true);setError("");
    try{setReport((await axios.get(`${API}/section-portal?sectionId=${sectionId}`)).data)}catch(e){setError(e.response?.data?.message||e.message)}finally{setLoading(false)}
  }
  useEffect(()=>{loadSections().then(list=>{if(list[0]) load(String(list[0].id))}).catch(e=>{setError(e.response?.data?.message||e.message);setLoading(false)})},[]);
  if(loading && !report)return <div className="panel"><h2>Section Portal</h2><p>Loading section timetable...</p></div>;
  if(error && !report)return <div className="panel"><h2>Section Portal</h2><div className="message error">{error}</div><button className="primary" onClick={()=>load()}>Retry</button></div>;
  const rows=(report?.timetableRows||[]).filter(x=>day==="ALL"||x.day===day);
  const status=report?.timetable?.status||"DRAFT";
  return <div>
    <div className="section-portal-head"><div><h2>Student / Section Timetable</h2><p>View the complete weekly schedule for a selected section.</p></div><button className="secondary" onClick={()=>load()}><RefreshCw size={15}/> Refresh</button></div>
    <section className="panel section-selector"><div><strong>Select Section</strong><p className="muted">Only timetable viewing is available here. Faculty and scheduling administration remains protected by role.</p></div><select value={selected} onChange={e=>{setSelected(e.target.value);setDay("ALL");load(e.target.value)}}>{sections.map(x=><option key={x.id} value={x.id}>{x.program} · {x.semester} · {x.name}</option>)}</select></section>
    {report && <>
      <section className="section-profile panel"><div className="section-avatar"><Users size={26}/></div><div className="section-profile-main"><strong>{report.section.name}</strong><span>{report.section.program} · Semester {report.section.semester}</span><small>{report.session?.name||"No active academic session"}</small></div><div className="faculty-status"><span className={`status-badge ${status.toLowerCase()}`}>{status}</span><small>{report.timetable?.versionLabel||"Current timetable"}</small></div></section>
      <div className="cards section-metrics"><Metric label="Scheduled Classes" value={report.summary.scheduledClasses}/><Metric label="Weekly Periods" value={report.summary.weeklyPeriods}/><Metric label="Working Days" value={report.summary.workingDays}/><Metric label="Daily Limit" value={report.section.maxClassesPerDay||"—"}/></div>
      <div className="section-portal-grid"><section className="panel"><div className="panel-head"><div><h3><Bell size={17}/> Notifications</h3><p>Timetable information for this section.</p></div></div>{(report.notifications||[]).length?<div className="portal-notifications">{report.notifications.map((n,i)=><div className={`portal-note ${n.type||"info"}`} key={i}><Bell size={15}/><span>{n.message}</span></div>)}</div>:<div className="empty-state"><h3>No notifications</h3><p>No section-specific notifications right now.</p></div>}</section><section className="panel"><div className="panel-head"><div><h3>Section Summary</h3><p>Current timetable status and workload.</p></div></div><div className="availability-summary"><div><span>Program</span><strong>{report.section.program}</strong></div><div><span>Semester</span><strong>{report.section.semester}</strong></div><div><span>Working days</span><strong>{report.summary.workingDays}</strong></div></div></section></div>
      <section className="panel"><div className="panel-head"><div><h3>Weekly Timetable</h3><p>Complete schedule including subject, faculty and room.</p></div><select className="portal-day-filter" value={day} onChange={e=>setDay(e.target.value)}><option value="ALL">All Days</option>{days.map(d=><option key={d}>{d}</option>)}</select></div>{rows.length?<div className="section-class-grid">{rows.map(r=><div className="section-class-card" key={r.id}><div className="section-class-time"><strong>{r.day}</strong><span>{r.startTime} – {r.endTime}</span></div><div><h4>{r.subject}</h4>{r.subjectCode&&<small>{r.subjectCode}</small>}<p>Faculty: {r.faculty}</p><span className="class-room">Room: {r.room}</span>{r.duration>1&&<span className="class-duration">{r.duration} periods</span>}</div></div>)}</div>:<div className="empty-state"><h3>No classes</h3><p>No classes are scheduled for the selected day.</p></div>}</section>
      <section className="panel"><div className="panel-head"><div><h3>Daily Workload</h3><p>Classes scheduled for the selected section.</p></div></div><div className="faculty-daily-grid">{(report.daily||[]).map(d=><div className="faculty-day-card" key={d.day}><strong>{d.day}</strong><span>{d.classes} class{d.classes===1?"":"es"}</span><b>{d.periods} period{d.periods===1?"":"s"}</b>{d.max>0&&<div className="bar"><span style={{width:`${Math.min(100,(d.classes/d.max)*100)}%`}}></span></div>}</div>)}</div></section>
      {(report.conflicts||[]).length>0&&<section className="panel"><div className="panel-head"><div><h3>Section Conflict Report</h3><p>Potential overlapping classes detected for this section.</p></div></div><div className="validation-list">{report.conflicts.map((c,i)=><div className="validation-item error" key={i}><div className="validation-icon"><X size={16}/></div><div><strong>{c.type}</strong><p>{c.message}</p></div></div>)}</div></section>}
    </>}
  </div>;
}

function PersonalTimetable({auth,data}){
  const canSelect = ["ADMIN","SCHEDULER"].includes(auth.role);
  const defaultType = auth.role === "FACULTY" ? "FACULTY" : "SECTION";
  const [type,setType]=useState(defaultType),[id,setId]=useState(auth.role==="FACULTY"?refId(auth.faculty):refId(auth.section)),[report,setReport]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(""),[day,setDay]=useState("ALL");
  async function load(t=type,target=id){setLoading(true);setError("");try{const q=t?`?type=${encodeURIComponent(t)}${target?`&id=${encodeURIComponent(target)}`:""}`:"";setReport((await axios.get(`${API}/personal-timetable${q}`)).data)}catch(e){setError(e.response?.data?.message||e.message);setReport(null)}finally{setLoading(false)}}
  useEffect(()=>{load()},[]);
  const rows=(report?.rows||[]).filter(r=>day==="ALL"||r.day===day);
  const today=report?.today?.rows||[];
  const targetLabel=report?.type==="FACULTY"?report?.target?.name:`${report?.target?.program||""} · ${report?.target?.semester||""} · ${report?.target?.name||"Section"}`;
  if(loading&&!report)return <div className="panel"><h2>My Timetable</h2><p>Loading your personal timetable...</p></div>;
  return <div>
    <div className="personal-head"><div><h2>My Timetable</h2><p>Your personal weekly schedule, today's classes and next upcoming class.</p></div><button className="secondary" onClick={()=>load()}><RefreshCw size={15}/> Refresh</button></div>
    {canSelect&&<section className="panel"><div className="personal-selector"><label>View<select value={type} onChange={e=>{setType(e.target.value);setId("");setReport(null)}}><option value="FACULTY">Faculty timetable</option><option value="SECTION">Section timetable</option></select></label><label>{type==="FACULTY"?"Faculty":"Section"}<select value={id} onChange={e=>setId(e.target.value)}><option value="">Select...</option>{(type==="FACULTY"?data.faculty:data.sections).map(x=><option key={x._id} value={x._id}>{type==="FACULTY"?`${x.name}${x.code?` · ${x.code}`:""}`:`${x.program} · ${x.semester} · ${x.name}`}</option>)}</select></label><button className="primary" onClick={()=>load(type,id)} disabled={!id}>Load Timetable</button></div></section>}
    {error&&<div className="message error">{error}</div>}
    {report&&<>
      <div className="cards personal-metrics"><Metric label="Classes" value={report.summary?.classes||0}/><Metric label="Periods" value={report.summary?.periods||0}/><Metric label="Working Days" value={report.summary?.workingDays||0}/><Metric label="Status" value={report.timetable?.status||"—"}/></div>
      <section className="panel"><div className="personal-profile"><div><strong>{targetLabel||"Personal schedule"}</strong><span>{report.session?.name||"Academic session"} · {report.timetable?.versionLabel||`Version ${report.timetable?.version||""}`}</span></div>{report.upcoming&&<div className="upcoming-card"><small>Upcoming / Current</small><b>{report.upcoming.subject}</b><span>{report.upcoming.startTime} – {report.upcoming.endTime} · {report.upcoming.room}</span></div>}</div></section>
      <section className="panel"><div className="panel-head"><div><h3>Today's Schedule — {report.today?.day}</h3><p>Classes scheduled for today.</p></div></div>{today.length?<div className="personal-today">{today.map(r=><div className="personal-class-card" key={String(r.id)}><div><strong>{r.startTime} – {r.endTime}</strong><span>{r.room}</span></div><div><h4>{r.subject}</h4>{r.subjectCode&&<small>{r.subjectCode}</small>}<p>{report.type==="FACULTY"?r.section:r.faculty}</p></div></div>)}</div>:<div className="empty-state"><h3>No classes today</h3><p>You have no timetable entries scheduled for today.</p></div>}</section>
      <section className="panel"><div className="panel-head"><div><h3>Weekly Timetable</h3><p>Use the filter to focus on one day.</p></div><select value={day} onChange={e=>setDay(e.target.value)}><option value="ALL">All Days</option>{days.map(d=><option key={d}>{d}</option>)}</select></div>{rows.length?<div className="personal-week-grid">{rows.map(r=><div className="personal-week-card" key={String(r.id)}><div className="personal-time"><b>{r.day}</b><span>{r.startTime} – {r.endTime}</span></div><div><h4>{r.subject}</h4>{r.subjectCode&&<small>{r.subjectCode}</small>}<p>{report.type==="FACULTY"?r.section:r.faculty}</p><span className="class-room">Room: {r.room}</span></div></div>)}</div>:<div className="empty-state"><h3>No classes</h3><p>No timetable classes match the selected day.</p></div>}</section>
      <section className="panel"><div className="panel-head"><div><h3>Weekly Overview</h3><p>At-a-glance workload by day.</p></div></div><div className="faculty-daily-grid">{(report.weekly||[]).map(d=><div className="faculty-day-card" key={d.day}><strong>{d.day}</strong><span>{d.classes} class{d.classes===1?"":"es"}</span><b>{d.periods} period{d.periods===1?"":"s"}</b></div>)}</div></section>
    </>}
  </div>;
}

function Notifications({auth,data,setMessage}){
  const canManage=["ADMIN","SCHEDULER"].includes(auth.role);
  const [items,setItems]=useState([]);
  const [changes,setChanges]=useState([]);
  const [users,setUsers]=useState([]);
  const [sectionId,setSectionId]=useState("");
  const [loading,setLoading]=useState(true);
  const [form,setForm]=useState({title:"",message:"",priority:"NORMAL",audience:"ALL",faculty:"",section:"",user:"",published:true,startAt:"",endAt:""});

  async function load(){
    setLoading(true);
    try{
      const query=sectionId?`?sectionId=${sectionId}`:"";
      const [r,c]=await Promise.all([axios.get(`${API}/notifications/mine${query}`),axios.get(`${API}/notifications/timetable-changes${query}`)]);
      setItems(r.data||[]); setChanges(c.data||[]);
      if(canManage){try{const u=await axios.get(`${API}/auth/users`);setUsers(u.data||[])}catch{}}
    }catch(e){setMessage(e.response?.data?.message||e.message)}finally{setLoading(false)}
  }
  useEffect(()=>{load()},[sectionId]);

  async function create(){
    if(!form.title.trim()||!form.message.trim()) return setMessage("Notification title and message are required.");
    try{await axios.post(`${API}/notifications`,form);setForm({title:"",message:"",priority:"NORMAL",audience:"ALL",faculty:"",section:"",user:"",published:true,startAt:"",endAt:""});setMessage("Announcement published.");await load();}
    catch(e){setMessage(e.response?.data?.message||e.message)}
  }
  async function remove(id){if(!confirm("Delete this announcement?"))return;try{await axios.delete(`${API}/notifications/${id}`);setMessage("Announcement deleted.");await load()}catch(e){setMessage(e.response?.data?.message||e.message)}}
  async function markRead(id){try{await axios.post(`${API}/notifications/${id}/read`);setItems(items.map(x=>x._id===id?{...x,read:true}:x))}catch(e){setMessage(e.response?.data?.message||e.message)}}
  async function markAll(){try{await axios.post(`${API}/notifications/read-all`);setItems(items.map(x=>({...x,read:true})));setMessage("All visible notifications marked as read.")}catch(e){setMessage(e.response?.data?.message||e.message)}}

  return <div>
    <div className="notification-toolbar"><div><h2>Notifications & Announcements</h2><p>View relevant announcements and timetable-related updates.</p></div><div className="form-actions"><button className="secondary" onClick={load}><RefreshCw size={15}/> Refresh</button><button className="secondary" onClick={markAll}>Mark all read</button></div></div>
    {canManage&&<div className="notification-grid">
      <section className="panel"><div className="panel-head"><div><h3>Create Announcement</h3><p>Publish to everyone or target a specific audience.</p></div></div>
        <div className="notification-form">
          <label>Title<input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="e.g. Timetable updated"/></label>
          <label>Message<textarea value={form.message} onChange={e=>setForm({...form,message:e.target.value})} placeholder="Write the announcement..."/></label>
          <div className="form-grid"><label>Priority<select value={form.priority} onChange={e=>setForm({...form,priority:e.target.value})}><option>NORMAL</option><option>IMPORTANT</option><option>URGENT</option></select></label><label>Audience<select value={form.audience} onChange={e=>setForm({...form,audience:e.target.value})}><option>ALL</option><option>FACULTY</option><option>SECTION</option><option>USER</option></select></label></div>
          {form.audience==="FACULTY"&&<label>Faculty<select value={form.faculty} onChange={e=>setForm({...form,faculty:e.target.value})}><option value="">Select faculty</option>{data.faculty.map(f=><option key={f._id} value={f._id}>{f.name}</option>)}</select></label>}
          {form.audience==="SECTION"&&<label>Section<select value={form.section} onChange={e=>setForm({...form,section:e.target.value})}><option value="">Select section</option>{data.sections.map(s=><option key={s._id} value={s._id}>{s.program} {s.semester} - {s.name}</option>)}</select></label>}
          {form.audience==="USER"&&<label>User<select value={form.user} onChange={e=>setForm({...form,user:e.target.value})}><option value="">Select user</option>{users.map(u=><option key={u._id} value={u._id}>{u.name} ({u.username})</option>)}</select></label>}
          <div className="form-grid"><label>Start<input type="datetime-local" value={form.startAt} onChange={e=>setForm({...form,startAt:e.target.value})}/></label><label>End<input type="datetime-local" value={form.endAt} onChange={e=>setForm({...form,endAt:e.target.value})}/></label></div>
          <label className="setting-check"><input type="checkbox" checked={form.published} onChange={e=>setForm({...form,published:e.target.checked})}/><span><b>Publish immediately</b><small>Users can see it during its active date range.</small></span></label>
          <div className="notification-actions"><button className="primary" onClick={create}><Bell size={15}/> Publish Announcement</button></div>
        </div>
      </section>
      <section className="panel"><div className="panel-head"><div><h3>Notification Management</h3><p>Recent announcements created by administrators and schedulers.</p></div></div><div className="notification-table-wrap"><table className="notification-table"><thead><tr><th>Title</th><th>Audience</th><th>Priority</th><th>Published</th><th></th></tr></thead><tbody>{items.map(n=><tr key={n._id}><td>{n.title}</td><td>{n.audience}</td><td><span className={`notification-pill ${n.priority}`}>{n.priority}</span></td><td>{n.published?"Yes":"No"}</td><td><button className="secondary" onClick={()=>remove(n._id)}><Trash2 size={14}/></button></td></tr>)}</tbody></table></div></section>
    </div>}

    {!canManage&&<section className="panel"><div className="view-filter"><label>Section notifications<select value={sectionId} onChange={e=>setSectionId(e.target.value)}><option value="">All relevant notifications</option>{data.sections.map(s=><option key={s._id} value={s._id}>{s.program} {s.semester} - {s.name}</option>)}</select></label></div></section>}
    <section className="panel timetable-change-panel"><div className="panel-head"><div><h3><History size={17}/> My Timetable Changes</h3><p>Changes relevant to your faculty, section, or user account are shown here.</p></div><span className="notification-pill">{changes.length} change{changes.length===1?"":"s"}</span></div>{!changes.length?<div className="notification-empty">No timetable-specific changes are available for your account.</div>:<div className="timetable-change-list">{changes.map(n=>{const m=n.metadata||{};return <article className={`timetable-change-card ${n.read?"":"unread"}`} key={n._id}><div className="timetable-change-icon"><History size={16}/></div><div className="timetable-change-body"><div className="notification-top"><h3>{n.title}</h3><span className={`notification-pill ${n.priority}`}>{n.priority}</span></div><p>{n.message}</p><div className="notification-meta"><span>{m.subjectName||"Timetable"}</span>{m.day&&<span>{m.day}</span>}{m.startTime&&<span>{m.startTime}{m.endTime?`–${m.endTime}`:""}</span>}{m.fromRoom&&<span>Room: {m.fromRoom} → {m.toRoom||""}</span>}{n.section&&<span>Section: {n.section.name}</span>}{n.faculty&&<span>Faculty: {n.faculty.name}</span>}<span>{new Date(n.createdAt).toLocaleString()}</span></div>{!n.read&&<div className="notification-actions"><button className="secondary" onClick={()=>markRead(n._id)}>Mark as read</button></div>}</div></article>})}</div>}</section>

    <section className="panel"><div className="panel-head"><div><h3>{loading?"Loading...":`${items.length} notification${items.length===1?"":"s"}`}</h3><p>Unread items are highlighted.</p></div></div>{loading?<p>Loading notifications...</p>:!items.length?<div className="notification-empty">No active notifications.</div>:<div className="notification-grid">{items.map(n=><article className={`notification-card ${n.read?"":"unread"}`} key={n._id}><div className="notification-top"><h3>{!n.read&&<span className="notification-unread"/>} {n.title}</h3><span className={`notification-pill ${n.priority}`}>{n.priority}</span></div><div className="notification-message">{n.message}</div><div className="notification-meta"><span>{n.audience}</span>{n.faculty&&<span>Faculty: {n.faculty.name}</span>}{n.section&&<><span>Section: {n.section.name}</span><span>{n.section.program} {n.section.semester}</span></>}{n.createdBy&&<span>By {n.createdBy.name}</span>}<span>{new Date(n.createdAt).toLocaleString()}</span></div>{!n.read&&<div className="notification-actions"><button className="secondary" onClick={()=>markRead(n._id)}>Mark as read</button></div>}</article>)}</div>}</section>
  </div>;
}

function UserManagement({data,setMessage}){
  const [users,setUsers]=useState([]); const [form,setForm]=useState({name:"",username:"",password:"",role:"VIEWER",faculty:"",section:""});
  async function loadUsers(){try{const r=await axios.get(`${API}/auth/users`);setUsers(r.data)}catch(e){setMessage(e.response?.data?.message||e.message)}}
  useEffect(()=>{loadUsers()},[]);
  async function add(){try{await axios.post(`${API}/auth/users`,form);setForm({name:"",username:"",password:"",role:"VIEWER",faculty:"",section:""});setMessage("User created.");loadUsers()}catch(e){setMessage(e.response?.data?.message||e.message)}}
  async function toggle(u){try{await axios.put(`${API}/auth/users/${u._id}`,{active:!u.active});loadUsers()}catch(e){setMessage(e.response?.data?.message||e.message)}}
  return <section className="panel"><div className="panel-head"><div><h2>User Management</h2><p>Create and deactivate users and assign roles.</p></div></div><div className="form-grid"><input placeholder="Full name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/><input placeholder="Username" value={form.username} onChange={e=>setForm({...form,username:e.target.value})}/><input placeholder="Temporary password" type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/><select value={form.role} onChange={e=>setForm({...form,role:e.target.value})}><option>VIEWER</option><option>FACULTY</option><option>SCHEDULER</option><option>ADMIN</option></select><select value={form.faculty} onChange={e=>setForm({...form,faculty:e.target.value})}><option value="">No faculty mapping</option>{data.faculty.map(f=><option key={f._id} value={f._id}>{f.name}</option>)}</select><select value={form.section} onChange={e=>setForm({...form,section:e.target.value})}><option value="">No section mapping</option>{data.sections.map(x=><option key={x._id} value={x._id}>{x.program} · {x.semester} · {x.name}</option>)}</select><button className="primary" onClick={add}>Create User</button></div><div className="table-wrap"><table><thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Faculty</th><th>Section</th><th>Status</th><th>Action</th></tr></thead><tbody>{users.map(u=><tr key={u._id}><td>{u.name}</td><td>{u.username}</td><td>{u.role}</td><td>{u.faculty?.name||"—"}</td><td>{u.section?`${u.section.program} · ${u.section.semester} · ${u.section.name}`:"—"}</td><td>{u.active?"Active":"Inactive"}</td><td><button className="secondary" onClick={()=>toggle(u)}>{u.active?"Deactivate":"Activate"}</button></td></tr>)}</tbody></table></div></section>;
}

function AcademicSessions({sessions,programs,activeSession,setSessions,setActiveSession,setMessage}){
  const activePrograms=(programs||[]).filter(p=>p.active!==false);
  const blankDates=()=>activePrograms.map(p=>({program:p._id,startDate:"",endDate:""}));
  const [form,setForm]=useState({name:"",description:"",programDates:blankDates()});
  const [editingId,setEditingId]=useState(null);
  const [saving,setSaving]=useState(false);

  useEffect(()=>{
    if(!editingId)setForm(f=>({...f,programDates:activePrograms.map(p=>{
      const old=(f.programDates||[]).find(x=>String(x.program)===String(p._id));
      return old||{program:p._id,startDate:"",endDate:""};
    })}));
  },[programs?.length,editingId]);

  function dateValue(v){return v?String(v).slice(0,10):""}
  function updateProgramDate(program,field,value){
    setForm(f=>({...f,programDates:(f.programDates||[]).map(x=>String(x.program)===String(program)?{...x,[field]:value}:x)}));
  }
  function validateProgramDates(){
    if(!activePrograms.length){setMessage("Add at least one active Program before creating an academic session.");return false;}
    const missing=activePrograms.filter(p=>{
      const x=(form.programDates||[]).find(d=>String(d.program)===String(p._id));
      return !x?.startDate||!x?.endDate;
    });
    if(missing.length){setMessage(`Set Start Date and End Date for: ${missing.map(p=>p.name).join(", ")}.`);return false;}
    const invalid=(form.programDates||[]).filter(x=>x.startDate&&x.endDate&&x.endDate<x.startDate);
    if(invalid.length){setMessage("A program End Date cannot be before its Start Date.");return false;}
    return true;
  }
  async function saveSession(){
    if(!form.name.trim())return setMessage("Session name is required.");
    if(!validateProgramDates())return;
    const dates=form.programDates.filter(x=>x.startDate&&x.endDate);
    const start=dates.map(x=>x.startDate).sort()[0];
    const end=dates.map(x=>x.endDate).sort().slice(-1)[0];
    const body={name:form.name.trim(),description:form.description||"",programDates:dates,startDate:start,endDate:end};
    setSaving(true);
    try{
      if(editingId) await axios.put(`${API}/sessions/${editingId}`,body);
      else await axios.post(`${API}/sessions`,body);
      const r=await axios.get(`${API}/sessions`);setSessions(r.data||[]);
      setMessage(editingId?"Program-wise session dates updated.":"Academic session created with program-wise dates.");
      setForm({name:"",description:"",programDates:blankDates()});setEditingId(null);
    }catch(e){setMessage(e.response?.data?.message||e.message)}finally{setSaving(false)}
  }
  function editSession(s){
    setEditingId(s._id);
    setForm({
      name:s.name||"",description:s.description||"",
      programDates:activePrograms.map(p=>{
        const x=(s.programDates||[]).find(d=>String(d.program?._id||d.program)===String(p._id));
        return {program:p._id,startDate:dateValue(x?.startDate),endDate:dateValue(x?.endDate)};
      })
    });
    window.scrollTo({top:0,behavior:"smooth"});
  }
  function reset(){setEditingId(null);setForm({name:"",description:"",programDates:blankDates()})}
  async function activate(id){
    try{
      const r=await axios.post(`${API}/sessions/${id}/activate`);setActiveSession(r.data);
      const all=await axios.get(`${API}/sessions`);setSessions(all.data||[]);setMessage(`Active session: ${r.data.name}`);
    }catch(e){setMessage(e.response?.data?.message||e.message)}
  }
  return <div className="panel">
    <div className="panel-head"><div><h3>Academic Sessions</h3><p>Session dates are configured independently for each Program. The overall session range is calculated from the earliest program start to the latest program end.</p></div>{activeSession&&<span className="status-badge approved">Active: {activeSession.name}</span>}</div>
    <div className="form-grid">
      <Input label="Academic Session Name" value={form.name} onChange={v=>setForm({...form,name:v})}/>
      <Input label="Description" value={form.description} onChange={v=>setForm({...form,description:v})}/>
    </div>
    <div className="message success" style={{marginTop:14}}><strong>Program-wise academic calendar:</strong> Each program can start and end on different dates. Full-session generation will use the date window of the program assigned to each section/subject.</div>
    <div className="table-wrap" style={{marginTop:14}}><table><thead><tr><th>Program</th><th>Code</th><th>Session Start</th><th>Session End</th></tr></thead><tbody>
      {activePrograms.map(p=>{const x=(form.programDates||[]).find(d=>String(d.program)===String(p._id))||{};return <tr key={p._id}><td><strong>{p.name}</strong></td><td>{p.code||"—"}</td><td><input type="date" value={x.startDate||""} onChange={e=>updateProgramDate(p._id,"startDate",e.target.value)}/></td><td><input type="date" value={x.endDate||""} onChange={e=>updateProgramDate(p._id,"endDate",e.target.value)}/></td></tr>})}
      {!activePrograms.length&&<tr><td colSpan="4">No active programs found. Add Programs first.</td></tr>}
    </tbody></table></div>
    <div className="form-actions" style={{marginTop:14}}><button className="primary add" onClick={saveSession} disabled={saving}>{saving?(editingId?"Updating...":"Creating..."):(editingId?"Update Academic Session":"+ Add Academic Session")}</button>{editingId&&<button className="secondary" onClick={reset}>Cancel Edit</button>}</div>
    <div className="table-wrap" style={{marginTop:24}}><table><thead><tr><th>Session</th><th>Program Calendars</th><th>Overall Range</th><th>Status</th><th>Actions</th></tr></thead>
    <tbody>{sessions.map(s=><tr key={s._id}><td><strong>{s.name}</strong><div className="muted">{s.description||""}</div></td><td>{(s.programDates||[]).length} program(s) configured</td><td>{s.startDate?dateValue(s.startDate):"—"} → {s.endDate?dateValue(s.endDate):"—"}</td><td>{s.active?<span className="status-badge approved">ACTIVE</span>:"Inactive"}</td><td style={{display:"flex",gap:8,flexWrap:"wrap"}}><button className="secondary" onClick={()=>editSession(s)}>Edit Dates</button>{!s.active&&<button className="secondary" onClick={()=>activate(s._id)}>Set Active</button>}</td></tr>)}</tbody></table></div>
  </div>
}

function TimetableTemplates({sessions,activeSession,setLatest,setMessage}){
  const [sourceSessionId,setSourceSessionId]=useState("");
  const [sourceVersions,setSourceVersions]=useState([]);
  const [sourceId,setSourceId]=useState("");
  const [targetSessionId,setTargetSessionId]=useState("");
  const [label,setLabel]=useState("");
  const [notes,setNotes]=useState("");
  const [loading,setLoading]=useState(false);

  const targetSessions=(sessions||[]).filter(s=>String(s._id)!==String(sourceSessionId));
  async function loadVersions(sessionId){
    setSourceSessionId(sessionId);setSourceId("");setSourceVersions([]);
    if(!sessionId)return;
    try{const r=await axios.get(`${API}/timetable/versions?sessionId=${sessionId}`);const rows=r.data||[];setSourceVersions(rows);const current=rows.find(x=>x.isCurrent)||rows[0];if(current)setSourceId(current._id);}
    catch(e){setMessage(e.response?.data?.message||e.message)}
  }
  async function clone(){
    if(!sourceId||!targetSessionId)return setMessage("Select a source timetable version and target academic session.");
    if(String(sourceSessionId)===String(targetSessionId))return setMessage("Source and target academic sessions must be different.");
    if(!confirm("Clone this timetable as a new Draft in the target academic session?"))return;
    setLoading(true);setMessage("");
    try{const r=await axios.post(`${API}/timetable/clone`,{sourceTimetableId:sourceId,targetSessionId:targetSessionId,versionLabel:label,notes});setLatest(r.data);setMessage(`Timetable cloned successfully as ${r.data.versionLabel||`Version ${r.data.version}`} in ${r.data.academicSession?.name||"the target session"}.`);setLabel("");setNotes("");}
    catch(e){setMessage(e.response?.data?.message||e.message)}finally{setLoading(false)}
  }
  return <div>
    <div className="analytics-toolbar"><div><h2>Timetable Templates & Clone</h2><p>Use a previous timetable version as the starting point for a new academic session.</p></div></div>
    <section className="panel template-clone-panel">
      <div className="template-flow"><div className="template-step"><span>1</span><div><strong>Source Academic Session</strong><small>Select the session containing the timetable you want to reuse.</small></div><select value={sourceSessionId} onChange={e=>loadVersions(e.target.value)}><option value="">Select source session</option>{(sessions||[]).map(s=><option key={s._id} value={s._id}>{s.name}{s.active?" (Active)":""}</option>)}</select></div>
      <div className="template-step"><span>2</span><div><strong>Source Timetable Version</strong><small>Choose a current or historical version.</small></div><select value={sourceId} onChange={e=>setSourceId(e.target.value)} disabled={!sourceVersions.length}><option value="">Select version</option>{sourceVersions.map(v=><option key={v._id} value={v._id}>{v.versionLabel||`Version ${v.version}`} · {v.status} · {v.createdAt?new Date(v.createdAt).toLocaleDateString():""}</option>)}</select></div>
      <div className="template-step"><span>3</span><div><strong>Target Academic Session</strong><small>The cloned timetable will be created as Draft.</small></div><select value={targetSessionId} onChange={e=>setTargetSessionId(e.target.value)}><option value="">Select target session</option>{targetSessions.map(s=><option key={s._id} value={s._id}>{s.name}{s.active?" (Active)":""}</option>)}</select></div></div>
      <div className="form-grid template-extra"><Input label="New Version Label (optional)" value={label} onChange={setLabel}/><Input label="Notes (optional)" value={notes} onChange={setNotes}/></div>
      <div className="template-warning">Cloning copies scheduled classes and optimization metadata, but it does not copy Faculty, Subject, Section, Room, or Time Slot master records. The target session must use compatible master data.</div>
      <div className="form-actions"><button className="primary" onClick={clone} disabled={loading||!sourceId||!targetSessionId}><Copy size={15}/> {loading?"Cloning...":"Clone as Draft"}</button></div>
    </section>
    {sourceVersions.length>0&&<section className="panel"><div className="panel-head"><div><h3>Available Source Versions</h3><p>{sourceVersions.length} version(s) available in the selected source session.</p></div></div><div className="table-wrap"><table><thead><tr><th>Version</th><th>Status</th><th>Current</th><th>Created</th><th>Notes</th></tr></thead><tbody>{sourceVersions.map(v=><tr key={v._id}><td>{v.versionLabel||`Version ${v.version}`}</td><td><span className={`status-badge ${String(v.status||"").toLowerCase()}`}>{v.status}</span></td><td>{v.isCurrent?"YES":"NO"}</td><td>{v.createdAt?new Date(v.createdAt).toLocaleString():"—"}</td><td>{v.notes||"—"}</td></tr>)}</tbody></table></div></section>}
  </div>;
}

function TimetableVersions({activeSession,versionList,setVersionList,setLatest,setMessage}){
  if(!activeSession)return <div className="panel"><div className="message warn">Activate an Academic Session to manage timetable versions.</div></div>;
  async function refresh(){const r=await axios.get(`${API}/timetable/versions?sessionId=${activeSession._id}`);setVersionList(r.data||[])}
  async function restore(id){
    if(!confirm("Restore this version as a new Draft?"))return;
    try{const r=await axios.post(`${API}/timetable/${id}/restore`);setLatest(r.data);await refresh();setMessage(`Restored as Version ${r.data.version}.`)}
    catch(e){setMessage(e.response?.data?.message||e.message)}
  }
  return <div className="panel">
    <div className="panel-head"><div><h3>Timetable Versions</h3><p>{activeSession.name}</p></div><button className="secondary" onClick={refresh}>Refresh</button></div>
    <div className="table-wrap"><table><thead><tr><th>Version</th><th>Status</th><th>Current</th><th>Created</th><th>Action</th></tr></thead>
    <tbody>{versionList.map(v=><tr key={v._id}><td>{v.versionLabel||`Version ${v.version}`}</td><td>{v.status}</td><td>{v.isCurrent?"YES":"NO"}</td><td>{v.createdAt?new Date(v.createdAt).toLocaleString():"—"}</td><td>{!v.isCurrent&&<button className="secondary" onClick={()=>restore(v._id)}>Restore</button>}</td></tr>)}</tbody></table></div>
  </div>
}


function Reports(){
  const [report,setReport]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(""),[filter,setFilter]=useState("ALL");
  async function load(){setLoading(true);setError("");try{setReport((await axios.get(`${API}/reports/summary`)).data)}catch(e){setError(e.response?.data?.message||e.message)}finally{setLoading(false)}}
  useEffect(()=>{load()},[]);
  async function download(type){try{const r=await axios.get(`${API}/reports/export/${type}`,{responseType:"blob"});const url=URL.createObjectURL(r.data);const a=document.createElement("a");a.href=url;a.download=`timetable-report.${type==="excel"?"xlsx":"pdf"}`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url)}catch(e){setError(e.response?.data?.message||e.message)}}
  if(loading)return <div className="panel"><h3>Advanced Reports</h3><p>Preparing timetable reports...</p></div>;
  if(error)return <div className="panel"><h3>Advanced Reports</h3><div className="message error">{error}</div><button className="primary" onClick={load}>Retry</button></div>;
  const issues=(report?.validation?.issues||[]).filter(x=>filter==="ALL"||x.severity===filter.toLowerCase());
  const unscheduled=(report?.subjects||[]).filter(x=>x.unscheduled>0);
  return <div>
    <div className="analytics-toolbar"><div><h2>Advanced Reports</h2><p>Timetable, workload, utilization, coverage and conflict reporting.</p></div><div className="form-actions"><button className="secondary" onClick={load}><RotateCcw size={15}/> Refresh</button><button className="secondary" onClick={()=>download("excel")}><FileSpreadsheet size={15}/> Excel</button><button className="primary" onClick={()=>download("pdf")}><FileSpreadsheet size={15}/> PDF</button></div></div>
    <div className="cards analytics-cards"><Metric label="Required Sessions" value={report.summary.requiredSessions}/><Metric label="Scheduled Sessions" value={report.summary.scheduledSessions}/><Metric label="Coverage" value={`${report.summary.coverage}%`}/><Metric label="Unscheduled" value={report.summary.unscheduledSessions}/><Metric label="Validation Errors" value={report.validation.errors}/><Metric label="Warnings" value={report.validation.warnings}/></div>
    <section className="panel"><div className="panel-head"><div><h3>Report Context</h3><p>Current academic session and timetable version.</p></div></div><div className="report-context"><div><span>Academic Session</span><strong>{report.session?.name||"Not configured"}</strong></div><div><span>Timetable Version</span><strong>{report.timetable?.versionLabel||"Current"}</strong></div><div><span>Status</span><strong>{report.timetable?.status||"DRAFT"}</strong></div><div><span>Total Periods</span><strong>{report.summary.periods}</strong></div></div></section>
    <div className="analytics-grid">
      <section className="panel"><div className="panel-head"><div><h3>Faculty Workload</h3><p>Classes, periods and utilization.</p></div></div><div className="table-wrap"><table><thead><tr><th>Faculty</th><th>Classes</th><th>Periods</th><th>Days</th><th>Utilization</th></tr></thead><tbody>{report.faculty.map(x=><tr key={x.id}><td>{x.name}</td><td>{x.classes}</td><td>{x.periods}</td><td>{x.workingDays}</td><td><Progress value={x.utilization}/></td></tr>)}</tbody></table></div></section>
      <section className="panel"><div className="panel-head"><div><h3>Room Utilization</h3><p>Occupied timetable periods by room.</p></div></div><div className="table-wrap"><table><thead><tr><th>Room</th><th>Type</th><th>Classes</th><th>Periods</th><th>Utilization</th></tr></thead><tbody>{report.rooms.map(x=><tr key={x.id}><td>{x.name}</td><td>{x.type}</td><td>{x.classes}</td><td>{x.periods}</td><td><Progress value={x.utilization}/></td></tr>)}</tbody></table></div></section>
      <section className="panel"><div className="panel-head"><div><h3>Section Workload</h3><p>Coverage and scheduled load by section.</p></div></div><div className="table-wrap"><table><thead><tr><th>Section</th><th>Classes</th><th>Periods</th><th>Required</th><th>Coverage</th></tr></thead><tbody>{report.sections.map(x=><tr key={x.id}><td>{x.label}</td><td>{x.classes}</td><td>{x.periods}</td><td>{x.required}</td><td><Progress value={x.coverage}/></td></tr>)}</tbody></table></div></section>
      <section className="panel"><div className="panel-head"><div><h3>Daily Distribution</h3><p>Classes and periods across the working week.</p></div></div><div className="daily-chart">{report.daily.map(x=><div className="daily-row" key={x.day}><strong>{x.day.slice(0,3)}</strong><div className="bar"><span style={{width:`${Math.min(100,(x.periods/Math.max(1,...report.daily.map(y=>y.periods)))*100)}%`}}></span></div><b>{x.periods}</b></div>)}</div></section>
    </div>
    <section className="panel"><div className="panel-head"><div><h3>Unscheduled Classes</h3><p>Subjects where required weekly sessions exceed scheduled sessions.</p></div></div>{unscheduled.length?<div className="table-wrap"><table><thead><tr><th>Subject</th><th>Code</th><th>Faculty</th><th>Section</th><th>Required</th><th>Scheduled</th><th>Unscheduled</th></tr></thead><tbody>{unscheduled.map(x=><tr key={x.id}><td>{x.name}</td><td>{x.code}</td><td>{x.faculty}</td><td>{x.section}</td><td>{x.required}</td><td>{x.scheduled}</td><td className="missing-cell">{x.unscheduled}</td></tr>)}</tbody></table></div>:<div className="empty-state"><h3>No unscheduled classes</h3><p>All subject weekly requirements are currently covered.</p></div>}</section>
    <section className="panel"><div className="panel-head"><div><h3>Conflict & Validation Report</h3><p>Detailed issues detected by the reporting engine.</p></div></div><div className="view-tabs">{[["ALL","All"],["ERROR","Errors"],["WARNING","Warnings"]].map(([v,l])=><button key={v} className={filter===v?"view-tab active":"view-tab"} onClick={()=>setFilter(v)}>{l}</button>)}</div>{issues.length?<div className="validation-list">{issues.map((x,i)=><div className={`validation-item ${x.severity}`} key={`${x.category}-${i}`}><div className="validation-icon">{x.severity==="error"?<X size={16}/>:<Activity size={16}/>}</div><div><strong>{x.category}</strong><p>{x.message}</p></div></div>)}</div>:<div className="empty-state"><h3>No issues in this filter</h3><p>The current report contains no matching validation issues.</p></div>}</section>
  </div>
}

function AuditLogs(){
  const [data,setData]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(""),[action,setAction]=useState(""),[category,setCategory]=useState(""),[page,setPage]=useState(1);
  async function load(){setLoading(true);setError("");try{const q=new URLSearchParams({page,limit:50});if(action)q.set("action",action);if(category)q.set("category",category);setData((await axios.get(`${API}/audit?${q.toString()}`)).data)}catch(e){setError(e.response?.data?.message||e.message)}finally{setLoading(false)}}
  useEffect(()=>{load()},[page,action,category]);
  async function clear(){if(!window.confirm("Delete all audit logs? This cannot be undone."))return;try{await axios.delete(`${API}/audit/clear`);setPage(1);await load()}catch(e){setError(e.response?.data?.message||e.message)}}
  if(loading&&!data)return <div className="panel"><h2>Audit Logs</h2><p>Loading audit history...</p></div>;
  return <div>
    <div className="analytics-toolbar"><div><h2>Audit Logs</h2><p>Track timetable generation, edits, moves, approvals, restores and administrative changes.</p></div><div className="form-actions"><button className="secondary" onClick={load}><RotateCcw size={15}/> Refresh</button>{authRole()==="ADMIN"&&<button className="secondary" onClick={clear}>Clear Logs</button>}</div></div>
    {error&&<div className="message error">{error}</div>}
    <section className="panel"><div className="view-filter"><div className="field"><label>Action</label><select value={action} onChange={e=>{setPage(1);setAction(e.target.value)}}><option value="">All actions</option>{(data?.actions||[]).map(x=><option key={x}>{x}</option>)}</select></div><div className="field"><label>Category</label><select value={category} onChange={e=>{setPage(1);setCategory(e.target.value)}}><option value="">All categories</option>{(data?.categories||[]).map(x=><option key={x}>{x}</option>)}</select></div></div>
      <div className="table-wrap"><table><thead><tr><th>Date/Time</th><th>User</th><th>Role</th><th>Action</th><th>Category</th><th>Description</th></tr></thead><tbody>{(data?.rows||[]).map(x=><tr key={x._id}><td>{new Date(x.createdAt).toLocaleString()}</td><td>{x.user?.name||x.username||"System"}</td><td>{x.role||"—"}</td><td><span className="audit-action">{x.action}</span></td><td>{x.category}</td><td>{x.description}</td></tr>)}</tbody></table></div>
      {!data?.rows?.length&&<div className="empty-state"><h3>No audit records</h3><p>Actions will appear here as users work with the timetable.</p></div>}
      <div className="audit-pagination"><span>{data?.total||0} record(s)</span><div><button className="secondary" disabled={page<=1} onClick={()=>setPage(page-1)}>Previous</button> <button className="secondary" disabled={page>=(data?.pages||1)} onClick={()=>setPage(page+1)}>Next</button></div></div>
    </section>
  </div>;
}

function authRole(){try{return JSON.parse(localStorage.getItem("tt_user")||"null")?.role||""}catch{return ""}}

function Optimization(){
  const [report,setReport]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(""),[busy,setBusy]=useState("");
  async function load(){setLoading(true);setError("");try{setReport((await axios.get(`${API}/timetable/optimization`)).data)}catch(e){setError(e.response?.data?.message||e.message)}finally{setLoading(false)}}
  useEffect(()=>{load()},[]);
  async function apply(s,c){
    setBusy(`${s.entryId||"new"}|${c.day}|${c.startTime}|${c.roomId||""}`);setError("");
    try{await axios.post(`${API}/timetable/optimization/apply`,{entryId:s.entryId,day:c.day,startTime:c.startTime,roomId:c.roomId});await load();}
    catch(e){setError(e.response?.data?.message||e.message)}finally{setBusy("")}
  }
  if(loading)return <div className="panel"><h2>Optimization Center</h2><p>Analyzing conflicts, availability and unscheduled classes...</p></div>;
  return <div>
    <div className="analytics-toolbar"><div><h2>Optimization Center</h2><p>Find practical alternative periods and rooms for timetable problems.</p></div><button className="secondary" onClick={load}><RotateCcw size={15}/> Re-analyze</button></div>
    <div className="optimization-note">Suggestions are generated without changing the timetable. Applying a suggestion is allowed only while the current timetable is <b>DRAFT</b>.</div>
    {error&&<div className="message error">{error}</div>}
    <div className="optimization-summary"><Metric label="Issues" value={report?.summary?.issues||0}/><Metric label="Suggestions" value={report?.summary?.suggestions||0}/><Metric label="Status" value={report?.status||"DRAFT"}/></div>
    <section className="panel"><div className="panel-head"><div><h3>Suggested Resolutions</h3><p>Higher-scoring alternatives are shown first.</p></div></div>
      {!report?.suggestions?.length?<div className="optimization-empty"><h3>✓ No optimization candidates needed</h3><p>The current timetable has no detected issue for which this optimizer can provide an alternative.</p></div>:
      <div className="optimization-list">{report.suggestions.map((s,i)=><div className="optimization-card" key={`${s.type}-${s.entryId||i}`}><div className="optimization-card-head"><div><span className="optimization-badge">{s.type.replaceAll("_"," ")}</span><h3 style={{marginTop:8}}>{s.subject}</h3><div className="optimization-reason">{s.reason}</div><small>{s.faculty} · {s.section}</small></div><span className="notification-pill IMPORTANT">{s.candidates.length} option{s.candidates.length===1?"":"s"}</span></div><div className="suggestion-grid">{s.candidates.map((c,j)=>{const key=`${s.entryId||"new"}|${c.day}|${c.startTime}|${c.roomId||""}`;return <div className="suggestion" key={key}><strong>{c.day}</strong><small>{c.startTime} – {c.endTime}<br/>{c.room||"Room"}<br/>Score: {c.score}</small><button className="primary full" disabled={!s.entryId||busy===key||report.status!=="DRAFT"} onClick={()=>apply(s,c)}>{busy===key?"Applying...":"Apply"}</button></div>})}</div></div>)}</div>}
    </section>
  </div>;
}

function Validation(){
  const [report,setReport]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(""),[filter,setFilter]=useState("ALL");
  async function load(){setLoading(true);setError("");try{setReport((await axios.get(`${API}/timetable/validation`)).data)}catch(e){setError(e.response?.data?.message||e.message)}finally{setLoading(false)}}
  useEffect(()=>{load()},[]);
  if(loading)return <div className="panel"><h3>Validation Center</h3><p>Checking timetable conflicts and constraints...</p></div>;
  if(error)return <div className="panel"><h3>Validation Center</h3><div className="message error">{error}</div><button className="primary" onClick={load}>Retry</button></div>;
  if(!report?.hasTimetable)return <div className="panel"><h3>Validation Center</h3><div className="empty-state"><h3>No timetable generated</h3><p>Generate a timetable first.</p></div></div>;
  const issues=(report.issues||[]).filter(x=>filter==="ALL"||x.severity===filter.toLowerCase());
  return <div>
    <div className="analytics-toolbar"><div><h2>Validation Center</h2><p>Check conflicts, availability, room rules, workload limits and coverage.</p></div><button className="secondary" onClick={load}><RotateCcw size={15}/> Run Validation</button></div>
    <div className="cards analytics-cards"><Metric label="Errors" value={report.summary.errors}/><Metric label="Warnings" value={report.summary.warnings}/><Metric label="Classes" value={report.summary.entries}/><Metric label="Issues" value={report.summary.total}/></div>
    <div className="view-tabs">{[["ALL","All"],["ERROR","Errors"],["WARNING","Warnings"]].map(([v,l])=><button key={v} className={filter===v?"view-tab active":"view-tab"} onClick={()=>setFilter(v)}>{l}</button>)}</div>
    <section className="panel"><div className="panel-head"><div><h3>{issues.length ? `${issues.length} issue${issues.length===1?"":"s"}` : "No issues found"}</h3><p>{issues.length?"Review the items below before publishing the timetable.":"The generated timetable passed the available validation checks."}</p></div></div>
      {issues.length?<div className="validation-list">{issues.map((x,i)=><div className={`validation-item ${x.severity.toLowerCase()}`} key={`${x.category}-${i}`}><div className="validation-icon">{x.severity==='error'?<X size={16}/>:<Activity size={16}/>}</div><div><strong>{x.category}</strong><p>{x.message}</p></div></div>)}</div>:<div className="empty-state"><h3>✓ Timetable is valid</h3><p>No faculty, section, room or configured constraint conflicts were detected.</p></div>}
    </section>
  </div>
}

function ChangeHistory({activeSession,versionList}){
  const [fromId,setFromId]=useState(""),[toId,setToId]=useState(""),[result,setResult]=useState(null),[loading,setLoading]=useState(false),[error,setError]=useState("");
  const versions=(versionList||[]).filter(v=>!activeSession||String(v.academicSession?._id||v.academicSession)===String(activeSession._id));
  useEffect(()=>{if(versions.length>=2){const ordered=[...versions].sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));setFromId(String(ordered[ordered.length-2]._id));setToId(String(ordered[ordered.length-1]._id));}else if(versions.length===1){setFromId("");setToId(String(versions[0]._id));}else{setFromId("");setToId("");}setResult(null);setError("");},[activeSession?._id,versionList?.length]);
  async function compare(){if(!fromId||!toId){setError("Select both timetable versions.");return}if(fromId===toId){setError("Select two different timetable versions.");return}setLoading(true);setError("");try{setResult((await axios.get(`${API}/timetable/change-history?fromId=${encodeURIComponent(fromId)}&toId=${encodeURIComponent(toId)}${activeSession?`&sessionId=${encodeURIComponent(activeSession._id)}`:""}`)).data)}catch(e){setError(e.response?.data?.message||e.message);setResult(null)}finally{setLoading(false)}}
  const changes=result?.changes||[];
  return <div>
    <div className="analytics-toolbar"><div><h2><History size={22} style={{verticalAlign:"-4px",marginRight:7}}/> Timetable Change History</h2><p>Compare two versions and see which classes were added, removed, moved or updated.</p></div><button className="primary" onClick={compare} disabled={loading||!fromId||!toId}>{loading?"Comparing...":"Compare Versions"}</button></div>
    {error&&<div className="message error">{error}</div>}
    <section className="panel"><div className="change-history-selectors"><div className="field"><label>Older / From Version</label><select value={fromId} onChange={e=>{setFromId(e.target.value);setResult(null)}}><option value="">Select version...</option>{versions.map(v=><option key={v._id} value={v._id}>{v.versionLabel||`Version ${v.version}`} · {v.status} · {new Date(v.createdAt).toLocaleString()}</option>)}</select></div><div className="change-arrow">→</div><div className="field"><label>Newer / To Version</label><select value={toId} onChange={e=>{setToId(e.target.value);setResult(null)}}><option value="">Select version...</option>{versions.map(v=><option key={v._id} value={v._id}>{v.versionLabel||`Version ${v.version}`} · {v.status} · {new Date(v.createdAt).toLocaleString()}</option>)}</select></div></div>{!versions.length&&<div className="empty-state"><h3>No timetable versions</h3><p>Generate at least one timetable version for the active academic session.</p></div>}{versions.length===1&&<div className="message">Only one version is available. Generate another version to compare changes.</div>}</section>
    {result&&<><div className="cards change-summary-cards"><Metric label="Total Changes" value={result.summary.total}/><Metric label="Added" value={result.summary.added}/><Metric label="Removed" value={result.summary.removed}/><Metric label="Moved" value={result.summary.moved}/><Metric label="Updated" value={result.summary.updated}/></div><section className="panel"><div className="panel-head"><div><h3>{result.from.versionLabel||`Version ${result.from.version}`} → {result.to.versionLabel||`Version ${result.to.version}`}</h3><p>{result.from.academicSession||""} · {new Date(result.from.createdAt).toLocaleString()} → {new Date(result.to.createdAt).toLocaleString()}</p></div></div>{changes.length?<div className="change-history-list">{changes.map((x,i)=><div className={`change-history-item ${x.type.toLowerCase()}`} key={i}><div className="change-type">{x.type}</div><div className="change-main"><strong>{x.after?.subject||x.before?.subject||"Class"}{(x.after?.subjectCode||x.before?.subjectCode)?` (${x.after?.subjectCode||x.before?.subjectCode})`:""}</strong><span>{x.after?.section||x.before?.section||"Section"} · {x.after?.faculty||x.before?.faculty||"Faculty"}</span>{x.type==="ADDED"&&<p>New class: {x.after.day}, {x.after.startTime}–{x.after.endTime} · Room {x.after.room}</p>}{x.type==="REMOVED"&&<p>Removed class: {x.before.day}, {x.before.startTime}–{x.before.endTime} · Room {x.before.room}</p>}{x.type!=="ADDED"&&x.type!=="REMOVED"&&(x.fields||[]).map(f=><div className="change-field" key={f.field}><b>{f.label}</b><span>{f.before}</span><em>→</em><span>{f.after}</span></div>)}</div></div>)}</div>:<div className="empty-state"><h3>No schedule changes detected</h3><p>The selected timetable versions contain the same class placements.</p></div>}</section></>}
  </div>;
}

function Analytics(){
  const [report,setReport]=useState(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  async function load(){
    setLoading(true);setError("");
    try{const r=await axios.get(`${API}/analytics`);setReport(r.data)}catch(e){setError(e.response?.data?.message||e.message)}finally{setLoading(false)}
  }
  useEffect(()=>{load()},[]);
  if(loading) return <div className="panel"><h3>Analytics</h3><p>Loading timetable analytics...</p></div>;
  if(error) return <div className="panel"><h3>Analytics</h3><div className="message error">{error}</div><button className="primary" onClick={load}>Retry</button></div>;
  if(!report?.hasTimetable) return <div className="panel"><h3>Analytics</h3><div className="empty-state"><h3>No timetable generated</h3><p>Generate a timetable first to view workload and utilization analytics.</p></div></div>;
  return <div>
    <div className="analytics-toolbar"><div><h2>Timetable Analytics</h2><p>Workload, room utilization, section load and generation coverage.</p></div><button className="secondary" onClick={load}><RotateCcw size={15}/> Refresh</button></div>
    <div className="cards analytics-cards">
      <Metric label="Required Sessions" value={report.summary.requiredSessions}/>
      <Metric label="Scheduled Sessions" value={report.summary.scheduledSessions}/>
      <Metric label="Coverage" value={`${report.summary.coverage}%`}/>
      <Metric label="Unscheduled" value={report.summary.unscheduledSessions}/>
    </div>
    <div className="analytics-grid">
      <section className="panel"><div className="panel-head"><div><h3>Faculty Workload</h3><p>Scheduled periods by faculty.</p></div></div><div className="table-wrap"><table><thead><tr><th>Faculty</th><th>Classes</th><th>Periods</th><th>Days</th><th>Utilization</th></tr></thead><tbody>{report.faculty.map(x=><tr key={x.id}><td>{x.name}</td><td>{x.classes}</td><td>{x.periods}</td><td>{x.days}</td><td><Progress value={x.utilization}/></td></tr>)}</tbody></table></div></section>
      <section className="panel"><div className="panel-head"><div><h3>Room Utilization</h3><p>Occupied periods against available timetable periods.</p></div></div><div className="table-wrap"><table><thead><tr><th>Room</th><th>Type</th><th>Classes</th><th>Periods</th><th>Utilization</th></tr></thead><tbody>{report.rooms.map(x=><tr key={x.id}><td>{x.name}</td><td>{x.type}</td><td>{x.classes}</td><td>{x.periods}</td><td><Progress value={x.utilization}/></td></tr>)}</tbody></table></div></section>
      <section className="panel"><div className="panel-head"><div><h3>Section Workload</h3><p>Scheduled periods by section.</p></div></div><div className="table-wrap"><table><thead><tr><th>Section</th><th>Classes</th><th>Periods</th><th>Coverage</th></tr></thead><tbody>{report.sections.map(x=><tr key={x.id}><td>{x.label}</td><td>{x.classes}</td><td>{x.periods}</td><td><Progress value={x.coverage}/></td></tr>)}</tbody></table></div></section>
      <section className="panel"><div className="panel-head"><div><h3>Daily Distribution</h3><p>Scheduled periods across the week.</p></div></div><div className="daily-chart">{report.daily.map(x=><div className="daily-row" key={x.day}><strong>{x.day.slice(0,3)}</strong><div className="bar"><span style={{width:`${Math.min(100,(x.periods/Math.max(1,report.dailyMax))*100)}%`}}></span></div><b>{x.periods}</b></div>)}</div></section>
    </div>
    {report.warnings?.length>0&&<div className="warning">{report.warnings.join(" ")}</div>}
  </div>
}
function Metric({label,value}){return <div className="card"><div className="icon"><Activity/></div><div><span>{label}</span><strong>{value}</strong></div></div>}
function Progress({value}){return <div className="progress-wrap"><div className="progress"><span style={{width:`${Math.min(100,Math.max(0,value||0))}%`}}></span></div><small>{value}%</small></div>}

function Dashboard({cards,generate,seed,loading,latest,role}){
  const quick=[
    {label:"Academic Sessions",icon:CalendarDays,desc:"Manage program-wise calendars",tab:"Academic Sessions"},
    {label:"Full Session Timetable",icon:CalendarDays,desc:"Generate the complete academic plan",tab:"Full Session Timetable"},
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


function MasterDataSettings({data,setData,reload,setMessage}){
  const [section,setSection]=useState("Programs");
  const [query,setQuery]=useState("");
  const items=[
    {name:"Programs",key:"programs",icon:BookOpen,desc:"Academic programs, departments and duration."},
    {name:"Faculty",key:"faculty",icon:Users,desc:"Faculty workload and working-day settings."},
    {name:"Subjects",key:"subjects",icon:BookOpen,desc:"Subjects, faculty mapping and weekly load."},
    {name:"Sections",key:"sections",icon:Users,desc:"Program sections and daily class limits."},
    {name:"Rooms",key:"rooms",icon:DoorOpen,desc:"Classrooms, labs and room capacity."},
    {name:"Time Slots",key:"timeslots",icon:Clock3,desc:"Daily periods and scheduling order."},
    {name:"Availability",key:"availability",icon:Activity,desc:"Faculty availability by day and period."}
  ];
  const selected=items.find(x=>x.name===section)||items[0];
  const counts={programs:data.programs?.length||0,faculty:data.faculty?.length||0,subjects:data.subjects?.length||0,sections:data.sections?.length||0,rooms:data.rooms?.length||0,timeslots:(data.timeslots||[]).filter(x=>!x.isBreak).length};
  const total=Object.values(counts).reduce((a,b)=>a+b,0);
  const filteredItems=items.filter(x=>`${x.name} ${x.desc}`.toLowerCase().includes(query.toLowerCase()));
  function select(name){setSection(name);setQuery("");}
  return <div className="master-settings-page">
    <section className="master-settings-hero">
      <div>
        <span className="master-settings-eyebrow">ADMINISTRATION · MASTER DATA</span>
        <h2>Master Data Settings</h2>
        <p>Manage the academic data used by timetable generation, attendance and fees from one place.</p>
      </div>
      <div className="master-settings-total"><strong>{total}</strong><span>configured records</span></div>
    </section>

    <section className="master-overview-grid">
      {items.slice(0,6).map(({name,key,icon:Icon})=><button key={name} className={`master-overview-card ${section===name?"active":""}`} onClick={()=>select(name)}>
        <span className="master-overview-icon"><Icon size={18}/></span>
        <span className="master-overview-copy"><b>{name}</b><small>{counts[key]} record{counts[key]===1?"":"s"}</small></span>
        <span className="master-overview-arrow">›</span>
      </button>)}
    </section>

    <section className="master-settings-body">
      <aside className="master-settings-menu">
        <div className="master-menu-title">Data Categories</div>
        <div className="master-menu-search"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search categories..."/></div>
        {filteredItems.map(({name,icon:Icon,desc})=><button key={name} className={`master-menu-item ${section===name?"active":""}`} onClick={()=>select(name)}>
          <span className="master-menu-icon"><Icon size={17}/></span><span><b>{name}</b><small>{desc}</small></span><span className="master-menu-arrow">›</span>
        </button>)}
      </aside>
      <div className="master-settings-content">
        <div className="master-settings-heading">
          <div><span className="master-settings-kicker">MASTER DATA</span><h3>{selected.name}</h3><p>{selected.desc}</p></div>
          {selected.name!=="Availability"&&<span className="master-record-pill">{counts[selected.key]} records</span>}
        </div>
        {selected.name==="Availability"
          ? <AvailabilityMatrix data={data} reload={reload} setMessage={setMessage}/>
          : <MasterView type={selected.name} data={data} setData={setData} reload={reload}/>
        }
      </div>
    </section>
  </div>;
}

function MasterView({type,data,setData,reload}){
  const key=Object.keys(apiName).find(k=>apiName[k]===type);
  const [form,setForm]=useState({});
  const [editingId,setEditingId]=useState(null);
  const [saving,setSaving]=useState(false);

  function reset(){
    setForm({});
    setEditingId(null);
  }

  function edit(record){
    if(key==="subjects"){
      setForm({
        name:record.name||"",
        code:record.code||"",
        faculty:record.faculty?._id||record.faculty||"",
        section:record.section?._id||record.section||"",
        classesPerWeek:record.classesPerWeek||1,
        totalSessions:record.totalSessions||0,
        maxClassesPerWeek:record.maxClassesPerWeek||record.classesPerWeek||1,
        duration:record.duration||1,
        roomType:record.roomType||"Classroom"
      });
    }else{
      setForm({...record});
    }
    setEditingId(record._id);
    window.scrollTo({top:0,behavior:"smooth"});
  }

  async function save(){
    let body={...form};

    if(key==="programs") body={
      name:body.name,code:body.code,department:body.department,
      durationYears:Number(body.durationYears||4),active:true
    };

    if(key==="faculty") body={
      name:body.name,code:body.code,
      maxWorkingDays:Number(body.maxWorkingDays||5),
      maxClassesPerDay:Number(body.maxClassesPerDay||4),
      availableDays:body.availableDays||days,
      unavailableSlots:body.unavailableSlots||[]
    };

    if(key==="sections") body={
      program:body.program,semester:body.semester,name:body.name,
      maxClassesPerDay:Number(body.maxClassesPerDay||5)
    };

    if(key==="rooms") body={
      name:body.name,type:body.type||"Classroom",
      capacity:Number(body.capacity||60)
    };

    if(key==="timeslots") body={
      day:body.day||"Monday",startTime:body.startTime,
      endTime:body.endTime,order:Number(body.order||1),isBreak:false
    };

    if(key==="subjects"){
      if(!body.faculty || !body.section){
        setMessage("Please select both Faculty and Section for the subject.");
        return;
      }
      body={
        name:body.name,
        code:body.code,
        faculty:body.faculty,
        section:body.section,
        classesPerWeek:Number(body.classesPerWeek||1),
        totalSessions:Number(body.totalSessions||0),
        maxClassesPerWeek:Number(body.maxClassesPerWeek||body.classesPerWeek||1),
        duration:Number(body.duration||1),
        roomType:body.roomType||"Classroom"
      };
    }

    setSaving(true);
    try{
      if(editingId){
        await axios.put(`${API}/${key}/${editingId}`,body);
        setMessage(`${type.slice(0,-1)} updated successfully.`);
      }else{
        await axios.post(`${API}/${key}`,body);
        setMessage(`${type.slice(0,-1)} added successfully.`);
      }
      reset();
      await reload();
    }catch(e){
      setMessage(e.response?.data?.message||e.message);
    }finally{
      setSaving(false);
    }
  }

  async function del(id){
    if(!confirm("Delete this record?")) return;
    try{
      await axios.delete(`${API}/${key}/${id}`);
      if(editingId===id) reset();
      await reload();
    }catch(e){
      setMessage(e.response?.data?.message||e.message);
    }
  }

  const list=data[key]||[];

  return <div className="panel">
    <div className="form-grid">
      {key==="programs" && <>
        <Input label="Program Name" value={form.name} onChange={v=>setForm({...form,name:v})}/>
        <Input label="Code" value={form.code} onChange={v=>setForm({...form,code:v})}/>
        <Input label="Department" value={form.department} onChange={v=>setForm({...form,department:v})}/>
        <Input label="Duration (Years)" type="number" value={form.durationYears||4} onChange={v=>setForm({...form,durationYears:v})}/>
      </>}

      {key==="faculty" && <>
        <Input label="Faculty Name" value={form.name} onChange={v=>setForm({...form,name:v})}/>
        <Input label="Code" value={form.code} onChange={v=>setForm({...form,code:v})}/>
        <Input label="Max Working Days" type="number" value={form.maxWorkingDays||5} onChange={v=>setForm({...form,maxWorkingDays:v})}/>
        <Input label="Max Classes / Day" type="number" value={form.maxClassesPerDay||4} onChange={v=>setForm({...form,maxClassesPerDay:v})}/>
        <div className="field">
          <label>Available Days</label>
          <div className="checks">
            {days.map(d=><label key={d}>
              <input
                type="checkbox"
                checked={(form.availableDays||days).includes(d)}
                onChange={e=>{
                  let a=form.availableDays||[...days];
                  a=e.target.checked?[...new Set([...a,d])]:a.filter(x=>x!==d);
                  setForm({...form,availableDays:a});
                }}
              /> {d.slice(0,3)}
            </label>)}
          </div>
        </div>
      </>}

      {key==="subjects" && <>
        <Input label="Subject Name" value={form.name} onChange={v=>setForm({...form,name:v})}/>
        <Input label="Code" value={form.code} onChange={v=>setForm({...form,code:v})}/>
        <Select label="Faculty" value={form.faculty} options={data.faculty.map(x=>[x._id,x.name])} onChange={v=>setForm({...form,faculty:v})}/>
        <Select
          label="Section"
          value={form.section}
          options={data.sections.map(x=>[
            x._id,
            `${x.program||""} ${x.semester||""} - ${x.name||""}`
          ])}
          onChange={v=>setForm({...form,section:v})}
        />
        <Input label="Default Classes / Week" type="number" value={form.classesPerWeek||1} onChange={v=>setForm({...form,classesPerWeek:v})}/>
        <Input label="Total Sessions / Academic Session" type="number" value={form.totalSessions||0} onChange={v=>setForm({...form,totalSessions:v})}/>
        <Input label="Max Classes / Week" type="number" value={form.maxClassesPerWeek||form.classesPerWeek||1} onChange={v=>setForm({...form,maxClassesPerWeek:v})}/>
        <Input label="Duration (Periods)" type="number" value={form.duration||1} onChange={v=>setForm({...form,duration:v})}/>
        <Select label="Room Type" value={form.roomType||"Classroom"} options={[["Classroom","Classroom"],["Lab","Lab"],["Any","Any"]]} onChange={v=>setForm({...form,roomType:v})}/>
      </>}

      {key==="sections" && <>
        <Input label="Program" value={form.program} onChange={v=>setForm({...form,program:v})}/>
        <Input label="Semester" value={form.semester} onChange={v=>setForm({...form,semester:v})}/>
        <Input label="Section" value={form.name} onChange={v=>setForm({...form,name:v})}/>
        <Input label="Max Classes / Day" type="number" value={form.maxClassesPerDay||5} onChange={v=>setForm({...form,maxClassesPerDay:v})}/>
      </>}

      {key==="rooms" && <>
        <Input label="Room Name" value={form.name} onChange={v=>setForm({...form,name:v})}/>
        <Select label="Type" value={form.type||"Classroom"} options={[["Classroom","Classroom"],["Lab","Lab"]]} onChange={v=>setForm({...form,type:v})}/>
        <Input label="Capacity" type="number" value={form.capacity||60} onChange={v=>setForm({...form,capacity:v})}/>
      </>}

      {key==="timeslots" && <>
        <Select label="Day" value={form.day||"Monday"} options={days.map(d=>[d,d])} onChange={v=>setForm({...form,day:v})}/>
        <Input label="Start" type="time" value={form.startTime} onChange={v=>setForm({...form,startTime:v})}/>
        <Input label="End" type="time" value={form.endTime} onChange={v=>setForm({...form,endTime:v})}/>
        <Input label="Order" type="number" value={form.order||1} onChange={v=>setForm({...form,order:v})}/>
      </>}

      <div className="form-actions">
        <button className="primary add" onClick={save} disabled={saving}>
          {saving?(editingId?"Saving...":"Adding..."):(editingId?`Update ${type.slice(0,-1)}`:`+ Add ${type}`)}
        </button>
        {editingId && <button className="secondary" onClick={reset}>Cancel Edit</button>}
      </div>
    </div>

    {key==="subjects" && <div className="message success" style={{marginTop:12}}>
      <strong>Important:</strong> Every subject must have a Faculty and Section. Set Total Sessions for the full academic session. Max Classes / Week controls how many times the subject may appear in one week.
    </div>}

    <div className="master-card-grid">
      {list.map(x=>{
        const facultyName=x.faculty?.name || data.faculty.find(f=>refId(f)===refId(x.faculty))?.name;
        const section=data.sections.find(v=>refId(v)===refId(x.section));
        const sectionLabel=x.section?.name || (section ? `${section.program||""} ${section.semester||""} · ${section.name||""}` : null);
        return <article className="master-card" key={x._id}>
          <div className="master-card-top">
            <div className="master-card-icon">
              {key==="programs"?<BookOpen size={19}/>:key==="faculty"?<Users size={19}/>:key==="subjects"?<BookOpen size={19}/>:key==="sections"?<Users size={19}/>:key==="rooms"?<DoorOpen size={19}/>:<Clock3 size={19}/>} 
            </div>
            <div className="master-card-title">
              <h3>{key==="programs"?x.name:key==="faculty"?x.name:key==="subjects"?x.name:key==="sections"?x.name:key==="rooms"?x.name:`${x.startTime||""} – ${x.endTime||""}`}</h3>
              <span>{key==="programs"?x.code||"Program":key==="faculty"?x.code||"Faculty":key==="subjects"?x.code||"Subject":key==="sections"?`${x.program||""} · ${x.semester||""}`:key==="rooms"?x.type||"Room":x.day||"Time Slot"}</span>
            </div>
            <span className="master-status">Active</span>
          </div>
          <div className="master-card-details">
            {key==="programs" && <>
              <div><small>Department</small><strong>{x.department||"—"}</strong></div>
              <div><small>Duration</small><strong>{x.durationYears||"—"} years</strong></div>
            </>}
            {key==="faculty" && <>
              <div><small>Max Days</small><strong>{x.maxWorkingDays||"—"} / week</strong></div>
              <div><small>Max Classes</small><strong>{x.maxClassesPerDay||"—"} / day</strong></div>
              <div className="wide"><small>Available Days</small><strong>{(x.availableDays||[]).join(" · ")||"—"}</strong></div>
            </>}
            {key==="subjects" && <>
              <div><small>Faculty</small><strong className={!refId(x.faculty)?"text-danger":""}>{facultyName||"Not mapped"}</strong></div>
              <div><small>Section</small><strong className={!refId(x.section)?"text-danger":""}>{sectionLabel||"Not mapped"}</strong></div>
              <div><small>Total Sessions</small><strong>{x.totalSessions||"—"}</strong></div>
              <div><small>Max / Week</small><strong>{x.maxClassesPerWeek||x.classesPerWeek||"—"}</strong></div>
              <div><small>Room Type</small><strong>{x.roomType||"—"}</strong></div>
            </>}
            {key==="sections" && <>
              <div><small>Program</small><strong>{x.program||"—"}</strong></div>
              <div><small>Semester</small><strong>{x.semester||"—"}</strong></div>
              <div><small>Max Classes / Day</small><strong>{x.maxClassesPerDay||"—"}</strong></div>
            </>}
            {key==="rooms" && <>
              <div><small>Type</small><strong>{x.type||"—"}</strong></div>
              <div><small>Capacity</small><strong>{x.capacity||"—"} seats</strong></div>
            </>}
            {key==="timeslots" && <>
              <div><small>Day</small><strong>{x.day||"—"}</strong></div>
              <div><small>Time</small><strong>{x.startTime||"—"} – {x.endTime||"—"}</strong></div>
              <div><small>Order</small><strong>{x.order||"—"}</strong></div>
            </>}
          </div>
          <div className="master-card-actions">
            <button className="secondary" onClick={()=>edit(x)}>Edit</button>
            <button className="icon-btn danger-btn" onClick={()=>del(x._id)} title="Delete"><Trash2 size={16}/></button>
          </div>
        </article>
      })}
      {!list.length && <div className="master-empty"><BookOpen size={28}/><h3>No {type.toLowerCase()} yet</h3><p>Add your first {type.slice(0,-1).toLowerCase()} using the form above.</p></div>}
    </div>
  </div>
}

function AvailabilityMatrix({data,reload,setMessage}){
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


function ExcelImport({reload,setMessage}){
  const [file,setFile]=useState(null);
  const [busy,setBusy]=useState(false);
  const [result,setResult]=useState(null);

  async function downloadTemplate(){
    try{
      const response=await axios.get(`${API}/import/template`,{responseType:"blob"});
      const url=URL.createObjectURL(response.data);
      const a=document.createElement("a"); a.href=url; a.download="timetable-import-template.xlsx"; a.click(); URL.revokeObjectURL(url);
    }catch(e){setMessage(e.response?.data?.message||e.message)}
  }

  async function upload(){
    if(!file){setMessage("Please select an Excel file first.");return;}
    setBusy(true); setMessage(""); setResult(null);
    try{
      const fd=new FormData(); fd.append("file",file);
      const r=await axios.post(`${API}/import/excel`,fd,{headers:{"Content-Type":"multipart/form-data"}});
      setResult(r.data.imported); await reload(); setMessage("Excel data imported successfully.");
    }catch(e){setMessage(e.response?.data?.message||e.message)}finally{setBusy(false)}
  }

  return <div className="panel import-panel">
    <div className="import-hero"><div><span className="pill light">EXCEL IMPORT</span><h2>Import your real timetable master data.</h2><p>Use the template to load programs, faculty, sections, rooms, time slots, subjects and period-wise availability into the local MongoDB database.</p></div><FileSpreadsheet size={52}/></div>
    <div className="import-actions"><button className="secondary" onClick={downloadTemplate}><FileSpreadsheet size={17}/> Download Excel Template</button><label className="file-picker"><Upload size={17}/><span>{file?file.name:"Choose Excel file"}</span><input type="file" accept=".xlsx" onChange={e=>setFile(e.target.files?.[0]||null)}/></label><button className="primary" onClick={upload} disabled={busy}>{busy?"Importing...":"Import to MongoDB"}</button></div>
    <div className="import-grid"><div><h3>Required sheets</h3><ul><li>Programs</li><li>Faculty</li><li>Sections</li><li>Rooms</li><li>TimeSlots</li><li>Subjects</li></ul></div><div><h3>Optional sheet</h3><ul><li>Availability — one row per faculty/day/period</li></ul><p>Example: <code>Dr. Amit Sharma | Monday | 09:00 | 10:00 | Yes</code></p></div></div>
    {result&&<div className="import-result">Imported: {Object.entries(result).map(([k,v])=><span key={k}><strong>{v}</strong> {k}</span>)}</div>}
  </div>
}


function SchedulerSettings({settings,setSettings,setMessage}){
  const [saving,setSaving]=useState(false);

  const update=(key,value)=>{
    setSettings(prev=>({...prev,[key]:value}));
  };

  async function save(){
    setSaving(true);
    setMessage("");
    try{
      const payload={
        maxConsecutiveFaculty:Number(settings.maxConsecutiveFaculty||2),
        maxConsecutiveSection:Number(settings.maxConsecutiveSection||3),
        avoidSameSubjectSameDay:Boolean(settings.avoidSameSubjectSameDay),
        distributeSubjectAcrossDays:Boolean(settings.distributeSubjectAcrossDays),
        avoidFirstLastPeriod:Boolean(settings.avoidFirstLastPeriod),
        generationRuns:Number(settings.generationRuns||8),
        generationTimeLimitMs:Number(settings.generationTimeLimitMs||30000)
      };
      const r=await axios.put(`${API}/settings`,payload);
      setSettings(r.data);
      setMessage("Scheduler settings saved successfully.");
    }catch(e){
      setMessage(e.response?.data?.message||e.message);
    }finally{
      setSaving(false);
    }
  }

  return <div className="panel">
    <div className="panel-head">
      <div>
        <h3>Scheduler Settings</h3>
        <p>Configure the rules used by the timetable generator.</p>
      </div>
    </div>

    <div className="settings-grid">
      <div className="field">
        <label>Max Consecutive Classes — Faculty</label>
        <input
          type="number"
          min="1"
          max="8"
          value={settings.maxConsecutiveFaculty??2}
          onChange={e=>update("maxConsecutiveFaculty",e.target.value)}
        />
      </div>

      <div className="field">
        <label>Max Consecutive Classes — Section</label>
        <input
          type="number"
          min="1"
          max="8"
          value={settings.maxConsecutiveSection??3}
          onChange={e=>update("maxConsecutiveSection",e.target.value)}
        />
      </div>

      <label className="setting-check">
        <input
          type="checkbox"
          checked={!!settings.avoidSameSubjectSameDay}
          onChange={e=>update("avoidSameSubjectSameDay",e.target.checked)}
        />
        <span>
          <strong>Avoid Same Subject Same Day</strong>
          <small>Do not place repeated sessions of the same subject on one day.</small>
        </span>
      </label>

      <label className="setting-check">
        <input
          type="checkbox"
          checked={!!settings.distributeSubjectAcrossDays}
          onChange={e=>update("distributeSubjectAcrossDays",e.target.checked)}
        />
        <span>
          <strong>Distribute Subject Across Days</strong>
          <small>Spread weekly subject sessions across different days where possible.</small>
        </span>
      </label>

      <div className="field"><label>Generation Comparison Runs</label><input type="number" min="1" max="20" value={settings.generationRuns??8} onChange={e=>update("generationRuns",e.target.value)} /><small className="field-help">Generate multiple candidates and keep the best-scoring timetable.</small></div>
      <div className="field"><label>Total Generation Time (seconds)</label><input type="number" min="5" max="60" value={Math.round(Number(settings.generationTimeLimitMs??30000)/1000)} onChange={e=>update("generationTimeLimitMs",Math.max(5,Math.min(60,Number(e.target.value||30)))*1000)} /><small className="field-help">The time budget is shared across candidate generations.</small></div>

      <label className="setting-check">
        <input
          type="checkbox"
          checked={!!settings.avoidFirstLastPeriod}
          onChange={e=>update("avoidFirstLastPeriod",e.target.checked)}
        />
        <span>
          <strong>Avoid First / Last Period</strong>
          <small>Try not to use the first or last period.</small>
        </span>
      </label>
    </div>

    <div className="settings-footer">
      <button className="primary" onClick={save} disabled={saving}>
        {saving?"Saving...":"Save Settings"}
      </button>
    </div>
  </div>;
}

function Input({label,value,onChange,type="text"}){return <div className="field"><label>{label}</label><input type={type} value={value||""} onChange={e=>onChange(e.target.value)} /></div>}
function Select({label,value,onChange,options}){return <div className="field"><label>{label}</label><select value={value||""} onChange={e=>onChange(e.target.value)}><option value="">Select...</option>{options.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div>}

function TimetableView({timetable, data, onMoved, timetableStatus, setTimetableStatus, setMessage, approvalHistory=[]}={}){
  const entries=timetable?.entries||[];
  const [viewMode,setViewMode]=useState("Section");
  const [selected,setSelected]=useState("");
  const [draggedEntry,setDraggedEntry]=useState(null);
  const [moving,setMoving]=useState(false);
  const [moveMessage,setMoveMessage]=useState("");
  const [roomChanging,setRoomChanging]=useState(false);

  const periodSlots=useMemo(()=>{
    const seen=new Set();
    return [...(data?.timeslots||[])]
      .filter(s=>!s.isBreak)
      .sort((a,b)=>Number(a.order||0)-Number(b.order||0))
      .filter(s=>{
        const key=`${s.startTime}-${s.endTime}`;
        if(seen.has(key)) return false;
        seen.add(key); return true;
      });
  },[data?.timeslots]);

  const sections=data?.sections||[];
  const faculty=data?.faculty||[];
  const rooms=data?.rooms||[];

  const idOfLocal=refId;

  useEffect(()=>{
    const list=viewMode==="Section"?sections:viewMode==="Faculty"?faculty:rooms;
    if(!list.length){setSelected("");return;}
    if(!list.some(x=>idOfLocal(x)===selected)) setSelected(idOfLocal(list[0]));
  },[viewMode,sections,faculty,rooms,selected]);

  const selectedItem=useMemo(()=>{
    const list=viewMode==="Section"?sections:viewMode==="Faculty"?faculty:rooms;
    return list.find(x=>idOfLocal(x)===selected)||list[0];
  },[viewMode,sections,faculty,rooms,selected]);

  const rows=useMemo(()=>{
    if(!selectedItem) return [];
    const sid=idOfLocal(selectedItem);
    return entries.filter(e=>{
      if(viewMode==="Section") return idOfLocal(e.section)===sid;
      if(viewMode==="Faculty") return idOfLocal(e.faculty)===sid;
      return idOfLocal(e.room)===sid;
    });
  },[entries,viewMode,selectedItem]);

  const viewLabel=viewMode==="Section"?"Section-wise":viewMode==="Faculty"?"Faculty-wise":"Room-wise";
  const selectedLabel=viewMode==="Section"
    ? `${selectedItem?.program||""} ${selectedItem?.semester||""} - ${selectedItem?.name||""}`
    : selectedItem?.name||"";

  function slotIsOccupied(entry,slot){
    if(!entry) return false;
    if(entry.day!==slot.day) return false;
    const start=Number(entry.order||0);
    const order=Number(slot.order||0);
    return order>=start && order<start+Math.max(1,Number(entry.duration||1));
  }

  function entryForCell(day,slot){
    return rows.find(e=>e.day===day && slotIsOccupied(e,slot));
  }

  function isEntryStart(entry,slot){
    return entry && entry.day===slot.day && Number(entry.order||0)===Number(slot.order||0);
  }

  async function moveEntry(entry,day,slot){
    if(!entry || moving || timetableStatus!=="DRAFT") return;
    if(entry.day===day && Number(entry.order||0)===Number(slot.order||0)) return;

    setMoving(true); setMoveMessage("");
    try{
      const r=await axios.patch(`${API}/timetable/move`,{
        entryId:entry._id,
        day,
        startTime:slot.startTime
      });
      setMoveMessage(r.data?.message||"Class moved successfully.");
      if(onMoved) await onMoved();
    }catch(e){
      setMoveMessage(e.response?.data?.message||e.message||"Unable to move this class.");
    }finally{
      setMoving(false); setDraggedEntry(null);
    }
  }

  async function changeRoom(entry,roomId){
    if(!entry || !roomId || roomChanging || timetableStatus!=="DRAFT") return;
    if(refId(entry.room)===String(roomId)) return;
    setRoomChanging(true); setMoveMessage("");
    try{
      const r=await axios.patch(`${API}/timetable/entry/${entry._id}/room`,{roomId});
      setMoveMessage(r.data?.message||"Room changed successfully.");
      if(onMoved) await onMoved();
    }catch(e){
      setMoveMessage(e.response?.data?.message||e.message||"Unable to change room.");
    }finally{setRoomChanging(false)}
  }

  const [approvalNote,setApprovalNote]=useState("");
  const [approvalBusy,setApprovalBusy]=useState(false);

  function needsApprovalNote(status){
    return (timetableStatus === "SUBMITTED" && ["DRAFT","APPROVED"].includes(status)) ||
      (timetableStatus === "APPROVED" && status === "SUBMITTED") ||
      (timetableStatus === "LOCKED" && status === "PUBLISHED");
  }

  async function changeStatus(status){
    const note=approvalNote.trim();
    if(needsApprovalNote(status) && note.length<3){
      setMoveMessage("Remarks are required for this workflow action (minimum 3 characters).");
      return;
    }
    setApprovalBusy(true);
    try{
      const r=await axios.patch(`${API}/timetable/status`,{status,note});
      setTimetableStatus(r.data?.timetable?.status||status);
      setApprovalNote("");
      setMoveMessage(r.data?.message||`Status changed to ${status}.`);
      if(onMoved) await onMoved();
    }catch(e){setMoveMessage(e.response?.data?.message||e.message)}finally{setApprovalBusy(false)}
  }

  return <div className="panel">
    <div className="toolbar">
      <div><h3>{viewLabel} Timetable</h3><p>View the generated schedule by section, faculty or room. Multi-period classes occupy consecutive periods.</p></div>
      <div className="toolbar-actions">
        <button className="secondary" onClick={()=>window.open(`${API}/timetable/export/excel`,"_blank")}>Excel</button>
        <button className="secondary" onClick={()=>window.open(`${API}/timetable/export/pdf`,"_blank")}>PDF</button>
      </div>
    </div>

    <div className="status-bar">
      <div className={`status-badge ${String(timetableStatus||"DRAFT").toLowerCase()}`}><ShieldCheck size={16}/> {timetableStatus||"DRAFT"}</div>
      <div className="status-actions">
        {timetableStatus==="DRAFT" && <button className="secondary" disabled={approvalBusy} onClick={()=>changeStatus("SUBMITTED")}><Send size={15}/> Submit for Review</button>}
        {timetableStatus==="SUBMITTED" && <><button className="secondary" disabled={approvalBusy} onClick={()=>changeStatus("DRAFT")}><RotateCcw size={15}/> Return to Draft</button><button className="primary" disabled={approvalBusy} onClick={()=>changeStatus("APPROVED")}><Check size={15}/> Approve</button></>}
        {timetableStatus==="APPROVED" && <><button className="secondary" disabled={approvalBusy} onClick={()=>changeStatus("SUBMITTED")}><RotateCcw size={15}/> Request Changes</button><button className="primary" disabled={approvalBusy} onClick={()=>changeStatus("PUBLISHED")}><Send size={15}/> Publish</button></>}
        {timetableStatus==="PUBLISHED" && <button className="primary" disabled={approvalBusy} onClick={()=>changeStatus("LOCKED")}><Lock size={15}/> Lock Timetable</button>}
        {timetableStatus==="LOCKED" && <button className="secondary" disabled={approvalBusy} onClick={()=>changeStatus("PUBLISHED")}><Lock size={15}/> Unlock to Published</button>}
      </div>
      {!["DRAFT"].includes(timetableStatus) && <div className="approval-note-box">
        <label>Workflow remarks (required when returning, approving, requesting changes, or unlocking)
          <textarea value={approvalNote} onChange={e=>setApprovalNote(e.target.value)} placeholder="Add approval, publication, return, or change-request remarks..." rows={2}/>
        </label>
      </div>}
    </div>

    <div className="view-switcher">{["Section","Faculty","Room"].map(mode=><button key={mode} className={viewMode===mode?"view-tab active":"view-tab"} onClick={()=>{setViewMode(mode);setSelected("");setMoveMessage("")}}>{mode==="Section"?"Section-wise":mode==="Faculty"?"Faculty-wise":"Room-wise"}</button>)}</div>

    <div className="view-filter">
      <div className="field"><label>{viewMode==="Section"?"Select Section":viewMode==="Faculty"?"Select Faculty":"Select Room"}</label>
        <select value={idOfLocal(selectedItem)||""} onChange={e=>setSelected(e.target.value)}>
          {(viewMode==="Section"?sections:viewMode==="Faculty"?faculty:rooms).map(x=><option key={idOfLocal(x)} value={idOfLocal(x)}>{viewMode==="Section"?`${x.program||""} ${x.semester||""} - ${x.name||""}`:x.name}</option>)}
        </select>
      </div>
      <div className="selected-summary"><strong>{selectedLabel||"No selection"}</strong><span>{rows.length} scheduled class{rows.length===1?"":"es"}</span></div>
    </div>

    {moveMessage && <div className="move-message">{moveMessage}</div>}
    {timetableStatus!=="DRAFT" && timetableStatus!=="LOCKED" && <div className="move-message locked"><Lock size={15}/> Timetable is {timetableStatus}. Return it to Draft before making changes.</div>}
    {timetableStatus==="LOCKED" && <div className="move-message locked"><Lock size={15}/> Timetable is locked. Unlock it and return it to Draft before making changes.</div>}
    {moving && <div className="move-message loading">Checking all occupied periods and moving class...</div>}

    {!periodSlots.length ? <div className="empty-state"><h3>No time slots configured</h3><p>Add Time Slots first, then generate the timetable.</p></div> : !selectedItem ? <div className="empty-state"><h3>No {viewMode.toLowerCase()} found</h3><p>Add the required master data first.</p></div> : <div className="tt-grid">
      <div className="tt-head">Time</div>{days.map(d=><div className="tt-head" key={d}>{d}</div>)}
      {periodSlots.map(slot=>{
        const time=`${slot.startTime}-${slot.endTime}`;
        return <React.Fragment key={slot._id||time}>
          <div className="time">{slot.startTime}-{slot.endTime}</div>
          {days.map(day=>{
            const cellSlot={...slot,day};
            const e=entryForCell(day,cellSlot);
            const start=isEntryStart(e,cellSlot);
            return <div className={`cell ${draggedEntry && timetableStatus==="DRAFT"?"drop-zone":""}`} key={`${day}-${time}`}
              onDragOver={ev=>{if(timetableStatus!=="DRAFT")return;ev.preventDefault();ev.dataTransfer.dropEffect="move"}}
              onDrop={ev=>{ev.preventDefault();if(draggedEntry)moveEntry(draggedEntry,day,slot)}}>
              {e && start ? <div className="tt-entry" draggable={!moving&&timetableStatus==="DRAFT"} onDragStart={ev=>{setDraggedEntry(e);setMoveMessage("");ev.dataTransfer.effectAllowed="move";ev.dataTransfer.setData("text/plain",e._id||"")}} onDragEnd={()=>setDraggedEntry(null)} title={e.duration>1?`Multi-period class: ${e.duration} periods`:"Drag to another period"}>
                <strong>{e.subject?.name||"Subject"}</strong>
                {e.duration>1 && <b>{e.duration} periods</b>}
                {viewMode!=="Faculty"&&<span>{e.faculty?.name||"Faculty"}</span>}
                {viewMode!=="Room"&&<small>{e.room?.name||"Room"}</small>}
                {viewMode!=="Section"&&<small>{e.section?.name||"Section"}</small>}
                {timetableStatus==="DRAFT" && <select className="tt-room-select" value={refId(e.room)} disabled={roomChanging} onChange={ev=>changeRoom(e,ev.target.value)} onClick={ev=>ev.stopPropagation()} onMouseDown={ev=>ev.stopPropagation()}><option value={refId(e.room)}>{e.room?.name||"Current room"}</option>{rooms.filter(r=>refId(r)!==refId(e.room)).map(r=><option key={refId(r)} value={refId(r)}>{r.name}</option>)}</select>}
                <em>↕ Drag</em>
              </div> : e ? <div className="tt-continuation">↳ {e.subject?.name||"Continued"}</div> : <span className="muted">—</span>}
            </div>
          })}
        </React.Fragment>
      })}
    </div>}

    {(approvalHistory?.length || timetable?.approvalHistory?.length) ? <section className="approval-history panel">
      <div className="panel-head"><div><h3>Approval History</h3><p>Every workflow transition is recorded with remarks and user details.</p></div></div>
      <div className="table-wrap"><table><thead><tr><th>Date/Time</th><th>From</th><th>To</th><th>User</th><th>Role</th><th>Remarks</th></tr></thead><tbody>{(timetable?.approvalHistory||approvalHistory||[]).slice().reverse().map((h,i)=><tr key={h._id||i}><td>{h.changedAt?new Date(h.changedAt).toLocaleString():"—"}</td><td>{h.from||"—"}</td><td><span className={`status-badge ${String(h.to||"").toLowerCase()}`}>{h.to}</span></td><td>{h.user?.name||h.username||"—"}</td><td>{h.role||"—"}</td><td>{h.note||"—"}</td></tr>)}</tbody></table></div>
    </section> : null}
    {timetable?.warnings?.length>0&&<div className="warning">{timetable.warnings.join(" ")}</div>}
  </div>;
}

export default ERPWorkspace;


function localToday(){return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date())}

function Students({data,reload,setMessage}){
  const blank={admissionNo:"",rollNo:"",name:"",email:"",phone:"",gender:"",dateOfBirth:"",fatherName:"",motherName:"",category:"",address:"",city:"",state:"",pincode:"",programId:"",semester:"",section:"",active:true,admissionDate:""};
  const [form,setForm]=useState(blank),[editingId,setEditingId]=useState(null),[saving,setSaving]=useState(false),[q,setQ]=useState(""),[programFilter,setProgramFilter]=useState(""),[semesterFilter,setSemesterFilter]=useState(""),[sectionFilter,setSectionFilter]=useState(""),[statusFilter,setStatusFilter]=useState("ALL"),[activeFormTab,setActiveFormTab]=useState("ACADEMIC");
  const programs=data.programs||[],sections=data.sections||[],students=data.students||[];
  const findProgram=s=>programs.find(p=>refId(p)===String(s?.programId||s?.section?.programId||"")||String(p.name||"").toLowerCase()===String(s?.section?.program||s?.program||"").toLowerCase()||String(p.code||"").toLowerCase()===String(s?.section?.program||s?.program||"").toLowerCase());
  const filteredSections=sections.filter(s=>!form.programId||String(s.programId||"")===form.programId||String(s.program||"").toLowerCase()===String(programs.find(p=>refId(p)===form.programId)?.name||"").toLowerCase()||String(s.program||"").toLowerCase()===String(programs.find(p=>refId(p)===form.programId)?.code||"").toLowerCase()).filter(s=>!form.semester||String(s.semester)===String(form.semester));
  const formSemesters=[...new Set(sections.filter(s=>!form.programId||String(s.programId||"")===form.programId||String(s.program||"").toLowerCase()===String(programs.find(p=>refId(p)===form.programId)?.name||"").toLowerCase()||String(s.program||"").toLowerCase()===String(programs.find(p=>refId(p)===form.programId)?.code||"").toLowerCase()).map(s=>String(s.semester||"")).filter(Boolean))];
  const filterSections=sections.filter(s=>!programFilter||String(s.programId||"")===programFilter||String(s.program||"").toLowerCase()===String(programs.find(p=>refId(p)===programFilter)?.name||"").toLowerCase()||String(s.program||"").toLowerCase()===String(programs.find(p=>refId(p)===programFilter)?.code||"").toLowerCase()).filter(s=>!semesterFilter||String(s.semester)===semesterFilter);
  const filterSemesters=[...new Set(filterSections.map(s=>String(s.semester||"")).filter(Boolean))];
  const list=students.filter(s=>!sectionFilter||refId(s.section)===sectionFilter).filter(s=>!programFilter||String(s.section?.programId||"")===programFilter||String(s.section?.program||"").toLowerCase()===String(programs.find(p=>refId(p)===programFilter)?.name||"").toLowerCase()||String(s.section?.program||"").toLowerCase()===String(programs.find(p=>refId(p)===programFilter)?.code||"").toLowerCase()).filter(s=>!semesterFilter||String(s.section?.semester)===semesterFilter).filter(s=>statusFilter==="ALL"||(statusFilter==="ACTIVE"?s.active!==false:s.active===false)).filter(s=>!q||`${s.name} ${s.admissionNo} ${s.rollNo} ${s.email||""} ${s.phone||""}`.toLowerCase().includes(q.toLowerCase()));
  const activeCount=students.filter(s=>s.active!==false).length;
  function edit(s){const p=findProgram(s);setEditingId(s._id);setForm({admissionNo:s.admissionNo||"",rollNo:s.rollNo||"",name:s.name||"",email:s.email||"",phone:s.phone||"",gender:s.gender||"",dateOfBirth:s.dateOfBirth?String(s.dateOfBirth).slice(0,10):"",fatherName:s.fatherName||"",motherName:s.motherName||"",category:s.category||"",address:s.address||"",city:s.city||"",state:s.state||"",pincode:s.pincode||"",programId:p?._id||s.section?.programId||"",semester:s.section?.semester||"",section:refId(s.section),active:s.active!==false,admissionDate:s.admissionDate?String(s.admissionDate).slice(0,10):""});setActiveFormTab("ACADEMIC");window.scrollTo({top:0,behavior:"smooth"})}
  function reset(){setEditingId(null);setForm(blank);setActiveFormTab("ACADEMIC")}
  function updateForm(patch){setForm(prev=>({...prev,...patch}))}
  async function save(){if(!form.admissionNo||!form.rollNo||!form.name||!form.section)return setMessage("Admission No, Roll No, Name and Section are required.");setSaving(true);try{const body={...form,programId:undefined,semester:undefined};delete body.programId;delete body.semester;if(editingId)await axios.put(`${API}/students/${editingId}`,body);else await axios.post(`${API}/students`,body);setMessage(editingId?"Student updated successfully.":"Student added successfully.");reset();await reload()}catch(e){setMessage(e.response?.data?.message||e.message)}finally{setSaving(false)}}
  async function deactivate(id){if(!confirm("Mark this student inactive? Historical attendance will be retained."))return;try{await axios.delete(`${API}/students/${id}`);await reload();setMessage("Student marked inactive.")}catch(e){setMessage(e.response?.data?.message||e.message)}}
  return <div className="students-page">
    <section className="student-management-hero"><div><span className="master-settings-eyebrow">PEOPLE & STUDENTS</span><h2>Student Management</h2><p>Maintain complete student records and keep every student correctly mapped to Program → Semester → Section.</p></div><div className="student-kpi-grid"><div><strong>{students.length}</strong><span>Total</span></div><div><strong>{activeCount}</strong><span>Active</span></div><div><strong>{students.length-activeCount}</strong><span>Inactive</span></div><div><strong>{new Set(students.map(s=>refId(s.section)).filter(Boolean)).size}</strong><span>Sections</span></div></div></section>
    <section className="panel student-form-panel"><div className="panel-head"><div><h3>{editingId?"Edit Student":"Add Student"}</h3><p>Fields are aligned with the Excel import template. Academic mapping is controlled by the Program and Section masters.</p></div>{editingId&&<button className="secondary" onClick={reset}>Cancel Edit</button>}</div>
      <div className="student-form-tabs"><button className={activeFormTab==="ACADEMIC"?"active":""} onClick={()=>setActiveFormTab("ACADEMIC")}>Academic Mapping</button><button className={activeFormTab==="IDENTITY"?"active":""} onClick={()=>setActiveFormTab("IDENTITY")}>Student Identity</button><button className={activeFormTab==="CONTACT"?"active":""} onClick={()=>setActiveFormTab("CONTACT")}>Contact & Family</button></div>
      <div className="form-grid">
        {activeFormTab==="ACADEMIC"&&<><Select label="Program" value={form.programId} options={[["","Select Program"],...programs.filter(p=>p.active!==false).map(p=>[p._id,`${p.name}${p.code?` (${p.code})`:""}`])]} onChange={v=>updateForm({programId:v,semester:"",section:""})}/><Select label="Semester" value={form.semester} options={[["","Select Semester"],...formSemesters.map(s=>[s,s])]} onChange={v=>updateForm({semester:v,section:""})}/><Select label="Section" value={form.section} options={[["","Select Section"],...filteredSections.map(s=>[s._id,`${s.name} · Semester ${s.semester}`])]} onChange={v=>updateForm({section:v})}/><Input label="Admission Date" type="date" value={form.admissionDate} onChange={v=>updateForm({admissionDate:v})}/><div className="field"><label>Status</label><label style={{display:"flex",gap:8,alignItems:"center"}}><input type="checkbox" checked={form.active!==false} onChange={e=>updateForm({active:e.target.checked})}/> Active student</label></div></>}
        {activeFormTab==="IDENTITY"&&<><Input label="Admission No *" value={form.admissionNo} onChange={v=>updateForm({admissionNo:v})}/><Input label="Roll No *" value={form.rollNo} onChange={v=>updateForm({rollNo:v})}/><Input label="Student Name *" value={form.name} onChange={v=>updateForm({name:v})}/><Select label="Gender" value={form.gender} options={[["","Select"],["Male","Male"],["Female","Female"],["Other","Other"]]} onChange={v=>updateForm({gender:v})}/><Input label="Date of Birth" type="date" value={form.dateOfBirth} onChange={v=>updateForm({dateOfBirth:v})}/><Input label="Category" value={form.category} onChange={v=>updateForm({category:v})}/></>}
        {activeFormTab==="CONTACT"&&<><Input label="Email" value={form.email} onChange={v=>updateForm({email:v})}/><Input label="Phone" value={form.phone} onChange={v=>updateForm({phone:v})}/><Input label="Father Name" value={form.fatherName} onChange={v=>updateForm({fatherName:v})}/><Input label="Mother Name" value={form.motherName} onChange={v=>updateForm({motherName:v})}/><Input label="Address" value={form.address} onChange={v=>updateForm({address:v})}/><Input label="City" value={form.city} onChange={v=>updateForm({city:v})}/><Input label="State" value={form.state} onChange={v=>updateForm({state:v})}/><Input label="Pincode" value={form.pincode} onChange={v=>updateForm({pincode:v})}/></>}
      </div>
      <div className="form-actions"><button className="primary" onClick={save} disabled={saving}>{saving?(editingId?"Updating...":"Adding..."):(editingId?"Update Student":"Add Student")}</button></div>
    </section>
    <section className="panel"><div className="panel-head"><div><h3>Student Directory</h3><p>Search and filter students by their academic mapping and status.</p></div><span className="status-badge approved">{list.length} shown</span></div><div className="view-filter student-directory-filters"><input placeholder="Search name, admission, roll, email or phone..." value={q} onChange={e=>setQ(e.target.value)}/><select value={programFilter} onChange={e=>{setProgramFilter(e.target.value);setSemesterFilter("");setSectionFilter("")}}><option value="">All Programs</option>{programs.map(p=><option key={p._id} value={p._id}>{p.name}</option>)}</select><select value={semesterFilter} onChange={e=>{setSemesterFilter(e.target.value);setSectionFilter("")}}><option value="">All Semesters</option>{filterSemesters.map(s=><option key={s}>{s}</option>)}</select><select value={sectionFilter} onChange={e=>setSectionFilter(e.target.value)}><option value="">All Sections</option>{filterSections.map(s=><option key={s._id} value={s._id}>{s.name} · Sem {s.semester}</option>)}</select><select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="ALL">All Status</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></div><div className="table-wrap"><table><thead><tr><th>Student</th><th>Admission / Roll</th><th>Program</th><th>Semester</th><th>Section</th><th>Status</th><th>Actions</th></tr></thead><tbody>{list.map(s=><tr key={s._id}><td><strong>{s.name}</strong><div className="muted">{s.email||s.phone||""}</div></td><td>{s.admissionNo}<br/><span className="muted">{s.rollNo}</span></td><td>{s.section?.program||"—"}</td><td>{s.section?.semester||"—"}</td><td>{s.section?.name||"—"}</td><td>{s.active!==false?<span className="status-badge approved">ACTIVE</span>:<span className="status-badge">INACTIVE</span>}</td><td><div style={{display:"flex",gap:6}}><button className="secondary" onClick={()=>edit(s)}>Edit</button>{s.active!==false&&<button className="secondary" onClick={()=>deactivate(s._id)}>Deactivate</button>}</div></td></tr>)}{!list.length&&<tr><td colSpan="7">No students found.</td></tr>}</tbody></table></div></section>
  </div>
}

function StudentMapping({data,reload,setMessage}){
  const [programId,setProgramId]=useState("");
  const [semester,setSemester]=useState("");
  const [sectionId,setSectionId]=useState("");
  const [q,setQ]=useState("");
  const [selected,setSelected]=useState([]);
  const [targetSection,setTargetSection]=useState("");
  const [saving,setSaving]=useState(false);
  const programs=data.programs||[], sections=data.sections||[], students=data.students||[];
  const programForSection=s=>{
    const raw=String(s?.program||"").toLowerCase();
    return programs.find(p=>refId(p)===String(s?.programId||"") || String(p.name||"").toLowerCase()===raw || String(p.code||"").toLowerCase()===raw);
  };
  const programSections=sections.filter(s=>!programId||String(s.programId||"")===programId || programForSection(s)?._id===programId || String(s.program||"").toLowerCase()===(programs.find(p=>refId(p)===programId)?.name||"").toLowerCase() || String(s.program||"").toLowerCase()===(programs.find(p=>refId(p)===programId)?.code||"").toLowerCase());
  const semesters=[...new Set(programSections.map(s=>String(s.semester||"")).filter(Boolean))];
  const visibleSections=programSections.filter(s=>!semester||String(s.semester)===semester);
  const list=students.filter(s=>!sectionId||refId(s.section)===sectionId).filter(s=>!q||`${s.name} ${s.admissionNo} ${s.rollNo}`.toLowerCase().includes(q.toLowerCase()));
  const destinationProgram=programs.find(p=>refId(p)===programId);
  const destinationSections=sections.filter(s=>{
    const matchesProgram=destinationProgram && (String(s.programId||"")===programId || String(s.program||"").toLowerCase()===String(destinationProgram.name||"").toLowerCase() || String(s.program||"").toLowerCase()===String(destinationProgram.code||"").toLowerCase());
    return matchesProgram && (!semester || String(s.semester)===String(semester));
  });
  const destinationSemesters=[...new Set(sections.filter(s=>destinationProgram && (String(s.programId||"")===programId || String(s.program||"").toLowerCase()===String(destinationProgram.name||"").toLowerCase() || String(s.program||"").toLowerCase()===String(destinationProgram.code||"").toLowerCase())).map(s=>String(s.semester||"")).filter(Boolean))];
  const toggle=id=>setSelected(a=>a.includes(id)?a.filter(x=>x!==id):[...a,id]);
  const selectAll=()=>setSelected(selected.length===list.length&&list.length?[]:list.map(s=>s._id));
  async function mapSelected(){
    if(!targetSection)return setMessage("Select a target section.");
    if(!selected.length)return setMessage("Select at least one student.");
    setSaving(true);
    try{const r=await axios.post(`${API}/students/bulk-map`,{studentIds:selected,section:targetSection});setMessage(r.data?.message||"Students mapped successfully.");setSelected([]);await reload();}
    catch(e){setMessage(e.response?.data?.message||e.message)}finally{setSaving(false)}
  }
  return <div className="student-mapping-page">
    <section className="student-mapping-hero"><div><span className="master-settings-eyebrow">PEOPLE & STUDENTS</span><h2>Student Mapping</h2><p>Map students to the correct Program, Semester and Section in bulk without editing each student individually.</p></div><div className="student-mapping-stat"><strong>{students.filter(s=>s.active!==false).length}</strong><span>active students</span></div></section>
    <section className="panel"><div className="panel-head"><div><h3>Source Mapping</h3><p>Filter students by their current academic mapping.</p></div><span className="status-badge approved">{selected.length} selected</span></div>
      <div className="form-grid student-map-filters">
        <Select label="Program" value={programId} options={[["","All Programs"],...programs.filter(p=>p.active!==false).map(p=>[p._id,`${p.name}${p.code?` (${p.code})`:""}`])]} onChange={v=>{setProgramId(v);setSemester("");setSectionId("")}}/>
        <Select label="Semester" value={semester} options={[["","All Semesters"],...semesters.map(x=>[x,x])]} onChange={v=>{setSemester(v);setSectionId("")}}/>
        <Select label="Current Section" value={sectionId} options={[["","All Sections"],...visibleSections.map(s=>[s._id,`${s.name} · Sem ${s.semester}`])]} onChange={setSectionId}/>
        <Input label="Search Student" value={q} onChange={setQ}/>
      </div>
    </section>
    <section className="panel"><div className="panel-head"><div><h3>Student Roster</h3><p>{list.length} students match the current filters.</p></div><button className="secondary" onClick={selectAll}>{selected.length===list.length&&list.length?"Clear Selection":"Select All"}</button></div>
      <div className="table-wrap"><table><thead><tr><th><input type="checkbox" checked={!!list.length&&selected.length===list.length} onChange={selectAll}/></th><th>Student</th><th>Admission / Roll</th><th>Current Program</th><th>Semester</th><th>Section</th></tr></thead><tbody>{list.map(s=><tr key={s._id}><td><input type="checkbox" checked={selected.includes(s._id)} onChange={()=>toggle(s._id)}/></td><td><strong>{s.name}</strong><div className="muted">{s.email||s.phone||""}</div></td><td>{s.admissionNo} · {s.rollNo}</td><td>{s.section?.program||"—"}</td><td>{s.section?.semester||"—"}</td><td>{s.section?.name||"—"}</td></tr>)}{!list.length&&<tr><td colSpan="6">No students found.</td></tr>}</tbody></table></div>
    </section>
    <section className="panel student-map-target"><div className="panel-head"><div><h3>Map Selected Students</h3><p>Select the destination Program/Section. Students will be moved together and the existing promotion history remains available.</p></div></div><div className="form-grid"><Select label="Destination Program" value={programId} options={[["","Select Program"],...programs.filter(p=>p.active!==false).map(p=>[p._id,`${p.name}${p.code?` (${p.code})`:""}`])]} onChange={v=>{setProgramId(v);setSemester("");setTargetSection("")}}/><Select label="Destination Semester" value={semester} options={[["","Select Semester"],...destinationSemesters.map(x=>[x,x])]} onChange={v=>{setSemester(v);setTargetSection("")}}/><Select label="Destination Section" value={targetSection} options={[["","Select Section"],...destinationSections.map(x=>[x._id,`${x.name} · Semester ${x.semester}`])]} onChange={setTargetSection}/><div className="form-actions"><button className="primary" onClick={mapSelected} disabled={saving||!selected.length}>{saving?"Mapping...":`Map ${selected.length||0} Student${selected.length===1?"":"s"}`}</button></div></div></section>
  </div>;
}

function StudentProfile({data,setMessage}){
  const [q,setQ]=useState("");
  const [sectionId,setSectionId]=useState("");
  const [selectedId,setSelectedId]=useState("");
  const [profile,setProfile]=useState(null);
  const [loading,setLoading]=useState(false);
  const [view,setView]=useState("OVERVIEW");
  const students=(data.students||[]).filter(s=>!sectionId||refId(s.section)===sectionId).filter(s=>!q||`${s.name} ${s.admissionNo} ${s.rollNo}`.toLowerCase().includes(q.toLowerCase()));
  async function openProfile(id){
    setSelectedId(id);setLoading(true);setView("OVERVIEW");
    try{const r=await axios.get(`${API}/student-profiles/${id}`);setProfile(r.data)}catch(e){setMessage(e.response?.data?.message||e.message);setProfile(null)}finally{setLoading(false)}
  }
  const s=profile?.student;
  const money=v=>`₹${Number(v||0).toLocaleString("en-IN")}`;
  const pct=profile?.summary?.attendance?.percentage||0;
  return <div className="student-profile-page">
    <section className="panel">
      <div className="panel-head"><div><h3>Student Profiles</h3><p>Search a student to view identity, academic history, attendance and fee information in one place.</p></div><span className="status-badge approved">{data.students?.length||0} Students</span></div>
      <div className="profile-search-bar"><div className="profile-search"><Search size={17}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search name, admission no. or roll no..."/></div><select value={sectionId} onChange={e=>setSectionId(e.target.value)}><option value="">All Sections</option>{(data.sections||[]).map(x=><option key={x._id} value={x._id}>{x.program} · {x.semester} · {x.name}</option>)}</select></div>
      <div className="profile-student-grid" style={{marginTop:14}}>{students.slice(0,24).map(x=><button type="button" key={x._id} className={`profile-student-card ${selectedId===x._id?"selected":""}`} onClick={()=>openProfile(x._id)}><div className="profile-student-top"><span className="profile-avatar">{(x.name||"S").slice(0,1).toUpperCase()}</span><span className="profile-student-main"><strong>{x.name}</strong><span>{x.admissionNo} · Roll {x.rollNo}</span><small>{x.section?.program||""} · {x.section?.semester||""} · {x.section?.name||""}</small></span>{x.active!==false?<span className="status-badge approved">Active</span>:<span className="status-badge">Inactive</span>}</div></button>)}{!students.length&&<div className="empty-state" style={{gridColumn:"1/-1"}}><h3>No students found</h3><p>Try a different search or section.</p></div>}</div>
    </section>
    {loading&&<section className="panel"><p>Loading student profile...</p></section>}
    {s&&<>
      <section className="panel">
        <div className="profile-header"><div className="profile-identity"><span className="profile-big-avatar">{(s.name||"S").slice(0,1).toUpperCase()}</span><div><h2>{s.name}</h2><p>{s.admissionNo} · Roll {s.rollNo} · {s.section?.program||""} · {s.section?.semester||""} · {s.section?.name||""}</p></div></div><div className="profile-actions"><span className={`status-badge ${s.active!==false?"approved":""}`}>{s.active!==false?"ACTIVE":"INACTIVE"}</span></div></div>
        <div className="profile-summary" style={{marginTop:18}}><div className="profile-stat"><span>Attendance</span><strong>{pct}%</strong></div><div className="profile-stat"><span>Classes Marked</span><strong>{profile.summary.attendance.marked}</strong></div><div className="profile-stat"><span>Fee Billed</span><strong>{money(profile.summary.fees.billed)}</strong></div><div className="profile-stat"><span>Outstanding</span><strong>{money(profile.summary.fees.balance)}</strong></div></div>
        <div className="profile-tabs"><button className={view==="OVERVIEW"?"active":""} onClick={()=>setView("OVERVIEW")}>Overview</button><button className={view==="ATTENDANCE"?"active":""} onClick={()=>setView("ATTENDANCE")}>Attendance</button><button className={view==="FEES"?"active":""} onClick={()=>setView("FEES")}>Fees</button><button className={view==="ACADEMIC"?"active":""} onClick={()=>setView("ACADEMIC")}>Academic History</button></div>
      </section>
      {view==="OVERVIEW"&&<div className="profile-two-col"><section className="panel"><div className="panel-head"><div><h3>Personal Information</h3><p>Student identity and contact details.</p></div></div><div className="profile-detail-grid"><div className="profile-detail"><span>Gender</span><strong>{s.gender||"—"}</strong></div><div className="profile-detail"><span>Date of Birth</span><strong>{s.dateOfBirth?String(s.dateOfBirth).slice(0,10):"—"}</strong></div><div className="profile-detail"><span>Email</span><strong>{s.email||"—"}</strong></div><div className="profile-detail"><span>Phone</span><strong>{s.phone||"—"}</strong></div><div className="profile-detail"><span>Father's Name</span><strong>{s.fatherName||"—"}</strong></div><div className="profile-detail"><span>Mother's Name</span><strong>{s.motherName||"—"}</strong></div><div className="profile-detail"><span>Category</span><strong>{s.category||"—"}</strong></div><div className="profile-detail"><span>Admission Date</span><strong>{s.admissionDate?String(s.admissionDate).slice(0,10):"—"}</strong></div><div className="profile-detail full" style={{gridColumn:"1/-1"}}><span>Address</span><strong>{[s.address,s.city,s.state,s.pincode].filter(Boolean).join(", ")||"—"}</strong></div></div></section><section className="panel"><div className="panel-head"><div><h3>Academic Snapshot</h3><p>Current enrollment and movement history.</p></div></div><div className="profile-detail-grid"><div className="profile-detail"><span>Current Program</span><strong>{s.section?.program||"—"}</strong></div><div className="profile-detail"><span>Current Semester</span><strong>{s.section?.semester||"—"}</strong></div><div className="profile-detail"><span>Current Section</span><strong>{s.section?.name||"—"}</strong></div><div className="profile-detail"><span>Promotion / Transfer Records</span><strong>{profile.summary.promotions}</strong></div></div><div className="profile-list" style={{marginTop:14}}>{profile.promotions.slice(0,5).map(h=><div className="profile-list-row" key={h._id}><div className="main"><strong>{h.fromSection?.program||""} · {h.fromSection?.semester||""} · {h.fromSection?.name||"—"} → {h.toSection?.program||""} · {h.toSection?.semester||""} · {h.toSection?.name||"—"}</strong><small>{h.action} · {h.academicSession?.name||""}</small></div><small>{h.createdAt?new Date(h.createdAt).toLocaleDateString():""}</small></div>)}{!profile.promotions.length&&<div className="empty-state">No movement history recorded.</div>}</div></section></div>}
      {view==="ATTENDANCE"&&<section className="panel"><div className="panel-head"><div><h3>Attendance History</h3><p>Present and Late are counted as attended. UNMARKED classes are excluded from the percentage.</p></div><span className="status-badge approved">{pct}% Attendance</span></div><div className="profile-summary" style={{marginBottom:16}}>{[["Present",profile.summary.attendance.PRESENT], ["Late",profile.summary.attendance.LATE],["Absent",profile.summary.attendance.ABSENT],["Leave",profile.summary.attendance.LEAVE]].map(([n,v])=><div className="profile-stat" key={n}><span>{n}</span><strong>{v}</strong></div>)}</div><div className="profile-list">{profile.attendance.map(a=><div className="profile-list-row" key={`${a._id}-${a.date}`}><div className="main"><strong>{a.subject?.name||"Subject"}</strong><small>{a.date} · {a.startTime}–{a.endTime} · {a.faculty?.name||""}</small></div><span className={`profile-status-${String(a.status||"").toLowerCase()}`}>{a.status}</span></div>)}{!profile.attendance.length&&<div className="empty-state">No attendance records found.</div>}</div></section>}
      {view==="FEES"&&<div className="profile-two-col"><section className="panel"><div className="panel-head"><div><h3>Fee Invoices</h3><p>Student billing and outstanding balances.</p></div></div><div className="profile-list">{profile.fees.map(i=><div className="profile-list-row" key={i._id}><div className="main"><strong>{i.feeHead?.name||"Fee"} · {i.invoiceNo}</strong><small>{i.academicSession?.name||""} · {i.status}</small></div><div><strong>{money(i.netAmount)}</strong><small>Balance {money(i.balance)}</small></div></div>)}{!profile.fees.length&&<div className="empty-state">No fee invoices found.</div>}</div></section><section className="panel"><div className="panel-head"><div><h3>Payment History</h3><p>Receipts and payment references.</p></div></div><div className="profile-list">{profile.payments.map(p=><div className="profile-list-row" key={p._id}><div className="main"><strong>{p.receiptNo}</strong><small>{p.paymentDate?String(p.paymentDate).slice(0,10):""} · {p.mode}</small></div><strong>{money(p.amount)}</strong></div>)}{!profile.payments.length&&<div className="empty-state">No payments recorded.</div>}</div></section></div>}
      {view==="ACADEMIC"&&<section className="panel"><div className="panel-head"><div><h3>Academic Movement History</h3><p>Every promotion and section transfer recorded for this student.</p></div></div><div className="profile-list">{profile.promotions.map(h=><div className="profile-list-row" key={h._id}><div className="main"><strong>{h.action}: {h.fromSection?.program||""} · {h.fromSection?.semester||""} · {h.fromSection?.name||"—"} → {h.toSection?.program||""} · {h.toSection?.semester||""} · {h.toSection?.name||"—"}</strong><small>{h.academicSession?.name||""}{h.remarks?` · ${h.remarks}`:""}</small></div><small>{h.createdAt?new Date(h.createdAt).toLocaleString():""}</small></div>)}{!profile.promotions.length&&<div className="empty-state">No academic movement history found.</div>}</div></section>}
    </>}
  </div>
}

function StudentPromotion({data,sessions,activeSession,reload,setMessage}){
  const [sessionId,setSessionId]=useState(activeSession?._id||"");
  const [fromSection,setFromSection]=useState("");
  const [toSection,setToSection]=useState("");
  const [students,setStudents]=useState([]);
  const [selected,setSelected]=useState([]);
  const [action,setAction]=useState("PROMOTED");
  const [remarks,setRemarks]=useState("");
  const [q,setQ]=useState("");
  const [saving,setSaving]=useState(false);
  const [history,setHistory]=useState([]);

  useEffect(()=>{if(!sessionId&&activeSession?._id)setSessionId(activeSession._id)},[activeSession?._id]);
  useEffect(()=>{loadStudents();},[fromSection]);
  useEffect(()=>{loadHistory();},[sessionId]);

  async function loadStudents(){
    try{
      const r=await axios.get(`${API}/students?active=true${fromSection?`&sectionId=${fromSection}`:""}`);
      setStudents(r.data||[]);setSelected([]);
    }catch(e){setMessage(e.response?.data?.message||e.message)}
  }
  async function loadHistory(){
    try{const r=await axios.get(`${API}/student-promotions/history${sessionId?`?sessionId=${sessionId}`:""}`);setHistory(r.data||[])}catch(e){setMessage(e.response?.data?.message||e.message)}
  }
  const filtered=students.filter(s=>`${s.name} ${s.admissionNo} ${s.rollNo}`.toLowerCase().includes(q.toLowerCase()));
  const toggle=id=>setSelected(a=>a.includes(id)?a.filter(x=>x!==id):[...a,id]);
  const selectAll=()=>setSelected(selected.length===filtered.length?[]:filtered.map(s=>s._id));
  async function submit(){
    if(!sessionId)return setMessage("Select an academic session.");
    if(!toSection)return setMessage("Select a target section.");
    if(!selected.length)return setMessage("Select at least one student.");
    if(fromSection===toSection)return setMessage("Target section must be different from the source section.");
    setSaving(true);
    try{
      const r=await axios.post(`${API}/student-promotions/bulk`,{studentIds:selected,toSection,academicSessionId:sessionId,action,remarks});
      setMessage(r.data?.message||"Student movement completed.");
      setSelected([]);setRemarks("");await reload();await loadStudents();await loadHistory();
    }catch(e){setMessage(e.response?.data?.message||e.message)}finally{setSaving(false)}
  }
  return <div className="promotion-page">
    <section className="promotion-hero">
      <div><span className="promotion-eyebrow">ACADEMIC OPERATIONS</span><h2>Student Promotion & Section Transfer</h2><p>Move active students to their next section while keeping a complete academic history of every change.</p></div>
      <div className="promotion-stat"><strong>{students.length}</strong><span>students in selected source</span></div>
    </section>

    <section className="promotion-flow">
      <div className="promotion-step"><span>1</span><div><small>Academic Session</small><select value={sessionId} onChange={e=>setSessionId(e.target.value)}><option value="">Select session</option>{(sessions||[]).map(s=><option key={s._id} value={s._id}>{s.name}{s.active?" · Active":""}</option>)}</select></div></div>
      <ArrowRight className="promotion-arrow" size={20}/>
      <div className="promotion-step"><span>2</span><div><small>From Section</small><select value={fromSection} onChange={e=>setFromSection(e.target.value)}><option value="">All Sections</option>{(data.sections||[]).map(s=><option key={s._id} value={s._id}>{s.program} · {s.semester} · {s.name}</option>)}</select></div></div>
      <ArrowRight className="promotion-arrow" size={20}/>
      <div className="promotion-step target"><span>3</span><div><small>Move To Section</small><select value={toSection} onChange={e=>setToSection(e.target.value)}><option value="">Select target section</option>{(data.sections||[]).filter(s=>s._id!==fromSection).map(s=><option key={s._id} value={s._id}>{s.program} · {s.semester} · {s.name}</option>)}</select></div></div>
    </section>

    <section className="promotion-panel">
      <div className="promotion-toolbar"><div><h3>Select Students</h3><p>{selected.length} selected · {filtered.length} available</p></div><div className="promotion-actions"><button className="secondary" onClick={selectAll}>{selected.length===filtered.length&&filtered.length?"Clear Selection":"Select All"}</button></div></div>
      <div className="promotion-search"><Search size={17}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search student name, admission no. or roll no..."/></div>
      <div className="student-card-grid">
        {filtered.map(s=><button type="button" key={s._id} className={`student-select-card ${selected.includes(s._id)?"selected":""}`} onClick={()=>toggle(s._id)}>
          <span className="student-avatar">{(s.name||"S").slice(0,1).toUpperCase()}</span><span className="student-card-main"><b>{s.name}</b><small>{s.admissionNo} · Roll {s.rollNo}</small><em>{s.section?.program||""} · {s.section?.semester||""} · {s.section?.name||""}</em></span><span className="student-check">{selected.includes(s._id)?"✓":""}</span>
        </button>)}
        {!filtered.length&&<div className="promotion-empty">No active students found for the selected source section.</div>}
      </div>
    </section>

    <section className="promotion-action-panel">
      <div className="promotion-action-fields"><label><span>Action</span><select value={action} onChange={e=>setAction(e.target.value)}><option value="PROMOTED">Promote</option><option value="TRANSFERRED">Transfer</option></select></label><label className="wide"><span>Remarks</span><input value={remarks} onChange={e=>setRemarks(e.target.value)} placeholder="Optional note for this movement..."/></label></div>
      <button className="primary promotion-submit" onClick={submit} disabled={saving}>{saving?"Processing...":`${action==="PROMOTED"?"Promote":"Transfer"} ${selected.length||0} Student${selected.length===1?"":"s"}`}</button>
    </section>

    <section className="promotion-panel"><div className="promotion-toolbar"><div><h3>Recent Movement History</h3><p>Previous promotions and section transfers for the selected academic session.</p></div><span className="status-badge approved">{history.length} records</span></div><div className="promotion-history-grid">{history.slice(0,12).map(h=><article className="promotion-history-card" key={h._id}><div className="history-avatar"><History size={16}/></div><div><b>{h.student?.name||"Student"}</b><small>{h.student?.admissionNo||""} · Roll {h.student?.rollNo||""}</small><p>{h.fromSection?.name||"—"} <ArrowRight size={14}/> {h.toSection?.name||"—"}</p><span>{h.action} · {h.academicSession?.name||""}</span></div><time>{h.createdAt?new Date(h.createdAt).toLocaleDateString():""}</time></article>)}{!history.length&&<div className="promotion-empty">No promotion or transfer history yet.</div>}</div></section>
  </div>
}

function Attendance({data,auth,setMessage}){
  const canMark=["ADMIN","SCHEDULER","FACULTY"].includes(auth.role);
  const [date,setDate]=useState(localToday()),[sectionId,setSectionId]=useState(auth.role==="VIEWER"?refId(auth.section):""),[facultyId,setFacultyId]=useState(auth.role==="FACULTY"?refId(auth.faculty):""),[classes,setClasses]=useState([]),[selected,setSelected]=useState(null),[students,setStudents]=useState([]),[activeView,setActiveView]=useState("MARK"),[loading,setLoading]=useState(false),[saving,setSaving]=useState(false),[studentId,setStudentId]=useState(""),[studentReport,setStudentReport]=useState(null),[sectionReport,setSectionReport]=useState(null),[report,setReport]=useState(null),[from,setFrom]=useState(""),[to,setTo]=useState("");
  async function loadClasses(){setLoading(true);try{const q=new URLSearchParams({date});if(sectionId)q.set("sectionId",sectionId);if(facultyId)q.set("facultyId",facultyId);const r=await axios.get(`${API}/attendance/today?${q}`);setClasses(r.data.classes||[])}catch(e){setMessage(e.response?.data?.message||e.message)}finally{setLoading(false)}}
  useEffect(()=>{loadClasses()},[date,sectionId,facultyId]);
  async function openClass(c){setLoading(true);try{const r=await axios.get(`${API}/attendance/class/${c.timetableEntryId}?date=${date}`);setSelected(r.data.class);setStudents((r.data.students||[]).map(s=>({...s,attendance:{...s.attendance}})));setActiveView("MARK")}catch(e){setMessage(e.response?.data?.message||e.message)}finally{setLoading(false)}}
  function setStatus(id,status){setStudents(a=>a.map(s=>String(s._id)===String(id)?{...s,attendance:{...s.attendance,status}}:s))}
  function markAll(status){setStudents(a=>a.map(s=>({...s,attendance:{...s.attendance,status}})))}
  async function save(){if(!selected)return;setSaving(true);try{const payload={date,timetableEntryId:selected.timetableEntryId,records:students.map(s=>({student:s._id,status:s.attendance?.status||"UNMARKED",remarks:s.attendance?.remarks||""}))};const r=selected.attendance?.id?await axios.put(`${API}/attendance/session/${selected.attendance.id}`,payload):await axios.post(`${API}/attendance/session`,payload);setMessage(r.data?.message||"Attendance saved.");await loadClasses();await openClass(selected)}catch(e){setMessage(e.response?.data?.message||e.message)}finally{setSaving(false)}}
  async function loadStudentReport(){if(!studentId)return;try{setStudentReport((await axios.get(`${API}/attendance/student/${studentId}?${new URLSearchParams({from,to})}`)).data)}catch(e){setMessage(e.response?.data?.message||e.message)}}
  async function loadSectionReport(){if(!sectionId)return setMessage("Select a section first.");try{setSectionReport((await axios.get(`${API}/attendance/section/${sectionId}?${new URLSearchParams({from,to})}`)).data)}catch(e){setMessage(e.response?.data?.message||e.message)}}
  async function loadReport(){try{const q=new URLSearchParams({from,to});if(sectionId)q.set("sectionId",sectionId);if(facultyId)q.set("facultyId",facultyId);setReport((await axios.get(`${API}/attendance/report?${q}`)).data)}catch(e){setMessage(e.response?.data?.message||e.message)}}
  const counts=students.reduce((a,s)=>{const k=s.attendance?.status||"UNMARKED";a[k]=(a[k]||0)+1;return a},{});
  return <div>
    <div className="view-tabs"><button className={`view-tab ${activeView==="MARK"?"active":""}`} onClick={()=>setActiveView("MARK")}>Mark Attendance</button><button className={`view-tab ${activeView==="STUDENT"?"active":""}`} onClick={()=>setActiveView("STUDENT")}>Student Attendance</button><button className={`view-tab ${activeView==="SECTION"?"active":""}`} onClick={()=>setActiveView("SECTION")}>Section Report</button><button className={`view-tab ${activeView==="REPORT"?"active":""}`} onClick={()=>setActiveView("REPORT")}>Attendance Report</button></div>
    {activeView==="MARK"&&<>
      <section className="panel"><div className="panel-head"><div><h3><ClipboardCheck size={17}/> Attendance</h3><p>Select a date and class from the current timetable. Faculty accounts only see their own classes.</p></div><button className="secondary" onClick={loadClasses}><RefreshCw size={15}/> Refresh</button></div><div className="form-grid"><label className="field"><span>Date</span><input type="date" value={date} onChange={e=>{setDate(e.target.value);setSelected(null)}}/></label><Select label="Section" value={sectionId} options={(data.sections||[]).map(s=>[s._id,`${s.program||""} · ${s.semester||""} · ${s.name}`])} onChange={v=>{setSectionId(v);setSelected(null)}}/><Select label="Faculty" value={facultyId} options={(data.faculty||[]).map(f=>[f._id,f.name])} onChange={v=>{setFacultyId(v);setSelected(null)}}/></div></section>
      <section className="panel"><div className="panel-head"><div><h3>Today's Scheduled Classes</h3><p>{date} · {classes.length} class(es)</p></div></div><div className="faculty-class-grid">{classes.map(c=><div className="faculty-class-card" key={c.timetableEntryId}><div className="faculty-class-time"><strong>{c.startTime}</strong><span>{c.endTime}</span><small>{c.section?.name||"Section"}</small></div><div><strong>{c.subject?.name||"Subject"}</strong><div className="muted">{c.faculty?.name||"Faculty"} · {c.room?.name||"Room"}</div><div style={{marginTop:8}}>{c.attendance?<span className="status-badge approved">{c.attendance.counts?.PRESENT||0} Present · {c.attendance.counts?.ABSENT||0} Absent</span>:<span className="status-badge">Not marked</span>}</div><button className="secondary" style={{marginTop:10}} disabled={!canMark} onClick={()=>openClass(c)}>{c.attendance?"Edit Attendance":"Mark Attendance"}</button></div></div>)}{!classes.length&&<div className="empty-state"><h3>No classes for this date</h3><p>Check the selected date, section and faculty filters.</p></div>}</div></section>
      {selected&&<section className="panel"><div className="panel-head"><div><h3>{selected.subject?.name||"Subject"} · {selected.section?.name||"Section"}</h3><p>{date} · {selected.startTime}–{selected.endTime} · {selected.faculty?.name||"Faculty"}</p></div><div className="form-actions"><button className="secondary" onClick={()=>markAll("PRESENT")}>Mark All Present</button><button className="secondary" onClick={()=>markAll("ABSENT")}>Mark All Absent</button><button className="primary" onClick={save} disabled={saving||!canMark}>{saving?"Saving...":"Save Attendance"}</button></div></div><div className="attendance-counts"><span>Present <b>{counts.PRESENT||0}</b></span><span>Absent <b>{counts.ABSENT||0}</b></span><span>Late <b>{counts.LATE||0}</b></span><span>Leave <b>{counts.LEAVE||0}</b></span><span>Unmarked <b>{counts.UNMARKED||0}</b></span></div><div className="table-wrap"><table><thead><tr><th>Roll No</th><th>Admission No</th><th>Student</th><th>Status</th><th>Remarks</th></tr></thead><tbody>{students.map(s=><tr key={s._id}><td>{s.rollNo}</td><td>{s.admissionNo}</td><td><strong>{s.name}</strong></td><td><div style={{display:"flex",gap:5,flexWrap:"wrap"}}>{["PRESENT","ABSENT","LATE","LEAVE"].map(st=><button key={st} className={s.attendance?.status===st?"primary":"secondary"} style={{fontSize:11,padding:"6px 8px"}} onClick={()=>setStatus(s._id,st)}>{st}</button>)}</div></td><td><input value={s.attendance?.remarks||""} onChange={e=>setStudents(a=>a.map(x=>String(x._id)===String(s._id)?{...x,attendance:{...x.attendance,remarks:e.target.value}}:x))} placeholder="Optional"/></td></tr>)}</tbody></table></div></section>}
    </>}
    {activeView==="STUDENT"&&<section className="panel"><div className="panel-head"><div><h3>Student Attendance</h3><p>View attendance history and percentage for an individual student.</p></div></div><div className="form-grid"><Select label="Student" value={studentId} options={(data.students||[]).map(s=>[s._id,`${s.rollNo} · ${s.name}`])} onChange={setStudentId}/><Input label="From" type="date" value={from} onChange={setFrom}/><Input label="To" type="date" value={to} onChange={setTo}/><div className="form-actions"><button className="primary" onClick={loadStudentReport}>View Attendance</button></div></div>{studentReport&&<><div className="cards" style={{marginTop:18}}>{[["Total Classes",studentReport.total],["Attended",studentReport.attended],["Percentage",`${studentReport.percentage}%`],["Absent",studentReport.counts?.ABSENT||0]].map(([n,v])=><div className="card" key={n}><div className="icon"><ClipboardCheck/></div><div><span>{n}</span><strong>{v}</strong></div></div>)}</div><div className="table-wrap" style={{marginTop:18}}><table><thead><tr><th>Date</th><th>Subject</th><th>Faculty</th><th>Status</th><th>Remarks</th></tr></thead><tbody>{(studentReport.rows||[]).map(r=><tr key={r._id}><td>{r.date}</td><td>{r.subject?.name||""}</td><td>{r.faculty?.name||""}</td><td>{r.record?.status||"UNMARKED"}</td><td>{r.record?.remarks||""}</td></tr>)}</tbody></table></div></>}</section>}
    {activeView==="SECTION"&&<section className="panel"><div className="panel-head"><div><h3>Section Attendance Report</h3><p>Attendance percentage for every active student in a section.</p></div></div><div className="form-grid"><Select label="Section" value={sectionId} options={(data.sections||[]).map(s=>[s._id,`${s.program||""} · ${s.semester||""} · ${s.name}`])} onChange={setSectionId}/><Input label="From" type="date" value={from} onChange={setFrom}/><Input label="To" type="date" value={to} onChange={setTo}/><div className="form-actions"><button className="primary" onClick={loadSectionReport}>Generate Report</button></div></div>{sectionReport&&<div className="table-wrap" style={{marginTop:18}}><table><thead><tr><th>Roll No</th><th>Student</th><th>Total</th><th>Present</th><th>Absent</th><th>Late</th><th>Leave</th><th>%</th></tr></thead><tbody>{(sectionReport.students||[]).map(r=><tr key={r.student._id}><td>{r.student.rollNo}</td><td>{r.student.name}</td><td>{r.total}</td><td>{r.present}</td><td>{r.absent}</td><td>{r.late}</td><td>{r.leave}</td><td><strong>{r.percentage}%</strong></td></tr>)}</tbody></table></div>}</section>}
    {activeView==="REPORT"&&<section className="panel"><div className="panel-head"><div><h3>Attendance Report</h3><p>Filter submitted attendance sessions and view overall attendance statistics.</p></div></div><div className="form-grid"><Input label="From" type="date" value={from} onChange={setFrom}/><Input label="To" type="date" value={to} onChange={setTo}/><Select label="Section" value={sectionId} options={(data.sections||[]).map(s=>[s._id,`${s.program||""} · ${s.semester||""} · ${s.name}`])} onChange={setSectionId}/><div className="form-actions"><button className="primary" onClick={loadReport}>Run Report</button></div></div>{report&&<><div className="cards" style={{marginTop:18}}>{[["Attendance Classes",report.summary.classes],["Marked Records",report.summary.records],["Attended",report.summary.attended],["Overall %",`${report.summary.percentage}%`]].map(([n,v])=><div className="card" key={n}><div className="icon"><BarChart3/></div><div><span>{n}</span><strong>{v}</strong></div></div>)}</div><div className="table-wrap" style={{marginTop:18}}><table><thead><tr><th>Date</th><th>Time</th><th>Section</th><th>Subject</th><th>Faculty</th><th>Records</th></tr></thead><tbody>{(report.sessions||[]).map(r=><tr key={r._id}><td>{r.date}</td><td>{r.startTime}–{r.endTime}</td><td>{r.section?.name||""}</td><td>{r.subject?.name||""}</td><td>{r.faculty?.name||""}</td><td>{r.records?.length||0}</td></tr>)}</tbody></table></div></>}</section>}
  </div>
}


function FeeManagement({data,sessions,auth,setMessage}){
  const [view,setView]=useState("HEADS");
  const [heads,setHeads]=useState([]),[invoices,setInvoices]=useState([]),[payments,setPayments]=useState([]),[report,setReport]=useState(null);
  const [editing,setEditing]=useState(null),[busy,setBusy]=useState(false);
  const [headForm,setHeadForm]=useState({name:"",code:"",program:"",semester:"",amount:"",frequency:"SEMESTER",dueDate:"",description:""});
  const [filters,setFilters]=useState({sessionId:sessions.find(s=>s.active)?._id||"",sectionId:"",status:""});
  const [generate,setGenerate]=useState({sessionId:sessions.find(s=>s.active)?._id||"",sectionId:"",feeHeadId:""});
  const [payment,setPayment]=useState({invoiceId:"",amount:"",mode:"CASH",reference:"",remarks:"",paymentDate:new Date().toISOString().slice(0,10)});
  const [selectedInvoice,setSelectedInvoice]=useState(null);
  const money=v=>`₹${Number(v||0).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const activeSessions=sessions||[];
  const sectionOptions=(data.sections||[]).map(s=>[s._id,`${s.program||""} · ${s.semester||""} · ${s.name}`]);
  async function loadHeads(){try{const r=await axios.get(`${API}/fees/heads`);setHeads(r.data||[])}catch(e){setMessage(e.response?.data?.message||e.message)}}
  async function loadInvoices(){try{const q=new URLSearchParams();if(filters.sessionId)q.set("sessionId",filters.sessionId);if(filters.sectionId)q.set("sectionId",filters.sectionId);if(filters.status)q.set("status",filters.status);const r=await axios.get(`${API}/fees/invoices?${q}`);setInvoices(r.data||[])}catch(e){setMessage(e.response?.data?.message||e.message)}}
  async function loadPayments(){try{const r=await axios.get(`${API}/fees/payments`);setPayments(r.data||[])}catch(e){setMessage(e.response?.data?.message||e.message)}}
  async function loadReport(){try{const q=new URLSearchParams();if(filters.sessionId)q.set("sessionId",filters.sessionId);if(filters.sectionId)q.set("sectionId",filters.sectionId);const r=await axios.get(`${API}/fees/reports?${q}`);setReport(r.data)}catch(e){setMessage(e.response?.data?.message||e.message)}}
  useEffect(()=>{loadHeads();loadInvoices();loadPayments()},[]);
  useEffect(()=>{if(filters.sessionId||filters.sectionId||filters.status)loadInvoices()},[filters.sessionId,filters.sectionId,filters.status]);
  function resetHead(){setEditing(null);setHeadForm({name:"",code:"",program:"",semester:"",amount:"",frequency:"SEMESTER",dueDate:"",description:""})}
  function editHead(h){setEditing(h._id);setHeadForm({name:h.name||"",code:h.code||"",program:h.program||"",semester:h.semester||"",amount:h.amount??"",frequency:h.frequency||"SEMESTER",dueDate:h.dueDate?String(h.dueDate).slice(0,10):"",description:h.description||""});setView("HEADS")}
  async function saveHead(){if(!headForm.name||!headForm.code||headForm.amount==="")return setMessage("Fee head name, code and amount are required.");setBusy(true);try{const body={...headForm,amount:Number(headForm.amount),dueDate:headForm.dueDate||null};if(editing)await axios.put(`${API}/fees/heads/${editing}`,body);else await axios.post(`${API}/fees/heads`,body);setMessage(editing?"Fee head updated.":"Fee head created.");resetHead();await loadHeads()}catch(e){setMessage(e.response?.data?.message||e.message)}finally{setBusy(false)}}
  async function generateInvoices(){if(!generate.sessionId||!generate.sectionId||!generate.feeHeadId)return setMessage("Select Academic Session, Section and Fee Head.");setBusy(true);try{const r=await axios.post(`${API}/fees/invoices/generate`,generate);setMessage(r.data.message);await loadInvoices();setView("INVOICES")}catch(e){setMessage(e.response?.data?.message||e.message)}finally{setBusy(false)}}
  async function collectPayment(){if(!payment.invoiceId||!payment.amount)return setMessage("Select an invoice and enter payment amount.");setBusy(true);try{const r=await axios.post(`${API}/fees/payments`,{...payment,amount:Number(payment.amount)});setMessage(r.data.message);setPayment({invoiceId:"",amount:"",mode:"CASH",reference:"",remarks:"",paymentDate:new Date().toISOString().slice(0,10)});await loadInvoices();await loadPayments();setView("PAYMENTS")}catch(e){setMessage(e.response?.data?.message||e.message)}finally{setBusy(false)}}
  async function applyDiscount(inv){const value=window.prompt(`Enter discount for ${inv.invoiceNo}`,String(inv.discount||0));if(value===null)return;try{await axios.post(`${API}/fees/invoices/${inv._id}/discount`,{discount:Number(value)});setMessage("Discount updated.");await loadInvoices()}catch(e){setMessage(e.response?.data?.message||e.message)}}
  const summary=useMemo(()=>{const total=invoices.reduce((n,x)=>n+Number(x.netAmount||0),0),paid=invoices.reduce((n,x)=>n+Number(x.paidAmount||0),0);return {total,paid,balance:Math.max(0,total-paid),overdue:invoices.filter(x=>x.status==="OVERDUE").length}},[invoices]);
  return <div>
    <section className="panel"><div className="panel-head"><div><h3><DollarSign size={17}/> Fee Management</h3><p>Create fee heads, generate student invoices, collect payments and review collection reports.</p></div><span className="status-badge approved">{invoices.length} Invoices</span></div>
      <div className="view-tabs">{[["HEADS","Fee Heads"],["GENERATE","Generate Invoices"],["INVOICES","Invoices"],["PAYMENTS","Collect Payment"],["REPORT","Reports"]].map(([v,l])=><button key={v} className={view===v?"view-tab active":"view-tab"} onClick={()=>setView(v)}>{l}</button>)}</div>
    </section>
    {view==="HEADS"&&<section className="panel"><div className="panel-head"><div><h3>{editing?"Edit Fee Head":"Create Fee Head"}</h3><p>Fee heads can be mapped to a program and semester.</p></div></div><div className="form-grid"><Input label="Fee Name" value={headForm.name} onChange={v=>setHeadForm({...headForm,name:v})}/><Input label="Code" value={headForm.code} onChange={v=>setHeadForm({...headForm,code:v.toUpperCase()})}/><Input label="Program" value={headForm.program} onChange={v=>setHeadForm({...headForm,program:v})}/><Input label="Semester" value={headForm.semester} onChange={v=>setHeadForm({...headForm,semester:v})}/><Input label="Amount" type="number" value={headForm.amount} onChange={v=>setHeadForm({...headForm,amount:v})}/><Select label="Frequency" value={headForm.frequency} options={[["ONE_TIME","One Time"],["SEMESTER","Semester"],["ANNUAL","Annual"],["MONTHLY","Monthly"]]} onChange={v=>setHeadForm({...headForm,frequency:v})}/><Input label="Due Date" type="date" value={headForm.dueDate} onChange={v=>setHeadForm({...headForm,dueDate:v})}/><Input label="Description" value={headForm.description} onChange={v=>setHeadForm({...headForm,description:v})}/></div><div className="form-actions" style={{marginTop:14}}><button className="primary" disabled={busy} onClick={saveHead}>{busy?(editing?"Updating...":"Creating..."):(editing?"Update Fee Head":"+ Add Fee Head")}</button>{editing&&<button className="secondary" onClick={resetHead}>Cancel</button>}</div><div className="table-wrap" style={{marginTop:22}}><table><thead><tr><th>Name</th><th>Code</th><th>Program</th><th>Semester</th><th>Amount</th><th>Frequency</th><th>Due Date</th><th>Status</th><th>Action</th></tr></thead><tbody>{heads.map(h=><tr key={h._id}><td><strong>{h.name}</strong><div className="muted">{h.description}</div></td><td>{h.code}</td><td>{h.program||"All"}</td><td>{h.semester||"All"}</td><td>{money(h.amount)}</td><td>{h.frequency}</td><td>{h.dueDate?String(h.dueDate).slice(0,10):"—"}</td><td>{h.active?<span className="status-badge approved">ACTIVE</span>:"Inactive"}</td><td><button className="secondary" onClick={()=>editHead(h)}>Edit</button></td></tr>)}{!heads.length&&<tr><td colSpan="9">No fee heads created.</td></tr>}</tbody></table></div></section>}
    {view==="GENERATE"&&<section className="panel"><div className="panel-head"><div><h3>Generate Student Invoices</h3><p>One invoice is created for every active student in the selected section. Existing invoices are skipped.</p></div></div><div className="form-grid"><Select label="Academic Session" value={generate.sessionId} options={activeSessions.map(s=>[s._id,s.name])} onChange={v=>setGenerate({...generate,sessionId:v})}/><Select label="Section" value={generate.sectionId} options={sectionOptions} onChange={v=>setGenerate({...generate,sectionId:v})}/><Select label="Fee Head" value={generate.feeHeadId} options={heads.filter(h=>h.active).map(h=>[h._id,`${h.name} · ${money(h.amount)}`])} onChange={v=>setGenerate({...generate,feeHeadId:v})}/></div><div className="message success" style={{marginTop:16}}>Invoices are linked to the selected Academic Session, Section, Student and Fee Head. Duplicate invoices are not created.</div><div className="form-actions" style={{marginTop:14}}><button className="primary" disabled={busy} onClick={generateInvoices}>{busy?"Generating...":"Generate Invoices"}</button></div></section>}
    {view==="INVOICES"&&<section className="panel"><div className="panel-head"><div><h3>Fee Invoices</h3><p>Track billed amount, discounts, payments and outstanding balance.</p></div><button className="secondary" onClick={loadInvoices}><RefreshCw size={15}/> Refresh</button></div><div className="form-grid"><Select label="Academic Session" value={filters.sessionId} options={activeSessions.map(s=>[s._id,s.name])} onChange={v=>setFilters({...filters,sessionId:v})}/><Select label="Section" value={filters.sectionId} options={sectionOptions} onChange={v=>setFilters({...filters,sectionId:v})}/><Select label="Status" value={filters.status} options={[["PENDING","Pending"],["PARTIAL","Partial"],["PAID","Paid"],["OVERDUE","Overdue"]]} onChange={v=>setFilters({...filters,status:v})}/></div><div className="cards" style={{marginTop:18}}>{[["Billed",money(summary.total)],["Collected",money(summary.paid)],["Outstanding",money(summary.balance)],["Overdue",summary.overdue]].map(([n,v])=><div className="card" key={n}><div className="icon"><DollarSign/></div><div><span>{n}</span><strong>{v}</strong></div></div>)}</div><div className="table-wrap" style={{marginTop:18}}><table><thead><tr><th>Invoice</th><th>Student</th><th>Fee Head</th><th>Session</th><th>Net</th><th>Paid</th><th>Balance</th><th>Status</th><th>Action</th></tr></thead><tbody>{invoices.map(i=><tr key={i._id}><td><strong>{i.invoiceNo}</strong><div className="muted">Due: {i.dueDate?String(i.dueDate).slice(0,10):"—"}</div></td><td>{i.student?.rollNo} · {i.student?.name}</td><td>{i.feeHead?.name}</td><td>{i.academicSession?.name}</td><td>{money(i.netAmount)}</td><td>{money(i.paidAmount)}</td><td><strong>{money(i.balance)}</strong></td><td><span className={`status-badge ${i.status==="PAID"?"approved":""}`}>{i.status}</span></td><td><div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{i.balance>0&&<button className="primary" onClick={()=>{setPayment({...payment,invoiceId:i._id,amount:i.balance});setSelectedInvoice(i);setView("PAYMENTS")}}>Collect</button>}<button className="secondary" onClick={()=>applyDiscount(i)}>Discount</button></div></td></tr>)}{!invoices.length&&<tr><td colSpan="9">No invoices match the selected filters.</td></tr>}</tbody></table></div></section>}
    {view==="PAYMENTS"&&<section className="panel"><div className="panel-head"><div><h3>Collect Fee Payment</h3><p>Record payment against an invoice and generate a receipt number.</p></div></div><div className="form-grid"><Select label="Invoice" value={payment.invoiceId} options={invoices.filter(i=>i.balance>0).map(i=>[i._id,`${i.invoiceNo} · ${i.student?.name||"Student"} · ${money(i.balance)} due`])} onChange={v=>{const i=invoices.find(x=>String(x._id)===String(v));setPayment({...payment,invoiceId:v,amount:i?.balance||""});setSelectedInvoice(i||null)}}/><Input label="Amount" type="number" value={payment.amount} onChange={v=>setPayment({...payment,amount:v})}/><Select label="Payment Mode" value={payment.mode} options={[["CASH","Cash"],["UPI","UPI"],["CARD","Card"],["BANK_TRANSFER","Bank Transfer"],["CHEQUE","Cheque"]]} onChange={v=>setPayment({...payment,mode:v})}/><Input label="Payment Date" type="date" value={payment.paymentDate} onChange={v=>setPayment({...payment,paymentDate:v})}/><Input label="Reference / UTR / Cheque No." value={payment.reference} onChange={v=>setPayment({...payment,reference:v})}/><Input label="Remarks" value={payment.remarks} onChange={v=>setPayment({...payment,remarks:v})}/></div>{selectedInvoice&&<div className="message success" style={{marginTop:14}}>Outstanding for <strong>{selectedInvoice.invoiceNo}</strong>: {money(selectedInvoice.balance)}</div>}<div className="form-actions" style={{marginTop:14}}><button className="primary" disabled={busy} onClick={collectPayment}>{busy?"Saving...":"Collect Payment"}</button></div><div className="table-wrap" style={{marginTop:22}}><table><thead><tr><th>Receipt</th><th>Date</th><th>Student</th><th>Invoice</th><th>Amount</th><th>Mode</th><th>Reference</th></tr></thead><tbody>{payments.slice(0,50).map(p=><tr key={p._id}><td><strong>{p.receiptNo}</strong></td><td>{p.paymentDate?String(p.paymentDate).slice(0,10):""}</td><td>{p.student?.rollNo} · {p.student?.name}</td><td>{p.invoice?.invoiceNo}</td><td>{money(p.amount)}</td><td>{p.mode}</td><td>{p.reference||"—"}</td></tr>)}{!payments.length&&<tr><td colSpan="7">No payments recorded yet.</td></tr>}</tbody></table></div></section>}
    {view==="REPORT"&&<section className="panel"><div className="panel-head"><div><h3>Fee Collection Report</h3><p>Review billing, collections, outstanding balances and overdue invoices.</p></div><button className="primary" onClick={loadReport}>Run Report</button></div><div className="form-grid"><Select label="Academic Session" value={filters.sessionId} options={activeSessions.map(s=>[s._id,s.name])} onChange={v=>setFilters({...filters,sessionId:v})}/><Select label="Section" value={filters.sectionId} options={sectionOptions} onChange={v=>setFilters({...filters,sectionId:v})}/></div>{report&&<><div className="cards" style={{marginTop:18}}>{[["Invoices",report.summary.invoices],["Billed",money(report.summary.total)],["Collected",money(report.summary.paid)],["Outstanding",money(report.summary.balance)]].map(([n,v])=><div className="card" key={n}><div className="icon"><BarChart3/></div><div><span>{n}</span><strong>{v}</strong></div></div>)}</div><div className="message" style={{marginTop:14}}>Overdue invoices: <strong>{report.summary.overdue}</strong></div><div className="table-wrap" style={{marginTop:18}}><table><thead><tr><th>Invoice</th><th>Student</th><th>Fee Head</th><th>Net</th><th>Paid</th><th>Balance</th><th>Status</th></tr></thead><tbody>{(report.invoices||[]).map(i=><tr key={i._id}><td>{i.invoiceNo}</td><td>{i.student?.rollNo} · {i.student?.name}</td><td>{i.feeHead?.name}</td><td>{money(i.netAmount)}</td><td>{money(i.paidAmount)}</td><td>{money(i.balance)}</td><td>{i.status}</td></tr>)}</tbody></table></div></>}</section>}
  </div>
}

function FullSessionTimetable({sessions,activeSession,role}){
  const [sessionId,setSessionId]=useState(activeSession?._id||"");
  const [holidays,setHolidays]=useState("");
  const [holidayDate,setHolidayDate]=useState("");
  const [plans,setPlans]=useState([]);
  const [plan,setPlan]=useState(null);
  const [weekIndex,setWeekIndex]=useState(0);
  const [sectionId,setSectionId]=useState("");
  const [facultyId,setFacultyId]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  useEffect(()=>{if(activeSession?._id&&!sessionId)setSessionId(activeSession._id)},[activeSession?._id]);
  useEffect(()=>{setPlan(null);setWeekIndex(0);if(!sessionId)return;Promise.all([axios.get(`${API}/session-plans?sessionId=${sessionId}`),axios.get(`${API}/academic-sessions/${sessionId}`)]).then(([r,sr])=>{setPlans(r.data||[]);setHolidays((sr.data?.holidayDates||[]).join(", "))}).catch(e=>setError(e.response?.data?.message||e.message))},[sessionId]);
  async function openPlan(id){setBusy(true);setError("");try{const r=await axios.get(`${API}/session-plans/${id}`);setPlan(r.data);setWeekIndex(0)}catch(e){setError(e.response?.data?.message||e.message)}finally{setBusy(false)}}
  async function generateFull(){if(!window.confirm('Generate and save a new full academic session plan? Existing plans will be preserved.'))return;setBusy(true);setError("");try{const dates=holidays.split(/[\s,;]+/).map(x=>x.trim()).filter(Boolean);const r=await axios.post(`${API}/session-plans/generate`,{sessionId,holidays:dates});const p=await axios.get(`${API}/session-plans?sessionId=${sessionId}`);setPlans(p.data||[]);await openPlan(r.data.id)}catch(e){setError(e.response?.data?.message||e.message)}finally{setBusy(false)}}
  async function publish(){if(!plan||!window.confirm('Publish this full-session timetable version?'))return;setBusy(true);try{await axios.patch(`${API}/session-plans/${plan._id}/publish`);const r=await axios.get(`${API}/session-plans?sessionId=${sessionId}`);setPlans(r.data||[]);await openPlan(plan._id)}catch(e){setError(e.response?.data?.message||e.message)}finally{setBusy(false)}}
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
          <div style={{display:'flex',flexDirection:'column',gap:8,minWidth:320}}>
            <label>Holiday date</label>
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              <input type="date" value={holidayDate} onChange={e=>setHolidayDate(e.target.value)} />
              <button className="secondary" type="button" disabled={!holidayDate||new Date(`${holidayDate}T00:00:00Z`).getUTCDay()===0} onClick={()=>{if(!holidayDate)return;const vals=holidays.split(/[,;\s]+/).map(x=>x.trim()).filter(Boolean);if(!vals.includes(holidayDate)){vals.push(holidayDate);vals.sort();setHolidays(vals.join(', '));}setHolidayDate('')}}>Add Holiday</button>
            </div>
            <small style={{color:'#64748b'}}>Sunday is automatically a holiday and cannot be added as a separate date.</small>
            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
              {holidays.split(/[,;\s]+/).map(x=>x.trim()).filter(Boolean).map(d=><span key={d} style={{padding:'5px 9px',borderRadius:999,background:'#fff7ed',color:'#9a3412',fontSize:12}}>{d} <button type="button" onClick={()=>setHolidays(holidays.split(/[,;\s]+/).map(x=>x.trim()).filter(Boolean).filter(v=>v!==d).join(', '))} style={{border:0,background:'transparent',cursor:'pointer',color:'#9a3412'}}>×</button></span>)}
            </div>
          </div>
          <button className="primary" disabled={!sessionId||busy} onClick={generateFull}>{busy?'Generating...':'Generate Full Session'}</button>
        </>}
      </div>
      {error&&<p style={{color:'#b91c1c',whiteSpace:'pre-wrap'}}>{error}</p>}
      <p style={{fontSize:12,color:'#64748b'}}>The generator does not repeat one fixed weekly timetable. It distributes each subject’s Total Sessions across the academic weeks, respects Max Classes / Week, handles holidays, and saves every dated class in the session plan. No partial plan is saved.</p>
    </section>
    <section className="panel" style={{padding:22,marginBottom:18}}><h3>Saved Full-Session Versions</h3><div style={{display:'flex',gap:10,flexWrap:'wrap'}}>{plans.map(p=><button key={p._id} className={plan?._id===p._id?'primary':'secondary'} onClick={()=>openPlan(p._id)}>Version {p.version} · {p.status} · {p.weeks?.length||0} weeks</button>)}{!plans.length&&<p>No session-wide plans generated yet.</p>}</div></section>
    {plan&&<section className="panel" style={{padding:22}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,flexWrap:'wrap'}}><h3>Version {plan.version} · {plan.status} · {plan.weeks.length} academic weeks · {plan.totalEntries} classes</h3>{plan.status==='DRAFT'&&['ADMIN','SCHEDULER'].includes(role)&&<button className="primary" disabled={busy} onClick={publish}>Publish Full Session</button>}</div>
      <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap',margin:'12px 0'}}><button className="secondary" disabled={weekIndex===0} onClick={()=>setWeekIndex(i=>i-1)}>← Previous Week</button><select value={weekIndex} onChange={e=>setWeekIndex(Number(e.target.value))}>{plan.weeks.map((w,i)=><option key={i} value={i}>Week {w.weekNumber}: {w.startDate} – {w.endDate}</option>)}</select><button className="secondary" disabled={weekIndex>=plan.weeks.length-1} onClick={()=>setWeekIndex(i=>i+1)}>Next Week →</button></div>
      <div style={{display:'flex',gap:12,flexWrap:'wrap',marginBottom:14}}><label>Section<br/><select value={sectionId} onChange={e=>setSectionId(e.target.value)}><option value="">All sections</option>{sectionOptions.map(s=><option key={s._id} value={s._id}>{s.name}</option>)}</select></label><label>Faculty<br/><select value={facultyId} onChange={e=>setFacultyId(e.target.value)}><option value="">All faculty</option>{facultyOptions.map(f=><option key={f._id} value={f._id}>{f.name}</option>)}</select></label></div>
      <p>{week?.workingDates?.length||0} working days · {week?.entries?.length||0} classes · {week?.variationPercent||0}% placement variation vs preceding week</p>
      <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',minWidth:760}}><thead><tr><th style={{padding:10,borderBottom:'1px solid #ddd',textAlign:'left'}}>Week / Date</th><th style={{padding:10,borderBottom:'1px solid #ddd',textAlign:'left'}}>Day</th>{timeColumns.map(col=><th key={`${col.startTime}-${col.endTime}`} style={{padding:10,borderBottom:'1px solid #ddd',textAlign:'left',whiteSpace:'nowrap'}}>{col.startTime}–{col.endTime}</th>)}</tr></thead><tbody>{(week?.calendarDates||((week?.workingDates||[]).map(date=>({date,day:new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US',{weekday:'long',timeZone:'UTC'}),status:'WORKING'})))).map(item=>{const date=item.date;const day=item.day;const holiday=item.status==='HOLIDAY';return <tr key={date} style={holiday?{background:'#fff7ed'}:{}}><td style={{padding:10,borderBottom:'1px solid #eee',fontWeight:700,whiteSpace:'nowrap'}}>{date}</td><td style={{padding:10,borderBottom:'1px solid #eee'}}>{day}</td>{timeColumns.map(col=>{const e=holiday?null:entryAt(date,col);return <td key={`${date}-${col.startTime}`} style={{padding:8,borderBottom:'1px solid #eee',verticalAlign:'top',minWidth:150}}>{holiday?<div style={{padding:8,borderRadius:8,background:'#ffedd5',fontWeight:700,color:'#9a3412'}}>Holiday</div>:e?<div style={{padding:8,borderRadius:8,background:'#eff6ff'}}><strong>{e.subject?.code||e.subject?.name||'Subject'}</strong><div style={{fontSize:12,color:'#475569'}}>{e.subject?.name||''}</div><div style={{fontSize:12}}>{e.faculty?.name||'Faculty'}</div><div style={{fontSize:12}}>{e.section?.name||'Section'} · {e.room?.name||'Room'}</div>{Number(e.duration||1)>1&&<small>{e.duration} periods</small>}</div>:<span style={{color:'#94a3b8'}}>—</span>}</td>})}</tr>})}</tbody></table>{!entries.length&&<p>No entries for selected filters or this week.</p>}</div>
    </section>}
  </div>;
}
