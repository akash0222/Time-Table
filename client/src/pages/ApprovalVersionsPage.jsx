import React,{useEffect,useMemo,useState} from "react";
import axios from "axios";
import {API} from "../core/api";
import {
  ShieldCheck,History,GitCompare,RotateCcw,RefreshCw,CheckCircle2,
  AlertTriangle,Clock3,ArrowRight,Plus,Minus,ArrowLeftRight,Send,Lock
} from "lucide-react";

const STATUS_STEPS=["DRAFT","SUBMITTED","APPROVED","PUBLISHED","LOCKED"];
const STATUS_LABELS={
  DRAFT:"Draft",
  SUBMITTED:"Submitted for review",
  APPROVED:"Approved",
  PUBLISHED:"Published",
  LOCKED:"Locked"
};
const ACTION_LABELS={
  SUBMITTED:"Submit for review",
  DRAFT:"Return to draft",
  APPROVED:"Approve timetable",
  PUBLISHED:"Publish timetable",
  LOCKED:"Lock timetable"
};

function formatDate(value){
  if(!value)return "—";
  const date=new Date(value);
  return Number.isNaN(date.getTime())?"—":date.toLocaleString();
}

function VersionLabel({version}){
  if(!version)return "Unknown version";
  return <>{version.versionLabel||("Version "+version.version)}{version.isCurrent?" · Current":""} · {version.status||"DRAFT"}</>;
}

function actionLabel(action,currentStatus){
  if(action.status==="DRAFT")return "Return to draft";
  if(currentStatus==="LOCKED"&&action.status==="PUBLISHED")return "Unlock to published";
  if(currentStatus==="APPROVED"&&action.status==="SUBMITTED")return "Request changes";
  return ACTION_LABELS[action.status]||action.status;
}

function TypeIcon({type}){
  if(type==="ADDED")return <Plus size={14}/>;
  if(type==="REMOVED")return <Minus size={14}/>;
  return <ArrowLeftRight size={14}/>;
}

