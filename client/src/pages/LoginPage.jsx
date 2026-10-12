import React, {useState} from "react";
import axios from "axios";
import {API, API_CONFIGURATION_ERROR} from "../core/api";
import {CalendarDays} from "lucide-react";

export default function Login({onLogin}){
  const [form,setForm]=useState({username:"",password:""});
  const [error,setError]=useState(""); const [busy,setBusy]=useState(false);
  async function submit(e){e.preventDefault();setError("");if(!API){setError(API_CONFIGURATION_ERROR);return;}setBusy(true);try{const r=await axios.post(`${API}/auth/login`,form);localStorage.setItem("tt_token",r.data.token);localStorage.setItem("tt_user",JSON.stringify(r.data.user));onLogin(r.data.user)}catch(e){setError(e.response?.data?.message||"Unable to login.")}finally{setBusy(false)}}
  return <div className="login-page"><form className="login-card" onSubmit={submit}><div className="login-brand"><div className="login-brand-icon"><CalendarDays size={28}/></div><h1>Time Table</h1><p>Secure academic timetable management</p></div><div className="login-form"><label>Username<input value={form.username} onChange={e=>setForm({...form,username:e.target.value})} autoFocus /></label><label>Password<input type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} /></label>{error&&<div className="message error">{error}</div>}<button className="primary login-submit" disabled={busy}>{busy?"Signing in...":"Sign In"}</button><p className="login-help">Use the administrator credentials configured by the system administrator.</p></div></form></div>;
}
