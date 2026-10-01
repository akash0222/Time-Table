import React from "react";
import {CalendarDays, CalendarRange, CalendarClock, Clock3, LayoutDashboard, Users, UsersRound, UserPlus, GraduationCap, UserCheck, DoorOpen, BookOpen, DollarSign, Database, WandSparkles, LogOut, ChevronLeft, Menu, X, FileSpreadsheet, Copy, QrCode, BarChart3, Bell, History, ShieldCheck, Activity, Settings2, SlidersHorizontal} from "lucide-react";

const iconByName={
  "Dashboard":LayoutDashboard,
  "Academic Sessions":CalendarRange,
  "Full Session Timetable":CalendarClock,
  "All Program Timetables":CalendarRange,
  "Timetable":Clock3,
  "Calendar View":CalendarDays,
  "My Timetable":CalendarClock,
  "Students":UsersRound,
  "Student Profile":UserPlus,
  "Student Promotion":GraduationCap,
  "Attendance":UserCheck,
  "Faculty Portal":Users,
  "Section Portal":UsersRound,
  "Fees":DollarSign,
  "Master Data Settings":Database,
  "Excel Import":FileSpreadsheet,
  "Templates & Clone":Copy,
  "Public Sharing":QrCode,
  "Reports":BarChart3,
  "Analytics":Activity,
  "Notifications":Bell,
  "Change History":History,
  "Validation":ShieldCheck,
  "Optimization":SlidersHorizontal,
  "Audit Logs":History,
  "User Management":Users,
  "Settings":Settings2
};

export default function AppSidebar({auth,groups,tab,goTab,seed,generate,loading,collapsed,setCollapsed,mobileOpen,setMobileOpen}){
  const closeMobile=()=>setMobileOpen(false);
  const navigate=(name)=>{goTab(name);closeMobile()};
  return <>
    {mobileOpen&&<button className="sidebar-backdrop" aria-label="Close navigation" onClick={closeMobile}/>} 
    <aside className={`erp-sidebar ${collapsed?"collapsed":""} ${mobileOpen?"mobile-open":""}`} aria-label="Primary navigation">
      <div className="sidebar-brand-row">
        <button className="brand" onClick={()=>navigate("Dashboard")} title="Dashboard" aria-label="Time Table dashboard">
          <CalendarDays/><span>Time Table</span>
        </button>
        <button className="sidebar-collapse" onClick={()=>setCollapsed(v=>!v)} aria-label={collapsed?"Expand sidebar":"Collapse sidebar"} title={collapsed?"Expand sidebar":"Collapse sidebar"}>
          <ChevronLeft className={collapsed?"rotated":""} size={18}/>
        </button>
        <button className="mobile-close" onClick={closeMobile} aria-label="Close navigation"><X size={19}/></button>
      </div>
      <div className="workspace-label">ACADEMIC WORKSPACE</div>
      <nav className="sidebar-nav">
        {groups.map(group=><div className="nav-group" key={group.label}>
          <div className="nav-group-title">{group.label}</div>
          {group.items.map(({name,Icon:GroupIcon})=>{
            const Icon=iconByName[name]||GroupIcon||Activity;
            const active=tab===name;
            return <button
              title={collapsed?name:undefined}
              aria-label={name}
              aria-current={active?"page":undefined}
              data-nav={name}
              className={active?"nav active":"nav"}
              onClick={()=>navigate(name)}
              key={name}
            >
              <span className="nav-icon"><Icon size={17}/></span>
              <span className="nav-label">{name}</span>
              
            </button>;
          })}
        </div>)}
      </nav>
      <div className="side-bottom">
        {auth.role==="ADMIN"&&<button title={collapsed?"Load Demo Data":undefined} aria-label="Load Demo Data" className="secondary full side-action" onClick={seed} disabled={loading}><Database size={17}/><span>Load Demo Data</span></button>}
        {["ADMIN","SCHEDULER"].includes(auth.role)&&<button title={collapsed?"Generate Timetable":undefined} aria-label="Generate Timetable" className="primary full side-action" onClick={generate} disabled={loading}><WandSparkles size={17}/><span>{loading?"Generating...":"Generate Timetable"}</span></button>}
        <div className="sidebar-user"><strong>{auth.name||auth.username||"User"}</strong><span>{auth.role}</span></div>
        <button title={collapsed?"Logout":undefined} aria-label="Logout" className="secondary full side-action" onClick={()=>{localStorage.removeItem("tt_token");localStorage.removeItem("tt_user");window.location.reload()}}><LogOut size={17}/><span>Logout</span></button>
      </div>
    </aside>
    <button className="mobile-menu-trigger" onClick={()=>setMobileOpen(true)} aria-label="Open navigation"><Menu size={20}/></button>
  </>;
}
