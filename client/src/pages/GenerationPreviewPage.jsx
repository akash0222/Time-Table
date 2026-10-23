import React, { useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, CalendarDays, CheckCircle2, FileText, Save, XCircle } from "lucide-react";

const cardStyle = { background: "var(--panel, #fff)", border: "1px solid var(--border, #e5e7eb)", borderRadius: 14, padding: 16, minWidth: 0 };
const muted = { color: "var(--muted, #64748b)", fontSize: 13 };
const label = { fontSize: 12, color: "var(--muted, #64748b)", marginBottom: 6 };
const valueStyle = { fontSize: 24, lineHeight: 1.2, fontWeight: 750 };
const pill = status => ({ display: "inline-flex", alignItems: "center", gap: 5, borderRadius: 20, padding: "5px 9px", fontSize: 12, fontWeight: 700, background: /PASSED|READY|CHECKED/i.test(status) ? "#dcfce7" : /FAILED|UNSCHEDULED|NOT VERIFIED/i.test(status) ? "#fee2e2" : "#fef3c7", color: /PASSED|READY|CHECKED/i.test(status) ? "#166534" : /FAILED|UNSCHEDULED|NOT VERIFIED/i.test(status) ? "#991b1b" : "#92400e" });

export default function GenerationPreviewPage({ preview, onCommit, onDiscard, loading = false }) {
  const [day, setDay] = useState("All days");
  const [reportTab, setReportTab] = useState("overview");
  const report = preview?.generationReport || {};
  const summary = report.summary || {};
  const entries = useMemo(() => (preview?.entries || []).filter(row => day === "All days" || row.day === day)
    .slice().sort((a,b) => ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"].indexOf(a.day)-["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"].indexOf(b.day) || String(a.startTime).localeCompare(String(b.startTime))), [preview, day]);
  const days = ["All days","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
  if (!preview) return <section style={cardStyle}><h2>Timetable Preview</h2><p style={muted}>No preview is open. Start Generate Timetable to review a candidate before saving it.</p></section>;
  const checks = report.checks || [];
  const unscheduled = report.unscheduled || [];
  const warnings = report.warnings || preview.warnings || [];
  const errors = report.errors || [];
  const columns = [
    ["Day / time", row => <><strong>{row.day}</strong><div style={muted}>{row.startTime}–{row.endTime}</div></>],
    ["Subject", row => <><strong>{row.subject?.name || row.subject || "Subject"}</strong><div style={muted}>{row.subject?.code || ""}</div></>],
    ["Section", row => row.section?.name || row.section || "Section"],
    ["Faculty", row => row.faculty?.name || row.faculty || "Faculty"],
    ["Room", row => row.room?.name || row.room || "Room"]
  ];
  const percent = Math.max(0, Math.min(100, Number(summary.coveragePercent || 0)));
  return <div style={{ display: "grid", gap: 16 }}>
    <section style={{ ...cardStyle, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
      <div style={{ minWidth: 220, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}><CalendarDays size={20}/><h2 style={{ margin: 0 }}>Timetable Preview & Generation Report</h2></div>
        <p style={{ margin: "6px 0 10px", ...muted }}>{report.scope?.academicSessionName || "Selected academic session"} · {(report.scope?.programNames || []).join(", ") || "Selected program scope"}</p>
        <div style={pill(preview.committable ? "READY" : "UNSCHEDULED")}>{preview.committable ? <CheckCircle2 size={14}/> : <AlertTriangle size={14}/>} {preview.committable ? "Ready to save as Draft" : "Review findings — saving is disabled"}</div>
        {preview.expiresAt && <p style={{ ...muted, marginBottom: 0 }}>Preview expires: {new Date(preview.expiresAt).toLocaleString()}</p>}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="secondary" type="button" onClick={onDiscard} disabled={loading}><ArrowLeft size={15}/> Discard preview</button>
        <button className="primary" type="button" onClick={onCommit} disabled={loading || !preview.committable}><Save size={15}/>{loading ? "Saving…" : "Save as Draft"}</button>
      </div>
    </section>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(145px,1fr))", gap: 12 }}>
      <div style={cardStyle}><div style={label}>Weekly coverage</div><div style={valueStyle}>{percent}%</div><div style={{ height: 6, background: "#e2e8f0", borderRadius: 8, marginTop: 12, overflow: "hidden" }}><div style={{ width: percent + "%", height: "100%", background: percent === 100 ? "#16a34a" : "#d97706" }}/></div></div>
      <div style={cardStyle}><div style={label}>Classes scheduled</div><div style={valueStyle}>{summary.scheduledSessions ?? (preview.entries || []).length}<span style={{ fontSize: 14, color: "#64748b" }}> / {summary.requiredSessions ?? "—"}</span></div></div>
      <div style={cardStyle}><div style={label}>Unscheduled sessions</div><div style={{ ...valueStyle, color: Number(summary.unscheduledSessions) ? "#b91c1c" : "#15803d" }}>{summary.unscheduledSessions ?? "—"}</div></div>
      <div style={cardStyle}><div style={label}>Hard validation</div><div style={{ fontSize: 18, fontWeight: 750, marginTop: 4 }}>{summary.hardValidation || "NOT VERIFIED"}</div><div style={muted}>{summary.hardErrorCount ?? 0} hard errors</div></div>
      <div style={cardStyle}><div style={label}>Quality score</div><div style={valueStyle}>{report.qualityMetrics?.qualityScore ?? "—"}<span style={{ fontSize: 13, color: "#64748b" }}>{report.qualityMetrics?.qualityScore != null ? " / 100" : ""}</span></div></div>
    </div>

    <section style={cardStyle}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div><h3 style={{ margin: "0 0 4px" }}>Weekly schedule</h3><p style={{ ...muted, margin: 0 }}>Review placement details before saving.</p></div>
        <select value={day} onChange={event => setDay(event.target.value)} aria-label="Filter timetable by day" style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 10px", background: "var(--panel, white)" }}>{days.map(item => <option key={item}>{item}</option>)}</select>
      </div>
      {entries.length ? <div style={{ overflowX: "auto" }}><table style={{ borderCollapse: "collapse", width: "100%", minWidth: 650, fontSize: 13 }}>
        <thead><tr>{columns.map(([heading]) => <th key={heading} style={{ textAlign: "left", padding: "10px 12px", borderBottom: "1px solid #e2e8f0", color: "#64748b", fontWeight: 650 }}>{heading}</th>)}</tr></thead>
        <tbody>{entries.map((row,index) => <tr key={row._id || row.key || [row.day,row.startTime,row.subject?.name || row.subject,index].join("-")}>{columns.map(([heading, render]) => <td key={heading} style={{ padding: "12px", borderBottom: "1px solid #eef2f7", verticalAlign: "top" }}>{render(row)}</td>)}</tr>)}</tbody>
      </table></div> : <p style={muted}>No placements to display for this selection.</p>}
    </section>

    <section style={cardStyle}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }} role="tablist" aria-label="Generation report sections">
        {[["overview","Validation checks"],["unscheduled","Unscheduled sessions"],["reasons","Warnings & errors"]].map(([id,title]) => <button key={id} type="button" role="tab" aria-selected={reportTab===id} className={reportTab===id?"primary":"secondary"} onClick={()=>setReportTab(id)}>{title}{id==="unscheduled"&&unscheduled.length ? " ("+unscheduled.length+")" : ""}</button>)}
      </div>
      {reportTab === "overview" && <div style={{ display: "grid", gap: 10 }}>
        {checks.map((check,index) => <div key={check.name || index} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: 12, border: "1px solid #e2e8f0", borderRadius: 10 }}>
          {check.status === "PASSED" ? <CheckCircle2 size={18} color="#16a34a"/> : check.status === "FAILED" ? <XCircle size={18} color="#dc2626"/> : <AlertTriangle size={18} color="#d97706"/>}
          <div style={{ flex: 1 }}><strong>{check.name}</strong><div style={{ ...muted, marginTop: 3 }}>{check.detail}</div></div><span style={pill(check.status)}>{check.status}</span>
        </div>)}
        {!checks.length && <p style={muted}>No validation-check summary was returned.</p>}
      </div>}
      {reportTab === "unscheduled" && <div style={{ display: "grid", gap: 10 }}>
        {unscheduled.map((item,index) => <div key={item.subjectId || item.subject || index} style={{ border: "1px solid #fecaca", background: "rgba(254,226,226,.25)", borderRadius: 10, padding: 13 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}><strong>{item.subject}</strong><span style={pill("UNSCHEDULED")}>{item.missing} missing</span></div>
          <p style={{ margin: "6px 0", ...muted }}>{item.section} · {item.faculty}</p><p style={{ margin: 0, fontSize: 13 }}>{item.reason || "No reason supplied by the generator."}</p>
          <p style={{ margin: "6px 0 0", ...muted }}>Scheduled {item.scheduled} of {item.required} required session(s).</p>
        </div>)}
        {!unscheduled.length && <p style={{ color: "#15803d" }}><CheckCircle2 size={16} style={{ verticalAlign: "middle", marginRight: 6 }}/>All required subject sessions are placed.</p>}
      </div>}
      {reportTab === "reasons" && <div style={{ display: "grid", gap: 12 }}>
        {[["Hard errors", errors],["Warnings", warnings]].map(([heading,list]) => <div key={heading}><h4 style={{ margin: "0 0 8px" }}>{heading} ({list.length})</h4>{list.length ? <ul style={{ margin: 0, paddingLeft: 22 }}>{list.map((item,index) => <li key={index} style={{ marginBottom: 6, fontSize: 13 }}>{typeof item === "string" ? item : item.message || JSON.stringify(item)}</li>)}</ul> : <p style={muted}>None reported.</p>}</div>)}
      </div>}
    </section>
    <section style={{ ...cardStyle, display: "flex", alignItems: "flex-start", gap: 10 }}>
      <FileText size={19} style={{ flexShrink: 0, marginTop: 2 }}/><div><strong>How to interpret the report</strong><p style={{ ...muted, margin: "5px 0 0" }}>Placement explanations describe the feasible constraints and preferences considered by the generator; they are not a full record of every search/backtracking decision. A partial candidate can help diagnose configuration problems, but this workflow deliberately blocks saving until coverage is complete and hard validation passes.</p></div>
    </section>
  </div>;
}
