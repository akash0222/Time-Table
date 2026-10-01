import React from "react";
export function Input({label,value,onChange,type="text"}){return <div className="field"><label>{label}</label><input type={type} value={value||""} onChange={e=>onChange(e.target.value)} /></div>}
export function Select({label,value,onChange,options}){return <div className="field"><label>{label}</label><select value={value||""} onChange={e=>onChange(e.target.value)}><option value="">Select...</option>{options.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div>}