export default function ApprovalVersionsPage({activeSession,role,onRefresh,setMessage}={}){
  const [workflow,setWorkflow]=useState(null);
  const [versions,setVersions]=useState([]);
  const [compareFrom,setCompareFrom]=useState("");
  const [compareTo,setCompareTo]=useState("");
  const [comparison,setComparison]=useState(null);
  const [note,setNote]=useState("");
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState("");
  const [error,setError]=useState("");

  async function load(){
    if(!activeSession?._id){
      setWorkflow(null);setVersions([]);setComparison(null);setLoading(false);return;
    }
    setLoading(true);setError("");
    try{
      const params={sessionId:activeSession._id};
      const [workflowResponse,versionsResponse]=await Promise.all([
        axios.get(`${API}/timetable/workflow`,{params}),
        axios.get(`${API}/timetable/versions`,{params})
      ]);
      const nextVersions=Array.isArray(versionsResponse.data)?versionsResponse.data:[];
      setWorkflow(workflowResponse.data||null);
      setVersions(nextVersions);
      setCompareTo(current=>nextVersions.some(item=>String(item._id)===String(current))
        ?current:String(nextVersions.find(item=>item.isCurrent)?._id||nextVersions[0]?._id||""));
      setCompareFrom(current=>{
        if(nextVersions.some(item=>String(item._id)===String(current))&&String(current)!==String(nextVersions.find(item=>item.isCurrent)?._id||""))return current;
        return String(nextVersions.find(item=>!item.isCurrent)?._id||nextVersions[1]?._id||"");
      });
      setComparison(null);
    }catch(e){
      setError(e.response?.data?.message||e.message||"Unable to load timetable approval and versions.");
    }finally{setLoading(false);}
  }

  useEffect(()=>{load();},[activeSession?._id]);

  const currentVersion=versions.find(item=>item.isCurrent)||null;
  const currentStatus=workflow?.status||currentVersion?.status||"DRAFT";
  const actions=(workflow?.actions||[]).filter(action=>action.allowed);
  const fromVersion=versions.find(item=>String(item._id)===String(compareFrom));
  const toVersion=versions.find(item=>String(item._id)===String(compareTo));

  const changes=useMemo(()=>{
    const items=comparison?.changes||[];
    return items;
  },[comparison]);

  const changeCounts=[
    {key:"ADDED",label:"Added classes",count:comparison?.summary?.added||0},
    {key:"REMOVED",label:"Removed classes",count:comparison?.summary?.removed||0},
    {key:"CHANGED",label:"Changed classes",count:comparison?.summary?.changed||0},
    {key:"UNCHANGED",label:"Unchanged",count:comparison?.summary?.unchanged||0}
  ];

  async function runAction(action){
    if(busy)return;
    const reason=note.trim();
    if(action.requiresNote&&reason.length<3){
      setError("Enter remarks of at least 3 characters before this workflow action.");
      return;
    }
    setBusy("status");setError("");
    try{
      const response=await axios.patch(`${API}/timetable/status`,{
        status:action.status,
        note:reason,
        sessionId:activeSession?._id||null,
        timetableId:workflow?.timetableId||null
      });
      setNote("");
      setMessage?.(response.data?.message||("Timetable status changed to "+action.status+"."));
      await load();
      await onRefresh?.();
    }catch(e){
      setError(e.response?.data?.message||e.message||"Unable to update timetable status.");
    }finally{setBusy("");}
  }

  async function compareVersions(){
    if(!activeSession?._id||!compareFrom||!compareTo){
      setError("Select two versions to compare.");return;
    }
    if(compareFrom===compareTo){
      setError("Choose two different timetable versions.");return;
    }
    setBusy("compare");setError("");
    try{
      const response=await axios.get(`${API}/timetable/versions/compare`,{
        params:{sessionId:activeSession._id,fromId:compareFrom,toId:compareTo}
      });
      setComparison(response.data);
    }catch(e){
      setComparison(null);
      setError(e.response?.data?.message||e.message||"Unable to compare these versions.");
    }finally{setBusy("");}
  }

  async function restoreVersion(version){
    const reason=note.trim();
    if(reason.length<3){
      setError("Enter a restoration reason of at least 3 characters before restoring.");
      return;
    }
    if(!window.confirm("Restore "+(version.versionLabel||("Version "+version.version))+" as a new Draft? The original version will remain in history."))return;
    setBusy("restore-"+version._id);setError("");
    try{
      const response=await axios.post(`${API}/timetable/${version._id}/restore`,{
        sessionId:activeSession?._id,note:reason
      });
      setNote("");
      setMessage?.("Restored as "+(response.data?.versionLabel||("Version "+response.data?.version))+". A new Draft was created.");
      await load();
      await onRefresh?.();
    }catch(e){
      setError(e.response?.data?.message||e.message||"Unable to restore this version.");
    }finally{setBusy("");}
  }

  if(!["ADMIN","SCHEDULER"].includes(role)){
    return <div className="panel"><h3>Approval & Versions</h3><p>Only Admin and Scheduler roles can manage timetable approval and versions.</p></div>;
  }

  if(loading)return <div className="panel"><h3>Approval & Versions</h3><p>Loading workflow and version history…</p></div>;

  return <div className="approval-versions-page">
    <div className="analytics-toolbar">
      <div><h2>Timetable Approval & Versions</h2><p>Review status, record decisions, compare versions and safely restore a previous timetable.</p></div>
      <button type="button" className="secondary" onClick={load} disabled={Boolean(busy)}><RefreshCw size={15}/> Refresh</button>
    </div>

    {!activeSession?._id
      ?<div className="panel approval-empty-state"><AlertTriangle size={22}/><div><strong>No active academic session</strong><p>Activate an academic session before managing timetable approvals or versions.</p></div></div>
      :<>
        <section className="panel approval-context-panel">
          <div className="approval-context-heading">
            <div><span className="approval-kicker">ACADEMIC SESSION</span><h3>{activeSession.name}</h3></div>
            <span className={"approval-status-pill "+String(currentStatus).toLowerCase()}><ShieldCheck size={15}/>{STATUS_LABELS[currentStatus]||currentStatus}</span>
          </div>
          <div className="approval-progress" aria-label={"Workflow status: "+currentStatus}>
            {STATUS_STEPS.map((status,index)=>{
              const currentIndex=STATUS_STEPS.indexOf(currentStatus);
              const done=index>=0&&index<=currentIndex;
              return <div className={"approval-progress-step "+(done?"done":"")+(status===currentStatus?" active":"")} key={status}>
                <span>{done?<CheckCircle2 size={15}/>:index+1}</span><small>{STATUS_LABELS[status]}</small>
              </div>;
            })}
          </div>
          <div className="approval-current-meta">
            <div><span>Current Version</span><strong>{currentVersion?.versionLabel|| (currentVersion?"Version "+currentVersion.version:"No timetable yet")}</strong></div>
            <div><span>Scheduled Classes</span><strong>{currentVersion?.totalEntries??0}</strong></div>
            <div><span>Last Status Change</span><strong>{formatDate(workflow?.history?.at?.(-1)?.changedAt||currentVersion?.statusChangedAt||currentVersion?.updatedAt)}</strong></div>
          </div>
        </section>

        <section className="panel approval-actions-panel">
          <div className="report-section-heading">
            <div className="report-section-title"><span className="report-section-icon"><ShieldCheck size={17}/></span><div><h3>Approval Actions</h3><p>Only transitions permitted for your role and the current status are enabled.</p></div></div>
            <span className="report-count">{actions.length} available</span>
          </div>
          {actions.length
            ?<div className="approval-action-buttons">
              {actions.map(action=><button
                key={action.status}
                type="button"
                className={["APPROVED","PUBLISHED","LOCKED"].includes(action.status)?"primary":"secondary"}
                disabled={Boolean(busy)}
                onClick={()=>runAction(action)}
              >{action.status==="SUBMITTED"?<Send size={15}/>:action.status==="LOCKED"?<Lock size={15}/>:action.status==="DRAFT"?<RotateCcw size={15}/>:<CheckCircle2 size={15}/>}
                {actionLabel(action,currentStatus)}{action.requiresNote?" *":""}
              </button>)}
            </div>
            :<div className="approval-info-line"><CheckCircle2 size={16}/> No workflow action is currently available.</div>}
          {actions.some(action=>action.requiresNote)&&<p className="approval-help-text">* Remarks are required for actions marked with an asterisk. A reason is also required to restore an older version.</p>}
          {(actions.length>0||versions.some(version=>!version.isCurrent))&&<label className="approval-note-field">Workflow remarks
            <textarea value={note} onChange={event=>setNote(event.target.value)} rows={3} placeholder="Enter approval, publication, return, or change-request remarks…"/>
          </label>}
        </section>

        <section className="panel approval-comparison-panel">
          <div className="report-section-heading">
            <div className="report-section-title"><span className="report-section-icon"><GitCompare size={17}/></span><div><h3>Compare Timetable Versions</h3><p>Identify added, removed, rescheduled and reassigned classes.</p></div></div>
          </div>
          {versions.length<2
            ?<div className="approval-info-line"><History size={17}/> At least two saved timetable versions are needed for a comparison. Generate or restore a version to start comparing.</div>
            :<>
              <div className="approval-compare-controls">
                <label>From version<select aria-label="Compare from version" value={compareFrom} onChange={event=>{setCompareFrom(event.target.value);setComparison(null);}}>{versions.map(version=><option key={version._id} value={version._id}><VersionLabel version={version}/></option>)}</select></label>
                <ArrowRight size={18}/>
                <label>To version<select aria-label="Compare to version" value={compareTo} onChange={event=>{setCompareTo(event.target.value);setComparison(null);}}>{versions.map(version=><option key={version._id} value={version._id}><VersionLabel version={version}/></option>)}</select></label>
                <button type="button" className="primary" disabled={Boolean(busy)||!compareFrom||!compareTo||compareFrom===compareTo} onClick={compareVersions}><GitCompare size={15}/>{busy==="compare"?"Comparing…":"Compare versions"}</button>
              </div>
              {comparison&&<div className="approval-diff-results">
                <div className="approval-diff-heading"><div><strong>{comparison.from?.versionLabel}</strong><ArrowRight size={15}/><strong>{comparison.to?.versionLabel}</strong></div><span>{changes.length} changes · {comparison.summary?.unchanged||0} unchanged</span></div>
                <div className="approval-diff-metrics">
                  {changeCounts.map(item=><div key={item.key} className={"approval-diff-metric "+item.key.toLowerCase()}><strong>{item.count}</strong><span>{item.label}</span></div>)}
                </div>
                <div className="table-wrap">
                  <table className="approval-diff-table">
                    <thead><tr><th>Change</th><th>Subject / Section</th><th>Previous</th><th>New</th><th>Details</th></tr></thead>
                    <tbody>{changes.map((change,index)=><tr key={change.key+"-"+change.type+"-"+index}>
                      <td><span className={"approval-change-type "+change.type.toLowerCase()}><TypeIcon type={change.type}/>{change.type}</span></td>
                      <td><strong>{change.subject}</strong><small>{change.section}</small></td>
                      <td>{change.before?[change.before.day,change.before.startTime,change.before.endTime].join(" · "):"—"}<small>{change.before?"Faculty: "+change.before.faculty+" · Room: "+change.before.room:""}</small></td>
                      <td>{change.after?[change.after.day,change.after.startTime,change.after.endTime].join(" · "):"—"}<small>{change.after?"Faculty: "+change.after.faculty+" · Room: "+change.after.room:""}</small></td>
                      <td>{(change.fields||[]).length?change.fields.map(field=><div className="approval-field-diff" key={field.field}><strong>{field.field}:</strong> {String(field.before)} → {String(field.after)}</div>):change.type==="ADDED"?"Class added":change.type==="REMOVED"?"Class removed":"—"}</td>
                    </tr>)}
                    {!changes.length&&<tr><td colSpan={5}><div className="report-empty-cell">No class changes were detected between these versions.</div></td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>}
            </>}
        </section>

        <section className="panel approval-versions-panel">
          <div className="report-section-heading">
            <div className="report-section-title"><span className="report-section-icon"><History size={17}/></span><div><h3>Version History & Safe Restore</h3><p>Restoring never overwrites the source version; it creates a new Draft with a recorded reason.</p></div></div>
            <span className="report-count">{versions.length} versions</span>
          </div>
          {versions.length
            ?<div className="table-wrap"><table className="approval-versions-table">
              <thead><tr><th>Version</th><th>Status</th><th>Classes</th><th>Created</th><th>Action</th></tr></thead>
              <tbody>{versions.map(version=><tr key={version._id} className={version.isCurrent?"current":""}>
                <td><strong>{version.versionLabel||("Version "+version.version)}</strong>{version.isCurrent&&<small className="approval-current-label">Current version</small>}</td>
                <td><span className={"approval-status-pill compact "+String(version.status||"DRAFT").toLowerCase()}>{STATUS_LABELS[version.status]||version.status||"Draft"}</span></td>
                <td>{version.totalEntries??0}</td><td>{formatDate(version.createdAt)}</td>
                <td>{version.isCurrent?<span className="approval-no-action">Current</span>:<button type="button" className="secondary approval-restore-button" disabled={Boolean(busy)} onClick={()=>restoreVersion(version)}><RotateCcw size={14}/>{busy==="restore-"+version._id?"Restoring…":"Restore as Draft"}</button>}</td>
              </tr>)}</tbody>
            </table></div>
            :<div className="approval-info-line"><History size={17}/> No timetable versions are saved for this academic session yet.</div>}
        </section>

        <section className="panel approval-history-panel">
          <div className="report-section-heading">
            <div className="report-section-title"><span className="report-section-icon"><Clock3 size={17}/></span><div><h3>Approval History</h3><p>Who changed the status, when the action occurred, and the recorded remarks.</p></div></div>
          </div>
          {(workflow?.history||[]).length
            ?<div className="approval-history-list">{[...(workflow.history||[])].reverse().map((item,index)=><div className="approval-history-item" key={item._id||index}>
              <div className="approval-history-rail"><span/></div><div className="approval-history-copy">
                <div className="approval-history-title"><strong>{STATUS_LABELS[item.to]||item.to}</strong><span>{formatDate(item.changedAt)}</span></div>
                <p>{item.from||"—"} <ArrowRight size={13}/> {item.to}</p>
                <small>{item.username||item.user?.username||"Unknown user"}{item.role?" · "+item.role:""}</small>
                {item.note&&<blockquote>{item.note}</blockquote>}
              </div>
            </div>)}</div>
            :<div className="approval-info-line"><History size={17}/> No approval actions have been recorded for the current version.</div>}
        </section>
      </>}

    {error&&<div className="message error" role="alert">{error}</div>}
  </div>;
}
