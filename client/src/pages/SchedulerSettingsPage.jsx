import React, {useState} from "react";
import axios from "axios";
import {API} from "../core/api";
import {days} from "../core/utils.js";

export default function SchedulerSettings({settings,setSettings,setMessage,activeSession}){
  const [saving,setSaving]=useState(false);

  const update=(key,value)=>{
    setSettings(prev=>({...prev,[key]:value}));
  };

  async function save(){
    setSaving(true);
    setMessage("");
    try{
      const payload={
        maxConsecutiveFaculty:Number(settings.maxConsecutiveFaculty||2),
        maxConsecutiveSection:Number(settings.maxConsecutiveSection||3),
        avoidSameSubjectSameDay:Boolean(settings.avoidSameSubjectSameDay),
        distributeSubjectAcrossDays:Boolean(settings.distributeSubjectAcrossDays),
        avoidFirstLastPeriod:Boolean(settings.avoidFirstLastPeriod),
        holidayDays:["Sunday", ...(Array.isArray(settings.holidayDays)?settings.holidayDays:[])].filter((v,i,a)=>a.indexOf(v)===i),
        generationRuns:Number(settings.generationRuns||8),
        generationTimeLimitMs:Number(settings.generationTimeLimitMs||30000)
      };
      const r=await axios.put(`${API}/settings`,{...payload,academicSessionId:activeSession?._id||""});
      setSettings(r.data);
      setMessage("Scheduler settings saved successfully.");
    }catch(e){
      setMessage(e.response?.data?.message||e.message);
    }finally{
      setSaving(false);
    }
  }

  return <div className="panel">
    <div className="panel-head">
      <div>
        <h3>Scheduler Settings</h3>
        
      </div>
    </div>

    <div className="settings-grid">
      <div className="field">
        <label>Max Consecutive Classes — Faculty</label>
        <input
          type="number"
          min="1"
          max="8"
          value={settings.maxConsecutiveFaculty??2}
          onChange={e=>update("maxConsecutiveFaculty",e.target.value)}
        />
      </div>

      <div className="field">
        <label>Max Consecutive Classes — Section</label>
        <input
          type="number"
          min="1"
          max="8"
          value={settings.maxConsecutiveSection??3}
          onChange={e=>update("maxConsecutiveSection",e.target.value)}
        />
      </div>

      <label className="setting-check">
        <input
          type="checkbox"
          checked={!!settings.avoidSameSubjectSameDay}
          onChange={e=>update("avoidSameSubjectSameDay",e.target.checked)}
        />
        <span>
          <strong>Avoid Same Subject Same Day</strong>
          <small>Do not place repeated sessions of the same subject on one day.</small>
        </span>
      </label>

      <label className="setting-check">
        <input
          type="checkbox"
          checked={!!settings.distributeSubjectAcrossDays}
          onChange={e=>update("distributeSubjectAcrossDays",e.target.checked)}
        />
        <span>
          <strong>Distribute Subject Across Days</strong>
          <small>Spread weekly subject sessions across different days where possible.</small>
        </span>
      </label>

      <div className="field" style={{gridColumn:"1 / -1"}}>
        <label>Holiday Days</label>
        <div className="checks">
          {days.map(d=>{
            const isSunday=d==="Sunday";
            const checked=isSunday || (Array.isArray(settings.holidayDays)&&settings.holidayDays.includes(d));
            return <label key={d}>
              <input
                type="checkbox"
                checked={checked}
                disabled={isSunday}
                onChange={e=>{
                  const current=new Set(Array.isArray(settings.holidayDays)?settings.holidayDays:[]);
                  if(e.target.checked) current.add(d); else current.delete(d);
                  current.add("Sunday");
                  update("holidayDays",[...current]);
                }}
              /> {d}{isSunday&&<small style={{marginLeft:6,color:"#b45309"}}>Default holiday</small>}
            </label>;
          })}
        </div>
        <small className="field-help">Sunday is always a holiday. Select any additional recurring holiday days. The timetable generator will never place classes on selected holiday days.</small>
      </div>

      <div className="field"><label>Generation Comparison Runs</label><input type="number" min="1" max="20" value={settings.generationRuns??8} onChange={e=>update("generationRuns",e.target.value)} /><small className="field-help">Generate multiple candidates and keep the best-scoring timetable.</small></div>
      <div className="field"><label>Total Generation Time (seconds)</label><input type="number" min="5" max="60" value={Math.round(Number(settings.generationTimeLimitMs??30000)/1000)} onChange={e=>update("generationTimeLimitMs",Math.max(5,Math.min(60,Number(e.target.value||30)))*1000)} /><small className="field-help">The time budget is shared across candidate generations.</small></div>

      <label className="setting-check">
        <input
          type="checkbox"
          checked={!!settings.avoidFirstLastPeriod}
          onChange={e=>update("avoidFirstLastPeriod",e.target.checked)}
        />
        <span>
          <strong>Avoid First / Last Period</strong>
          <small>Try not to use the first or last period.</small>
        </span>
      </label>
    </div>

    <div className="settings-footer">
      <button className="primary" onClick={save} disabled={saving}>
        {saving?"Saving...":"Save Settings"}
      </button>
    </div>
  </div>;
}
