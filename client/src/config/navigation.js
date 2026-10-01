import {CalendarDays, Users, BookOpen, DoorOpen, Clock3, Settings2, Activity, UserPlus, UsersRound, GraduationCap, UserCheck, DollarSign, FileSpreadsheet, Copy, QrCode, BarChart3, Bell, History, ShieldCheck} from "lucide-react";
export function navGroupsForRole(role){
  const base = [
    {label:"Overview", items:["Dashboard"]},
    {label:"Academic", items:["Academic Sessions","Full Session Timetable","All Program Timetables","Timetable","Calendar View","My Timetable"]},
    {label:"People & Attendance", items:["Students","Student Profile","Student Promotion","Attendance","Faculty Portal","Section Portal"]},
    {label:"Fees", items:["Fees"]},
    {label:"Master Data", items:["Master Data Settings"]},
    {label:"Tools", items:["Excel Import","Templates & Clone","Public Sharing"]},
    {label:"Insights", items:["Reports","Analytics","Notifications","Change History","Validation","Optimization","Audit Logs"]}
  ];
  if(role==="ADMIN") base.push({label:"Administration",items:["User Management","Settings"]});
  else if(role==="SCHEDULER") base.push({label:"Administration",items:["Settings"]});
  const allowed=new Set(navForRole(role));
  const icons={
    Dashboard:Activity, "Academic Sessions":CalendarDays, "Full Session Timetable":CalendarDays, Timetable:CalendarDays, "Calendar View":CalendarDays, "My Timetable":CalendarDays,
    Students:UserPlus, "Student Profile":UsersRound, "Student Promotion":GraduationCap, Attendance:UserCheck, "Faculty Portal":Users, "Section Portal":Users, Fees:DollarSign, "Master Data Settings":Settings2, Programs:BookOpen, Faculty:Users, Subjects:BookOpen, Sections:Users, Rooms:DoorOpen, "Time Slots":Clock3, Availability:Activity,
    "Excel Import":FileSpreadsheet, "Templates & Clone":Copy, "Public Sharing":QrCode, Reports:BarChart3, Analytics:BarChart3, Notifications:Bell, "Change History":History, Validation:ShieldCheck, Optimization:Activity, "Audit Logs":History, "User Management":Users, Settings:Settings2
  };
  return base.map(g=>({...g,items:g.items.filter(name=>allowed.has(name)).map(name=>({name,Icon:icons[name]||Activity}))})).filter(g=>g.items.length);
}


export function navForRole(role){
  if(role==="ADMIN") return ["Dashboard","Attendance","Students","Student Profile","Student Promotion","Fees","Full Session Timetable","All Program Timetables","My Timetable","Calendar View","Section Portal","Notifications","Change History","Reports","Audit Logs","Optimization","Academic Sessions","Templates & Clone","Public Sharing","Analytics","Validation","Master Data Settings","Settings","Excel Import","Timetable","User Management"];
  if(role==="SCHEDULER") return ["Dashboard","Attendance","Students","Student Profile","Student Promotion","Fees","Full Session Timetable","All Program Timetables","My Timetable","Calendar View","Section Portal","Notifications","Change History","Reports","Audit Logs","Optimization","Academic Sessions","Templates & Clone","Public Sharing","Analytics","Validation","Master Data Settings","Settings","Excel Import","Timetable"];
  if(role==="FACULTY") return ["Dashboard","Attendance","Student Profile","Full Session Timetable","All Program Timetables","My Timetable","Faculty Portal","Section Portal","Notifications","Change History","Analytics","Validation","Timetable"];
  return ["Dashboard","Attendance","Student Profile","Full Session Timetable","All Program Timetables","My Timetable","Calendar View","Section Portal","Notifications","Change History","Analytics","Validation","Timetable"];
}

