import React, { useState } from "react";
import axios from "axios";
import { API, API_CONFIGURATION_ERROR } from "../core/api";
import {
  ArrowRight,
  BookOpen,
  CalendarCheck2,
  CalendarDays,
  Eye,
  EyeOff,
  LockKeyhole,
  ShieldCheck,
  UserRound,
  UsersRound
} from "lucide-react";

export default function Login({ onLogin }) {
  const [form, setForm] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");

    if (!API) {
      setError(API_CONFIGURATION_ERROR);
      return;
    }

    setBusy(true);
    try {
      const response = await axios.post(`${API}/auth/login`, form);
      localStorage.setItem("tt_token", response.data.token);
      localStorage.setItem("tt_user", JSON.stringify(response.data.user));
      onLogin(response.data.user);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to sign in. Please check your details and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-shell">
        <section className="login-story" aria-label="Time Table overview">
          <div className="login-story-brand">
            <span className="login-story-logo"><CalendarDays size={24} aria-hidden="true" /></span>
            <span className="login-story-brand-copy">
              <strong>Time Table</strong>
              <small>ACADEMIC WORKSPACE</small>
            </span>
          </div>

          <div className="login-story-copy">
            <div className="login-story-kicker">
              <span className="login-kicker-dot" aria-hidden="true" />
              MADE FOR ACADEMIC TEAMS
            </div>
            <h2>Bring your academic week into focus.</h2>
            <p className="login-story-description">
              Plan with clarity, keep your academic structure organized, and bring every timetable into one workspace.
            </p>

            <div className="login-feature-list">
              <div className="login-feature">
                <span className="login-feature-icon"><CalendarCheck2 size={19} aria-hidden="true" /></span>
                <span className="login-feature-copy">
                  <strong>Timetables at a glance</strong>
                  <small>Keep scheduling work organized in one place.</small>
                </span>
              </div>
              <div className="login-feature">
                <span className="login-feature-icon"><BookOpen size={19} aria-hidden="true" /></span>
                <span className="login-feature-copy">
                  <strong>Academic structure, connected</strong>
                  <small>Bring programs, sections, subjects, and sessions together.</small>
                </span>
              </div>
              <div className="login-feature">
                <span className="login-feature-icon"><UsersRound size={19} aria-hidden="true" /></span>
                <span className="login-feature-copy">
                  <strong>Role-aware workspace</strong>
                  <small>Access features based on your assigned role.</small>
                </span>
              </div>
            </div>
          </div>

          <div className="login-story-footer">
            <ShieldCheck size={16} aria-hidden="true" />
            <span>One workspace for academic planning</span>
          </div>
          <span className="login-decor-orb login-decor-orb-one" aria-hidden="true" />
          <span className="login-decor-orb login-decor-orb-two" aria-hidden="true" />
        </section>

        <section className="login-panel" aria-labelledby="login-title">
          <div className="login-form-shell">
            <div className="login-mobile-brand">
              <span className="login-mobile-brand-icon"><CalendarDays size={22} aria-hidden="true" /></span>
              <span>Time Table</span>
            </div>

            <div className="login-heading">
              <span className="login-heading-kicker">WELCOME BACK</span>
              <h2 id="login-title">Sign in to your workspace</h2>
              <p>Enter the credentials provided by your system administrator to continue.</p>
            </div>

            <form className="login-form" onSubmit={submit} autoComplete="on">
              <div className="login-field">
                <label htmlFor="login-username">Username</label>
                <div className="login-input-wrap">
                  <UserRound size={18} aria-hidden="true" />
                  <input
                    id="login-username"
                    name="username"
                    type="text"
                    value={form.username}
                    onChange={event => setForm({ ...form, username: event.target.value })}
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck="false"
                    placeholder="Enter your username"
                    required
                  />
                </div>
              </div>

              <div className="login-field">
                <label htmlFor="login-password">Password</label>
                <div className="login-input-wrap login-password-wrap">
                  <LockKeyhole size={18} aria-hidden="true" />
                  <input
                    id="login-password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                    onChange={event => setForm({ ...form, password: event.target.value })}
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    required
                  />
                  <button
                    type="button"
                    className="login-password-toggle"
                    onClick={() => setShowPassword(value => !value)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                    title={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                  </button>
                </div>
              </div>

              {error && <div className="login-error" role="alert" aria-live="assertive">{error}</div>}

              <button className="primary login-submit" type="submit" disabled={busy} aria-busy={busy}>
                <span>{busy ? "Signing In..." : "Sign In"}</span>
                <ArrowRight size={18} aria-hidden="true" />
              </button>

              <p className="login-form-note">
                <ShieldCheck size={17} aria-hidden="true" />
                <span>Sign-in access is managed by your system administrator.</span>
              </p>
            </form>

            <div className="login-panel-footer">
              <span className="login-panel-footer-dot" aria-hidden="true" />
              Academic planning · Role-based access
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
