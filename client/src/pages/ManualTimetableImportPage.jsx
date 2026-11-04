import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  AlertCircle, CheckCircle2, Clock3, Download, FileSpreadsheet,
  RefreshCw, ShieldCheck, Upload, XCircle
} from "lucide-react";
import { API } from "../core/api";

const number = value => Number(value || 0).toLocaleString("en-IN");

export default function ManualTimetableImport({
  activeSession = null,
  onImported = () => {},
  setMessage = () => {},
  onNavigate = () => {}
}) {
  const [sessions, setSessions] = useState([]);
  const [sessionId, setSessionId] = useState(String(activeSession?._id || ""));
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [pageError, setPageError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoadingSessions(true);
      try {
        const response = await axios.get(`${API}/sessions`);
        if (!alive) return;
        const rows = Array.isArray(response.data) ? response.data : [];
        setSessions(rows);
        const preferred = String(activeSession?._id || rows.find(row => row.active)?._id || rows[0]?._id || "");
        setSessionId(current => current && rows.some(row => String(row._id) === current) ? current : preferred);
      } catch (error) {
        if (alive) setPageError(error.response?.data?.message || error.message || "Unable to load academic sessions.");
      } finally {
        if (alive) setLoadingSessions(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const selectedSession = useMemo(
    () => sessions.find(row => String(row._id) === String(sessionId)) || activeSession || null,
    [sessions, sessionId, activeSession]
  );

  async function downloadTemplate() {
    setDownloading(true);
    setPageError("");
    try {
      const response = await axios.get(`${API}/timetable/manual-import/template`, { responseType: "blob" });
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "scheduly-manual-timetable-template.xlsx";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setPageError(error.response?.data?.message || error.message || "Unable to download the template.");
    } finally {
      setDownloading(false);
    }
  }

  function chooseFile(nextFile) {
    setFile(nextFile);
    setPreview(null);
    setPageError("");
  }

  async function createPreview(event) {
    event.preventDefault();
    if (!sessionId) {
      setPageError("Select the Academic Session for this timetable.");
      return;
    }
    if (!file) {
      setPageError("Choose the .xlsx timetable workbook first.");
      return;
    }
    setPreviewing(true);
    setPageError("");
    setPreview(null);
    try {
      const data = new FormData();
      data.append("academicSessionId", sessionId);
      data.append("file", file);
      const response = await axios.post(`${API}/timetable/manual-import/preview`, data);
      setPreview(response.data);
    } catch (error) {
      const data = error.response?.data;
      if (data && data.committable === false) {
        setPreview(data);
        setPageError("");
      } else {
        setPageError(data?.message || error.message || "Unable to validate the Excel workbook.");
      }
    } finally {
      setPreviewing(false);
    }
  }

  async function saveAsDraft() {
    if (!preview?.committable || !preview.previewId) return;
    const existingWarning = "This will create a new Draft timetable version and make it the current version for this Academic Session. The previous timetable will remain in Approval & Versions history. Continue?";
    if (!window.confirm(existingWarning)) return;
    setCommitting(true);
    setPageError("");
    try {
      const response = await axios.post(`${API}/timetable/previews/${preview.previewId}/commit`);
      setMessage(`Manual timetable imported successfully as ${response.data?.versionLabel || "a new Draft version"}.`);
      setPreview(null);
      setFile(null);
      await onImported();
      onNavigate("Timetable", "Timetable & Scheduling");
    } catch (error) {
      setPageError(error.response?.data?.message || error.message || "Unable to save the imported timetable.");
    } finally {
      setCommitting(false);
    }
  }

  const summary = preview?.summary || {};
  const rows = preview?.rows || [];
  const errors = preview?.errors || [];
  const warnings = preview?.warnings || [];

  return <div className="manual-timetable-import">
    <section className="panel">
      <div className="import-hero">
        <div>
          <h2>Manual Timetable Excel Import</h2>
          <p>Upload an existing timetable created in Excel, validate it against Scheduly's academic masters and save it as a Draft version.</p>
        </div>
        <FileSpreadsheet size={46}/>
      </div>

      <div className="manual-import-steps">
        <div><span>1</span><strong>Download template</strong><small>Use the supported column layout</small></div>
        <div><span>2</span><strong>Upload and preview</strong><small>Resolve mappings and conflicts</small></div>
        <div><span>3</span><strong>Save as Draft</strong><small>Keep version history intact</small></div>
      </div>

      <div className="manual-import-download">
        <div>
          <strong>Start with the Scheduly template</strong>
          <p>Includes the Timetable sheet and an Instructions sheet with the required columns and formatting rules.</p>
        </div>
        <button type="button" className="secondary" onClick={downloadTemplate} disabled={downloading}>
          <Download size={16}/>{downloading ? "Preparing..." : "Download Excel Template"}
        </button>
      </div>

      <form onSubmit={createPreview} className="manual-import-form">
        <label className="manual-import-field">
          <span>Academic Session</span>
          <select value={sessionId} onChange={event => { setSessionId(event.target.value); setPreview(null); }} disabled={loadingSessions || previewing || committing}>
            <option value="">Select Academic Session</option>
            {sessions.map(session => <option key={session._id} value={session._id}>{session.name}{session.active ? " (Active)" : ""}</option>)}
          </select>
        </label>

        <label className="manual-import-file">
          <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={event => chooseFile(event.target.files?.[0] || null)} disabled={previewing || committing}/>
          <Upload size={20}/>
          <strong>{file?.name || "Choose your manual timetable Excel file"}</strong>
          <small>{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB · XLSX` : "Supported format: .xlsx · Maximum size: 10 MB"}</small>
        </label>

        <div className="manual-import-actions">
          <button type="submit" className="primary" disabled={previewing || committing || loadingSessions || !sessionId || !file}>
            {previewing ? <><RefreshCw size={16} className="spin"/> Validating workbook...</> : <><ShieldCheck size={16}/> Upload & Validate</>}
          </button>
          {preview && <button type="button" className="secondary" onClick={() => { setPreview(null); setFile(null); setPageError(""); }} disabled={committing}>Clear preview</button>}
        </div>
      </form>

      {pageError && <div className="message error" role="alert">{pageError}</div>}
      {selectedSession && <p className="manual-import-session-note">Selected session: <strong>{selectedSession.name}</strong>. The workbook is validated against this session's programs, semesters, sections, subjects, faculty, rooms, time slots and holidays.</p>}
    </section>

    {preview && <section className="panel manual-import-preview">
      <div className="panel-head">
        <div>
          <h2>Import Validation Preview</h2>
          <p>{preview.fileName || file?.name} · {preview.scope?.academicSessionName || selectedSession?.name || ""}</p>
        </div>
        <span className={preview.committable ? "manual-import-status passed" : "manual-import-status failed"}>
          {preview.committable ? <><CheckCircle2 size={15}/> Ready to save</> : <><XCircle size={15}/> Corrections required</>}
        </span>
      </div>

      <div className="manual-import-metrics">
        <div><small>Rows mapped</small><strong>{number(preview.totalRows ?? rows.length)}</strong></div>
        <div><small>Required sessions</small><strong>{number(summary.requiredSessions)}</strong></div>
        <div><small>Imported sessions</small><strong>{number(summary.scheduledSessions)}</strong></div>
        <div><small>Coverage</small><strong>{number(summary.coveragePercent)}%</strong></div>
        <div><small>Hard errors</small><strong className={errors.length ? "manual-import-danger" : ""}>{number(errors.length)}</strong></div>
      </div>

      {errors.length > 0 && <div className="manual-import-diagnostics">
        <h3><AlertCircle size={17}/> Corrections required ({errors.length})</h3>
        <ul>{errors.slice(0, 100).map((message, index) => <li key={index}>{message}</li>)}</ul>
        {errors.length > 100 && <p>Showing first 100 errors. Correct the workbook and upload it again.</p>}
      </div>}

      {warnings.length > 0 && <div className="manual-import-warnings">
        <h3><AlertCircle size={17}/> Warnings ({warnings.length})</h3>
        <ul>{warnings.slice(0, 50).map((message, index) => <li key={index}>{message}</li>)}</ul>
      </div>}

      {rows.length > 0 && <div className="manual-import-table-wrap">
        <div className="manual-import-table-heading">
          <div><h3>Resolved timetable rows</h3><p>Showing up to 100 rows from the workbook</p></div>
          <span>{number(preview.totalRows ?? rows.length)} total</span>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>Excel Row</th><th>Program</th><th>Semester</th><th>Section</th><th>Day</th><th>Time</th><th>Subject</th><th>Faculty</th><th>Room</th></tr></thead>
            <tbody>{rows.map(row => <tr key={row.rowNumber}>
              <td>{row.rowNumber}</td><td>{row.program}</td><td>{row.semester}</td><td>{row.section}</td>
              <td>{row.day}</td><td>{row.startTime}–{row.endTime}</td><td>{row.subject}</td><td>{row.faculty}</td><td>{row.room}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </div>}

      {preview.committable && <div className="manual-import-commit">
        <div>
          <strong>Workbook passed validation</strong>
          <p>The current timetable will remain unchanged until you confirm. Saving creates a new Draft version; the previous version stays in Approval & Versions.</p>
          {preview.expiresAt && <small><Clock3 size={13}/> Preview expires at {new Date(preview.expiresAt).toLocaleString()}</small>}
        </div>
        <button type="button" className="primary" onClick={saveAsDraft} disabled={committing}>
          {committing ? "Saving Draft..." : "Save Imported Timetable as Draft"}
        </button>
      </div>}
    </section>}
  </div>;
}
