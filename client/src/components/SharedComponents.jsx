import React, {useId} from "react";
import {Activity} from "lucide-react";

export function Metric({label,value}){return <div className="card"><div className="icon"><Activity/></div><div><span>{label}</span><strong>{value}</strong></div></div>}

export function Progress({value}){return <div className="progress-wrap"><div className="progress"><span style={{width:`${Math.min(100,Math.max(0,value||0))}%`}}></span></div><small>{value}%</small></div>}

export function Input({label,value,onChange,type="text",disabled=false,required=false,min,max,step,placeholder="",autoComplete}) { const id=useId(); return <div className="field"><label htmlFor={id}>{label}</label><input id={id} type={type} value={value??""} disabled={disabled} required={required} min={min} max={max} step={step} placeholder={placeholder} autoComplete={autoComplete} onChange={e=>onChange(e.target.value)} /></div>; }

export function Select({label,value,onChange,options=[],disabled=false,placeholder="Select...",required=false}) { const id=useId(); const hasPlaceholder=options.some(([v])=>String(v)===""); return <div className="field"><label htmlFor={id}>{label}</label><select id={id} value={value||""} disabled={disabled} required={required} onChange={e=>onChange(e.target.value)}>{!hasPlaceholder&&<option value="">{placeholder}</option>}{options.map(([v,l],i)=><option key={`${String(v)}-${i}`} value={v}>{l}</option>)}</select></div>; }
