import React, {useState} from "react";
import axios from "axios";
import {API} from "../core/api";
import {FileSpreadsheet, Upload} from "lucide-react";

export default function ExcelImport({reload,setMessage}){
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
    <div className="import-actions"><button className="secondary" onClick={downloadTemplate}><FileSpreadsheet size={17}/> Download Excel Template</button><label className="file-picker"><Upload size={17}/><span>{file?file.name:"Choose Excel file"}</span><input type="file" accept=".xlsx,.xls" onChange={e=>setFile(e.target.files?.[0]||null)}/></label><button className="primary" onClick={upload} disabled={busy}>{busy?"Importing...":"Import"}</button></div>
    <div className="import-grid"><div><h3>Required sheets</h3><ul><li>Programs</li><li>Faculty</li><li>Sections</li><li>Rooms</li><li>TimeSlots</li><li>Subjects</li></ul></div><div><h3>Optional sheet</h3><ul><li>Availability — one row per faculty/day/period</li></ul><p>Example: <code>Dr. Amit Sharma | Monday | 09:00 | 10:00 | Yes</code></p></div></div>
    {result&&<div className="import-result">Imported: {Object.entries(result).map(([k,v])=><span key={k}><strong>{v}</strong> {k}</span>)}</div>}
  </div>
}
