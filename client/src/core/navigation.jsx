import {CalendarDays, CalendarOff, Users, BookOpen, Clock3, Settings2, FileSpreadsheet, Upload, ShieldCheck, BarChart3, Activity, Bell, UserCheck, Copy, QrCode, History, UserPlus, DollarSign, GraduationCap, UsersRound, Link2} from "lucide-react";

export function navGroupsForRole(role){
  const base = [
    {label:"Overview",items:["Dashboard"]},
    {label:"Academic Setup",items:["Academic Sessions","Academic Structure","Holiday Management","Master Data Settings","Subject & Faculty Mapping","Program & Section Mapping"]},
    {label:"Timetable & Scheduling",items:["Generation Readiness","Generation Preview","Availability","Optimization","Full Session Timetable","All Program Timetables","Timetable","Approval & Versions","Calendar View"]},
    {label:"Students & Operations",items:["Students","Student Mapping","Student Profile","Student Promotion","Attendance","Fees"]},
    {label:"Portals & Communication",items:["My Timetable","Faculty Portal","Section Portal","Notifications"]},
    {label:"Tools & Sharing",items:["Excel Import","Import Center","Templates & Clone","Public Sharing"]},
    {label:"Reports & Audit",items:["Reports","Analytics","Validation","Audit Logs","Change History"]}
  ];
  if(role==="ADMIN") base.push({label:"Administration",items:["User Management","Settings"]});
  else if(role==="SCHEDULER") base.push({label:"Administration",items:["Settings"]});

  const allowed = new Set(
    role === "ADMIN"
      ? base.flatMap(g=>g.items)
      : role === "SCHEDULER"
        ? base.flatMap(g=>g.items).filter(name => name !== "Public Sharing")
      : role === "FACULTY"
        ? ["Dashboard","Attendance","Student Profile","Full Session Timetable","All Program Timetables","My Timetable","Faculty Portal","Section Portal","Analytics","Validation","Timetable"]
        : ["Dashboard","Attendance","Student Profile","Full Session Timetable","All Program Timetables","My Timetable","Calendar View","Section Portal","Analytics","Validation","Timetable"]
  );
  const icons={
    Dashboard:Activity,"Academic Sessions":CalendarDays,"Academic Structure":GraduationCap,"Holiday Management":CalendarOff,"Generation Readiness":ShieldCheck,"Generation Preview":ShieldCheck,"Full Session Timetable":CalendarDays,"All Program Timetables":GraduationCap,Timetable:Clock3,"Approval & Versions":ShieldCheck,"Calendar View":CalendarDays,"My Timetable":CalendarDays,
    Students:UserPlus,"Student Mapping":UsersRound,"Student Profile":UsersRound,"Student Promotion":GraduationCap,Attendance:UserCheck,"Faculty Portal":Users,"Section Portal":Users,
    "Master Data Settings":Settings2,"Subject & Faculty Mapping":BookOpen,"Program & Section Mapping":Link2,"Excel Import":FileSpreadsheet,"Templates & Clone":Copy,"Public Sharing":QrCode,
    Reports:BarChart3,Analytics:BarChart3,Validation:ShieldCheck,"Change History":History,"Audit Logs":History,"User Management":Users,Settings:Settings2,Fees:DollarSign,Notifications:Bell,Optimization:Activity,Availability:Clock3,"Import Center":Upload
  };
  return base.map(g=>({...g,items:g.items.filter(name=>allowed.has(name)).map(name=>({name,Icon:icons[name]||Activity}))})).filter(g=>g.items.length);
}
