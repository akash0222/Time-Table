import React, {useEffect, useState} from "react";
import axios from "axios";
import {API} from "../core/api";
import {authRole} from "../core/utils.js";
import {RotateCcw} from "lucide-react";

export default function AuditLogs(){
  const [data,setData]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(""),[action,setAction]=useState(""),[category,setCategory]=useState(""),[page,setPage]=useState(1);
  async function load(){setLoading(true);setError("");try{const q=new URLSearchParams({page,limit:50});if(action)q.set("action",action);if(category)q.set("category",category);setData((await axios.get(`${API}/audit?${q.toString()}`)).data)}catch(e){setError(e.response?.data?.message||e.message)}finally{setLoading(false)}}
  useEffect(()=>{load()},[page,action,category]);
  async function clear(){if(!window.confirm("Delete all audit logs? This cannot be undone."))return;try{await axios.delete(`${API}/audit/clear`);setPage(1);await load()}catch(e){setError(e.response?.data?.message||e.message)}}
  if(loading&&!data)return <div className="panel"><h2>Audit Logs</h2><p>Loading audit history...</p></div>;
  return <div>
    <div className="analytics-toolbar"><div><h2>Audit Logs</h2></div><div className="form-actions"><button className="secondary" onClick={load}><RotateCcw size={15}/> Refresh</button>{authRole()==="ADMIN"&&<button className="secondary" onClick={clear}>Clear Logs</button>}</div></div>
    {error&&<div className="message error">{error}</div>}
    <section className="panel"><div className="view-filter"><div className="field"><label>Action</label><select value={action} onChange={e=>{setPage(1);setAction(e.target.value)}}><option value="">All actions</option>{(data?.actions||[]).map(x=><option key={x}>{x}</option>)}</select></div><div className="field"><label>Category</label><select value={category} onChange={e=>{setPage(1);setCategory(e.target.value)}}><option value="">All categories</option>{(data?.categories||[]).map(x=><option key={x}>{x}</option>)}</select></div></div>
      <div className="table-wrap"><table><thead><tr><th>Date/Time</th><th>User</th><th>Role</th><th>Action</th><th>Category</th><th>Description</th></tr></thead><tbody>{(data?.rows||[]).map(x=><tr key={x._id}><td>{new Date(x.createdAt).toLocaleString()}</td><td>{x.user?.name||x.username||"System"}</td><td>{x.role||"—"}</td><td><span className="audit-action">{x.action}</span></td><td>{x.category}</td><td>{x.description}</td></tr>)}</tbody></table></div>
      {!data?.rows?.length&&<div className="empty-state"><h3>No audit records</h3></div>}
      <div className="audit-pagination"><span>{data?.total||0} record(s)</span><div><button className="secondary" disabled={page<=1} onClick={()=>setPage(page-1)}>Previous</button> <button className="secondary" disabled={page>=(data?.pages||1)} onClick={()=>setPage(page+1)}>Next</button></div></div>
    </section>
  </div>;
}
