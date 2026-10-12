import React, {useEffect, useState} from "react";
import axios from "axios";
import {API} from "../core/api";
import {CalendarDays, CalendarOff, Clock3, Search, ShieldCheck, Trash2, FileSpreadsheet, Upload, Download, CheckCircle2, AlertTriangle} from "lucide-react";

const isoDate = value => String(value || "").slice(0, 10);

function dateLabel(value, options = {}) {
  if (!value) return "—";
  return new Date(value + "T00:00:00Z").toLocaleDateString("en-IN", {
    timeZone: "UTC",
    ...options
  });
}

function countSundays(startValue, endValue) {
  const start = isoDate(startValue);
  const end = isoDate(endValue);
  if (!start || !end) return 0;
  const day = new Date(start + "T00:00:00Z");
  const last = new Date(end + "T00:00:00Z");
  if (Number.isNaN(day.getTime()) || Number.isNaN(last.getTime()) || day > last) return 0;
  let count = 0;
  while (day <= last) {
    if (day.getUTCDay() === 0) count += 1;
    day.setUTCDate(day.getUTCDate() + 1);
  }
  return count;
}

export default function HolidayManagement({sessions = [], activeSession, role, setMessage}) {
  const canEdit = ["ADMIN", "SCHEDULER"].includes(role);
  const [sessionId, setSessionId] = useState(activeSession?._id || "");
  const [session, setSession] = useState(null);
  const [holidayDate, setHolidayDate] = useState("");
  const [holidays, setHolidays] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [uploadFile, setUploadFile] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    if (activeSession?._id && !sessionId) setSessionId(activeSession._id);
  }, [activeSession?._id]);

  async function loadSession(id = sessionId) {
    if (!id) {
      setSession(null);
      setHolidays([]);
      setError("");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    setSession(null);
    setHolidays([]);
    setSearchTerm("");
    setImportPreview(null);
    setUploadFile(null);

    try {
      const response = await axios.get(API + "/academic-sessions/" + id);
      const currentSession = response.data || null;
      setSession(currentSession);
      setHolidays((currentSession?.holidayDates || []).filter(Boolean).map(isoDate).sort());
    } catch (requestError) {
      setSession(null);
      setHolidays([]);
      setError(requestError.response?.data?.message || requestError.message || "Unable to load the selected academic session.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSession(sessionId);
  }, [sessionId]);

  async function saveDates(nextDates, nextDetails = null) {
    if (!sessionId || !canEdit || saving) return false;
    const cleanDates = [...new Set(nextDates.filter(Boolean).map(isoDate))].sort();

    setSaving(true);
    setError("");
    try {
      const detailsToSave = Array.isArray(nextDetails) ? nextDetails : (session?.holidayDetails || []);
      const response = await axios.patch(API + "/sessions/" + sessionId + "/holidays", {
        holidayDates: cleanDates,
        holidayDetails: detailsToSave.filter(item => cleanDates.includes(isoDate(item.date)))
      });
      const updatedSession = response.data || {};
      setSession(updatedSession);
      setHolidays((updatedSession.holidayDates || []).filter(Boolean).map(isoDate).sort());
      if (typeof setMessage === "function") {
        setMessage("Holiday calendar updated. " + cleanDates.length + " holiday date(s) configured. Sundays remain automatic holidays.");
      }
      return true;
    } catch (requestError) {
      setError(requestError.response?.data?.message || requestError.message || "Unable to save holiday dates. Please try again.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function addHoliday(event) {
    event?.preventDefault?.();
    if (!sessionId || !session || !holidayDate || !canEdit || saving) return;

    const chosenDate = new Date(holidayDate + "T00:00:00Z");
    if (chosenDate.getUTCDay() === 0) {
      setError("Sunday is already a default holiday. Choose another date.");
      return;
    }

    const sessionStart = isoDate(session.startDate);
    const sessionEnd = isoDate(session.endDate);
    if ((sessionStart && holidayDate < sessionStart) || (sessionEnd && holidayDate > sessionEnd)) {
      setError("Holiday date must fall inside the selected academic session (" + sessionStart + " to " + sessionEnd + ").");
      return;
    }

    if (holidays.includes(holidayDate)) {
      setError("This date is already configured as a holiday.");
      return;
    }

    const saved = await saveDates([...holidays, holidayDate]);
    if (saved) setHolidayDate("");
  }


  function downloadHolidayTemplate() {
    const template = "Date,Holiday Name,Description\r\n";
    const blob = new Blob([template], {type: "text/csv;charset=utf-8;"});
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "holiday-list-template.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function previewHolidayUpload() {
    if (!sessionId || !canEdit || !uploadFile || previewLoading || saving) return;
    setPreviewLoading(true);
    setError("");
    setImportPreview(null);
    try {
      const form = new FormData();
      form.append("file", uploadFile);
      const response = await axios.post(API + "/sessions/" + sessionId + "/holidays/preview-import", form);
      setImportPreview(response.data || null);
    } catch (requestError) {
      setError(requestError.response?.data?.message || requestError.message || "Unable to read the uploaded holiday list.");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function importPreviewedHolidays() {
    if (!importPreview || !canEdit || saving || previewLoading) return;
    const incomingRows = (importPreview.rows || [])
      .filter(item => item.status === "valid" && item.date);
    const cleanIncoming = [...new Set(incomingRows.map(item => item.date))].filter(date => !holidays.includes(date));
    if (!cleanIncoming.length) {
      setError("There are no new valid holiday dates to import. Review the preview or upload another file.");
      return;
    }
    const detailByDate = new Map((session?.holidayDetails || []).map(item => [isoDate(item.date), item]));
    for (const item of incomingRows) {
      if (!cleanIncoming.includes(item.date)) continue;
      const name = String(item.holidayName || "").trim();
      const description = String(item.description || "").trim();
      if (name || description) detailByDate.set(item.date, {date:item.date, name, description});
    }
    const targetDates = [...holidays, ...cleanIncoming];
    const detailsToSave = [...detailByDate.values()].filter(item => targetDates.includes(isoDate(item.date)));
    const saved = await saveDates(targetDates, detailsToSave);
    if (saved) {
      setImportPreview(null);
      setUploadFile(null);
      const fileInput = document.getElementById("holiday-upload-file");
      if (fileInput) fileInput.value = "";
      if (typeof setMessage === "function") {
        setMessage(cleanIncoming.length + " holiday date(s) imported into " + selectedSessionName + ". Duplicates and Sunday dates were skipped.");
      }
    }
  }

  function removeHoliday(date) {
    if (!window.confirm("Remove " + date + " from this session's holiday calendar?")) return;
    saveDates(holidays.filter(value => value !== date));
  }

  const sundayCount = countSundays(session?.startDate, session?.endDate);
  const selectedSessionName = session?.name || sessions.find(item => item._id === sessionId)?.name || "—";
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredHolidays = holidays.filter(date => {
    if (!normalizedSearch) return true;
    const friendlyDate = dateLabel(date, {weekday: "long", day: "numeric", month: "long", year: "numeric"});
    return (date + " " + friendlyDate).toLowerCase().includes(normalizedSearch);
  });

  return (
    <div className="holiday-management">
      <div className="analytics-toolbar holiday-page-header">
        <div className="holiday-page-title">
          <span className="holiday-title-icon" aria-hidden="true"><CalendarDays size={25}/></span>
          <div>
            <span className="holiday-eyebrow">ACADEMIC CALENDAR</span>
            <h2>Holiday Management</h2>
            <p>Set non-working dates for an academic session and keep timetable generation accurate.</p>
          </div>
        </div>
        <span className="holiday-sunday-badge"><CalendarOff size={16}/> Sunday is a default holiday</span>
      </div>

      <section className="panel holiday-setup-panel">
        <div className="holiday-panel-heading">
          <div>
            <h3>Holiday calendar setup</h3>
            <p>Choose a session, then add any additional non-working dates.</p>
          </div>
          {canEdit ? (
            <span className="holiday-access-note"><ShieldCheck size={15}/> Editing enabled</span>
          ) : (
            <span className="holiday-access-note readonly"><ShieldCheck size={15}/> Read-only access</span>
          )}
        </div>

        <form className="holiday-config-grid" onSubmit={addHoliday}>
          <div className="field holiday-session-field">
            <label htmlFor="holiday-session">Academic session</label>
            <select id="holiday-session" value={sessionId} onChange={event => setSessionId(event.target.value)}>
              <option value="">Select an academic session</option>
              {sessions.map(item => (
                <option key={item._id} value={item._id}>
                  {item.name}{item.active ? " (Active)" : ""}
                </option>
              ))}
            </select>
            <small className="field-help">Holiday dates are saved separately for each session.</small>
          </div>

          <div className="field holiday-date-field">
            <label htmlFor="holiday-date">Add a holiday date</label>
            <div className="holiday-date-control">
              <input
                id="holiday-date"
                type="date"
                value={holidayDate}
                min={session?.startDate ? isoDate(session.startDate) : undefined}
                max={session?.endDate ? isoDate(session.endDate) : undefined}
                onChange={event => { setHolidayDate(event.target.value); setError(""); }}
                disabled={!sessionId || !session || !canEdit || loading || saving}
                aria-describedby="holiday-date-help"
              />
              <button
                className="primary holiday-add-button"
                type="submit"
                disabled={!sessionId || !session || !holidayDate || !canEdit || loading || saving}
              >
                {saving ? "Saving…" : "Add Holiday"}
              </button>
            </div>
            <small className="field-help" id="holiday-date-help">
              {session?.startDate && session?.endDate
                ? "Select a date from " + isoDate(session.startDate) + " to " + isoDate(session.endDate) + ". Sundays are excluded automatically."
                : "Select an academic session first. Sundays are excluded automatically."}
            </small>
          </div>
        </form>

        {error && (
          <div className="message error holiday-error" role="alert">
            <span>{error}</span>
            {loading && <span className="holiday-inline-loader">Loading…</span>}
          </div>
        )}

        {!canEdit && (
          <div className="holiday-readonly-note">You can view this calendar, but only Admin and Scheduler accounts can change it.</div>
        )}

        <div className="holiday-summary-grid">
          <div className="holiday-summary-card">
            <span className="holiday-summary-icon"><CalendarOff size={18}/></span>
            <div><span>Configured Holidays</span><strong>{holidays.length}</strong><small>Additional dates in this session</small></div>
          </div>
          <div className="holiday-summary-card">
            <span className="holiday-summary-icon sunday"><CalendarDays size={18}/></span>
            <div><span>Automatic Sunday holidays</span><strong>{sundayCount}</strong><small>Calculated from the session date range</small></div>
          </div>
          <div className="holiday-summary-card">
            <span className="holiday-summary-icon session"><Clock3 size={18}/></span>
            <div><span>Selected session</span><strong className="holiday-session-name">{selectedSessionName}</strong><small>{session?.startDate && session?.endDate ? isoDate(session.startDate) + " — " + isoDate(session.endDate) : "Choose a session to see its date range"}</small></div>
          </div>
        </div>
      </section>


      {canEdit && (
        <section className="panel holiday-upload-panel">
          <div className="holiday-panel-heading holiday-upload-heading">
            <div className="holiday-upload-title">
              <span className="holiday-upload-icon"><FileSpreadsheet size={21}/></span>
              <div>
                <h3>Upload holiday list</h3>
                <p>Import multiple holiday dates from an Excel (.xlsx) or CSV file. Review the preview before saving anything.</p>
              </div>
            </div>
            <button className="secondary holiday-template-button" type="button" onClick={downloadHolidayTemplate}>
              <Download size={16}/> Download CSV template
            </button>
          </div>

          <div className="holiday-upload-workflow">
            <label className="holiday-file-picker" htmlFor="holiday-upload-file">
              <Upload size={19}/>
              <span className="holiday-file-copy">
                <strong>{uploadFile ? uploadFile.name : "Choose your holiday file"}</strong>
                <small>{uploadFile ? Math.max(1, Math.round(uploadFile.size / 1024)) + " KB · Ready to preview" : "Excel .xlsx or comma-separated .csv"}</small>
              </span>
              <input
                id="holiday-upload-file"
                type="file"
                accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={event => { setUploadFile(event.target.files?.[0] || null); setImportPreview(null); setError(""); }}
                disabled={!sessionId || !session || loading || saving || previewLoading}
              />
            </label>
            <button
              className="primary holiday-preview-button"
              type="button"
              onClick={previewHolidayUpload}
              disabled={!sessionId || !session || !uploadFile || loading || saving || previewLoading}
            >
              <Search size={16}/>{previewLoading ? "Reading file…" : "Preview Holiday List"}
            </button>
          </div>
          <div className="holiday-upload-hint">
            <strong>Expected format:</strong> a <code>Date</code> or <code>Holiday Date</code> column; optional <code>Holiday Name</code> and <code>Description</code> columns are supported. Dates can use YYYY-MM-DD or DD-MM-YYYY.
          </div>

          {importPreview && (
            <div className="holiday-import-preview">
              <div className="holiday-preview-summary">
                <div><span>Total rows</span><strong>{importPreview.summary?.total ?? importPreview.rows?.length ?? 0}</strong></div>
                <div className="valid"><span>Ready to import</span><strong>{importPreview.summary?.valid ?? 0}</strong></div>
                <div className="skipped"><span>Skipped</span><strong>{importPreview.summary?.skipped ?? 0}</strong></div>
                <div className="invalid"><span>Need correction</span><strong>{importPreview.summary?.invalid ?? 0}</strong></div>
              </div>
              <div className="holiday-preview-table-wrap">
                <table className="holiday-preview-table">
                  <thead><tr><th>Row</th><th>Date in file</th><th>Holiday name</th><th>Result</th></tr></thead>
                  <tbody>
                    {(importPreview.rows || []).map(item => (
                      <tr key={item.rowNumber + "-" + item.sourceDate}>
                        <td>{item.rowNumber}</td>
                        <td>{item.date || item.sourceDate || "—"}</td>
                        <td>{item.holidayName || "—"}</td>
                        <td>
                          <span className={"holiday-row-status " + (item.status || "invalid")}>
                            {item.status === "valid" ? <CheckCircle2 size={14}/> : <AlertTriangle size={14}/>}
                            {item.status === "valid" ? "Ready" : item.status === "skipped" ? "Skipped" : "Invalid"}
                          </span>
                          {item.reason && <small className="holiday-row-reason">{item.reason}</small>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="holiday-preview-footer">
                <span>Nothing is saved until you confirm the import.</span>
                <button
                  className="primary"
                  type="button"
                  onClick={importPreviewedHolidays}
                  disabled={saving || previewLoading || !(importPreview.summary?.valid > 0)}
                >
                  {saving ? "Importing…" : "Import " + (importPreview.summary?.valid || 0) + " Valid Dates"}
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      <section className="panel holiday-list-panel">
        <div className="holiday-panel-heading holiday-list-heading">
          <div>
            <h3>Configured Holiday Dates</h3>
            <p>These dates are applied to the selected session when the Full Session Timetable is generated.</p>
          </div>
          <span className="holiday-count-pill">{holidays.length} {holidays.length === 1 ? "date" : "dates"}</span>
        </div>

        {holidays.length > 3 && (
          <label className="holiday-search">
            <Search size={17} aria-hidden="true"/>
            <input
              type="search"
              aria-label="Search configured holidays"
              placeholder="Search by date or weekday"
              value={searchTerm}
              onChange={event => setSearchTerm(event.target.value)}
            />
          </label>
        )}

        {!sessionId ? (
          <div className="holiday-empty-state">
            <CalendarDays size={30}/>
            <strong>Select an academic session</strong>
            <span>Choose a session above to view and manage its holiday calendar.</span>
          </div>
        ) : loading ? (
          <div className="holiday-empty-state" role="status">
            <span className="holiday-spinner" aria-hidden="true"/>
            <strong>Loading holiday calendar…</strong>
            <span>Fetching the selected session and its configured dates.</span>
          </div>
        ) : holidays.length === 0 ? (
          <div className="holiday-empty-state">
            <CalendarOff size={30}/>
            <strong>No additional holidays configured</strong>
            <span>Use the form above to add a holiday. Sundays are already excluded automatically.</span>
          </div>
        ) : filteredHolidays.length === 0 ? (
          <div className="holiday-empty-state compact">
            <Search size={26}/>
            <strong>No matching holiday dates</strong>
            <span>Try a different date or weekday.</span>
          </div>
        ) : (
          <div className="holiday-date-list">
            {filteredHolidays.map(date => {
              const detail = (session?.holidayDetails || []).find(item => isoDate(item.date) === date);
              return (
                <div className="holiday-date-row" key={date}>
                  <div className="holiday-date-main">
                    <span className="holiday-date-tile" aria-hidden="true">
                      <strong>{dateLabel(date, {day: "2-digit"})}</strong>
                      <small>{dateLabel(date, {month: "short"}).toUpperCase()}</small>
                    </span>
                    <div className="holiday-date-copy">
                      <strong>{detail?.name || dateLabel(date, {weekday: "long"})}</strong>
                      <span className="holiday-iso-date">{date}</span>
                      <small>{dateLabel(date, {day: "numeric", month: "long", year: "numeric"})}</small>
                      {detail?.name && <small className="holiday-detail-weekday">{dateLabel(date, {weekday: "long"})}</small>}
                      {detail?.description && <small className="holiday-detail-description">{detail.description}</small>}
                    </div>
                  </div>
                  {canEdit && (
                    <button
                      className="secondary danger holiday-remove-button"
                      type="button"
                      onClick={() => removeHoliday(date)}
                      disabled={saving || loading}
                      aria-label={"Remove holiday " + date}
                    >
                      <Trash2 size={15}/> Remove
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="panel holiday-rule-panel">
        <div className="holiday-panel-heading">
          <div>
            <h3>Holiday Rules</h3>
            <p>How the holiday calendar affects scheduling.</p>
          </div>
        </div>
        <div className="holiday-rules">
          <div className="holiday-rule-card">
            <span className="holiday-rule-icon"><CalendarOff size={19}/></span>
            <div><strong>Sunday</strong><span>Always treated as a holiday. Classes cannot be scheduled on Sunday, even when Sunday time slots exist.</span></div>
          </div>
          <div className="holiday-rule-card">
            <span className="holiday-rule-icon"><CalendarDays size={19}/></span>
            <div><strong>Configured dates</strong><span>Dates listed above are excluded from date-wise Full Session Timetable generation for this academic session.</span></div>
          </div>
          <div className="holiday-rule-card">
            <span className="holiday-rule-icon"><Clock3 size={19}/></span>
            <div><strong>Weekly timetable</strong><span>A weekly timetable uses weekdays. Date-specific holidays are applied when generating the date-wise Full Session Timetable.</span></div>
          </div>
        </div>
      </section>
    </div>
  );
}
