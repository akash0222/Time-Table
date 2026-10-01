import React from "react";
import {Activity} from "lucide-react";
export function Metric({label,value}){return <div className="card"><div className="icon"><Activity/></div><div><span>{label}</span><strong>{value}</strong></div></div>}
export function Progress({value}){return <div className="progress-wrap"><div className="progress"><span style={{width:`${Math.min(100,Math.max(0,value||0))}%`}}></span></div><small>{value}%</small></div>}
