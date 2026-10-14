import axios from "axios";
import {API} from "../core/api";
import React, {useState} from "react";
import AvailabilityMatrix from "./AvailabilityMatrixPage.jsx";
import MasterView from "./MasterViewPage.jsx";
import {Users, BookOpen, DoorOpen, Clock3, Activity, Search} from "lucide-react";

export default function MasterDataSettings({data,setData,reload,setMessage,sessions=[]}){
  const [seeding,setSeeding]=useState(false);
  const [section,setSection]=useState("Programs");
  const [query,setQuery]=useState("");
  const items=[
    {name:"Programs",key:"programs",icon:BookOpen,desc:"Academic programs, departments and duration."},
    {name:"Semesters",key:"semesters",icon:BookOpen,desc:"Semesters linked to an academic session and program."},
    {name:"Faculty",key:"faculty",icon:Users,desc:"Faculty workload and working-day settings."},
    {name:"Subjects",key:"subjects",icon:BookOpen,desc:"Subjects, faculty mapping and weekly load."},
    {name:"Sections",key:"sections",icon:Users,desc:"Program sections and daily class limits."},
    {name:"Rooms",key:"rooms",icon:DoorOpen,desc:"Classrooms, labs and room capacity."},
    {name:"Time Slots",key:"timeslots",icon:Clock3,desc:"Daily periods and scheduling order."},
    {name:"Availability",key:"availability",icon:Activity,desc:"Faculty availability by day and period."}
  ];
  const selected=items.find(x=>x.name===section)||items[0];
  const counts={programs:data.programs?.length||0,faculty:data.faculty?.length||0,subjects:data.subjects?.length||0,sections:data.sections?.length||0,semesters:data.semesters?.length||0,rooms:data.rooms?.length||0,timeslots:(data.timeslots||[]).filter(x=>!x.isBreak).length};
  const total=Object.values(counts).reduce((a,b)=>a+b,0);
  const filteredItems=items.filter(x=>`${x.name} ${x.desc}`.toLowerCase().includes(query.toLowerCase()));
  function select(name){setSection(name);setQuery("");}
  return <div className="master-settings-page">
    <section className="master-settings-hero">
      <div>
        
        <h2>Master Data Settings</h2>
        <p>Configure academic masters, then load clearly labelled sample records for testing.</p>
        <button type="button" className="secondary" disabled={seeding} onClick={async()=>{
          if(!window.confirm("Load demo records for 2026-27? Existing records will be preserved. Demo programs, faculty, rooms, sections, subjects, students and time slots will be added if missing.")) return;
          setSeeding(true);
          try {
            const response=await axios.post(`${API}/demo/seed`);
            setMessage(`${response.data.message} Added: ${Object.entries(response.data.counts||{}).map(([k,v])=>`${k} ${v}`).join(", ")}.`);
            await reload?.();
          } catch(error) {
            setMessage(error.response?.data?.message||"Unable to load demo data. Sign in with an administrator account and check the backend.");
          } finally { setSeeding(false); }
        }}>{seeding?"Loading demo data…":"Load Demo Data"}</button>
      </div>
      <div className="master-settings-total"><strong>{total}</strong><span>configured records</span></div>
    </section>

    <section className="master-overview-grid">
      {items.slice(0,7).map(({name,key,icon:Icon})=><button key={name} className={`master-overview-card ${section===name?"active":""}`} onClick={()=>select(name)}>
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
          : <MasterView type={selected.name} data={data} setData={setData} reload={reload} sessions={sessions} setMessage={setMessage}/>
        }
      </div>
    </section>
  </div>;
}
