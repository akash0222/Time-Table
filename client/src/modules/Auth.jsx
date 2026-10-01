import React, {useEffect, useMemo, useState} from "react";
import axios from "axios";
import {CalendarDays, Users, BookOpen, DoorOpen, Clock3, WandSparkles, Database, Trash2, Settings2, Check, X, FileSpreadsheet, Upload, Lock, Send, RotateCcw, ShieldCheck, BarChart3, Activity, Bell, UserCheck, RefreshCw, Copy, QrCode, History, ClipboardCheck, UserPlus, DollarSign, GraduationCap, Search, ArrowRight, UsersRound} from "lucide-react";
import {API, days, apiName, refId} from "../core/api";
import {Input, Select} from "../components/FormControls";
import {Metric, Progress} from "../components/Metrics";
import {localToday, authRole} from "../core/helpers";

export function Login({onLogin}){
  const [form,setForm]=useState({username:"admin",password:"admin123"});
  const [error,setError]=useState(""); const [busy,setBusy]=useState(false);
  async function submit(e){e.preventDefault();setBusy(true);setError("");try{const r=await axios.post(`${API}/auth/login`,form);localStorage.setItem("tt_token",r.data.token);localStorage.setItem("tt_user",JSON.stringify(r.data.user));onLogin(r.data.user)}catch(e){setError(e.response?.data?.message||"Unable to login.")}finally{setBusy(false)}}
  return <div className="login-page"><form className="login-card" onSubmit={submit}><div className="login-brand"><div className="login-brand-icon"><CalendarDays size={28}/></div><h1>Time Table</h1><p>Secure academic timetable management</p></div><div className="login-form"><label>Username<input value={form.username} onChange={e=>setForm({...form,username:e.target.value})} autoFocus /></label><label>Password<input type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} /></label>{error&&<div className="message error">{error}</div>}<button className="primary login-submit" disabled={busy}>{busy?"Signing in...":"Sign In"}</button><p className="login-help">Default administrator: <strong>admin / admin123</strong>. Change the password after first login.</p></div></form></div>;
}

