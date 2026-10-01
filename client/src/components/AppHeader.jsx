import React from "react";
import {Activity, ChevronRight, Search, X} from "lucide-react";

export default function AppHeader({tab,location,searchQuery,setSearchQuery,searchOpen,setSearchOpen,searchResults,onNavigate}){
  const parts=location.pathname.split("/").filter(Boolean);
  return <header className="erp-header">
    <div className="header-main">
      <div className="header-title-wrap">
        <div className="breadcrumb">
          <button onClick={()=>onNavigate("/dashboard")}>Home</button>
          {parts.length>0&&<ChevronRight size={13}/>}<span>{tab}</span>
        </div>
        <h1>{tab}</h1>
        <p>Constraint-based timetable generator with local MongoDB.</p>
      </div>
      <div className="header-actions">
        <div className={`global-search ${searchOpen?"open":""}`}>
          <button className="search-trigger" onClick={()=>setSearchOpen(true)} aria-label="Search modules"><Search size={17}/><span>Search modules</span><kbd>Ctrl K</kbd></button>
          {searchOpen&&<div className="search-popover">
            <div className="search-input-wrap"><Search size={17}/><input autoFocus value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} placeholder="Search ERP modules..."/><button onClick={()=>{setSearchQuery("");setSearchOpen(false)}} aria-label="Close search"><X size={16}/></button></div>
            <div className="search-results">{searchResults.length?searchResults.slice(0,8).map(r=><button key={r.name} onClick={()=>{onNavigate(r.path);setSearchOpen(false);setSearchQuery("")}}><Activity size={15}/><span>{r.name}</span><small>{r.group}</small></button>):<div className="search-empty">No matching modules</div>}</div>
          </div>}
        </div>
        <div className="status"><span></span> Local Database</div>
      </div>
    </div>
  </header>;
}
