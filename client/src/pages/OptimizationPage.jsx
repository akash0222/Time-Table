import React, { useEffect, useState } from "react";
import axios from "axios";
import { API } from "../core/api";
import { Metric } from "../components/SharedComponents.jsx";
import { RotateCcw } from "lucide-react";

export default function Optimization({ activeSession }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const sessionId = String(activeSession?._id || "");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const params = sessionId ? { sessionId } : {};
      setReport((await axios.get(`${API}/timetable/optimization`, { params })).data);
    } catch (e) {
      setError(e.response?.data?.message || e.message || "Unable to analyze this timetable.");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [sessionId]);

  async function apply(suggestion, candidate) {
    const key = `${suggestion.entryId || "new"}|${candidate.day}|${candidate.startTime}|${candidate.roomId || ""}`;
    setBusy(key);
    setError("");
    try {
      await axios.post(`${API}/timetable/optimization/apply`, {
        entryId: suggestion.entryId,
        day: candidate.day,
        startTime: candidate.startTime,
        roomId: candidate.roomId,
        academicSessionId: sessionId || undefined
      });
      await load();
    } catch (e) {
      setError(e.response?.data?.message || e.message || "Unable to apply this optimization.");
    } finally {
      setBusy("");
    }
  }

  async function autoFix() {
    if (report?.status !== "DRAFT") {
      setError("Automatic fixes are available only while the timetable is DRAFT.");
      return;
    }
    if (!window.confirm("Apply the highest-scoring safe optimization suggestions automatically? The selected session's draft timetable will be changed.")) return;
    setBusy("AUTO_FIX");
    setError("");
    try {
      const response = await axios.post(`${API}/timetable/optimization/auto-fix`, {
        maxChanges: 10,
        academicSessionId: sessionId || undefined
      });
      await load();
      if (response.data?.remaining) {
        setError(`${response.data.applied?.length || 0} change(s) applied. ${response.data.remaining} issue(s) remain for manual review.`);
      }
    } catch (e) {
      setError(e.response?.data?.message || e.message || "Unable to optimize this timetable.");
    } finally {
      setBusy("");
    }
  }

  if (loading) return <div className="panel"><h2>Optimization Center</h2><p>Analyzing conflicts, availability and unscheduled classes...</p></div>;

  return <div>
    <div className="analytics-toolbar">
      <div>
        <h2>Optimization Center</h2>
        <small>{report?.scope?.academicSessionName || activeSession?.name || "Active academic session"}</small>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="secondary" onClick={load} disabled={Boolean(busy)}><RotateCcw size={15}/> Re-analyze</button>
        <button className="primary" onClick={autoFix} disabled={Boolean(busy) || report?.status !== "DRAFT" || !(report?.summary?.suggestions)}>
          {busy === "AUTO_FIX" ? "Applying Fixes..." : "Fix Issues Automatically"}
        </button>
      </div>
    </div>

    <div className="optimization-note">
      Suggestions are generated without changing the timetable. Applying a suggestion is allowed only while the selected session's timetable is <b>DRAFT</b>.
    </div>
    {error && <div className="message error" role="alert">{error}</div>}
    <div className="optimization-summary">
      <Metric label="Issues" value={report?.summary?.issues || 0}/>
      <Metric label="Suggestions" value={report?.summary?.suggestions || 0}/>
      <Metric label="Status" value={report?.status || "NO TIMETABLE"}/>
    </div>
    <section className="panel">
      <div className="panel-head"><div><h3>Suggested Resolutions</h3></div></div>
      {!report?.hasTimetable
        ? <div className="optimization-empty"><h3>No current timetable for this session</h3><p>Generate and save a timetable draft for this academic session before analyzing optimization suggestions.</p></div>
        : !report?.suggestions?.length
          ? <div className="optimization-empty"><h3>✓ No optimization candidates needed</h3><p>The current timetable has no detected issue for which this optimizer can provide an alternative.</p></div>
          : <div className="optimization-list">
              {report.suggestions.map((suggestion, index) =>
                <div className="optimization-card" key={`${suggestion.type}-${suggestion.entryId || index}`}>
                  <div className="optimization-card-head">
                    <div>
                      <span className="optimization-badge">{suggestion.type.replaceAll("_", " ")}</span>
                      <h3 style={{ marginTop: 8 }}>{suggestion.subject}</h3>
                      <div className="optimization-reason">{suggestion.reason}</div>
                      <small>{suggestion.faculty} · {suggestion.section}</small>
                    </div>
                    <span className="notification-pill IMPORTANT">{suggestion.candidates.length} option{suggestion.candidates.length === 1 ? "" : "s"}</span>
                  </div>
                  {suggestion.candidates.length
                    ? <div className="suggestion-grid">
                        {suggestion.candidates.map(candidate => {
                          const key = `${suggestion.entryId || "new"}|${candidate.day}|${candidate.startTime}|${candidate.roomId || ""}`;
                          return <div className="suggestion" key={key}>
                            <strong>{candidate.day}</strong>
                            <small>{candidate.startTime} – {candidate.endTime}<br/>{candidate.room || "Room"}<br/>Score: {candidate.score}</small>
                            <button className="primary full" disabled={!suggestion.entryId || Boolean(busy) || report.status !== "DRAFT"} onClick={() => apply(suggestion, candidate)}>
                              {busy === key ? "Applying..." : "Apply"}
                            </button>
                          </div>;
                        })}
                      </div>
                    : <small className="optimization-reason">No safe alternative is currently available. Review the constraints or master-data mappings before trying again.</small>
                  }
                </div>
              )}
            </div>
      }
    </section>
  </div>;
}
