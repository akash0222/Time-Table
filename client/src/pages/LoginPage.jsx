import React, { useState } from "react";
import axios from "axios";
import { API, API_CONFIGURATION_ERROR } from "../core/api";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CalendarCheck2,
  CalendarDays,
  Eye,
  EyeOff,
  LoaderCircle,
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
  const [capsLockOn, setCapsLockOn] = useState(false);

  function updateCapsLock(event) {
    setCapsLockOn(Boolean(event.getModifierState?.("CapsLock")));
  }

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
      const status = requestError.response?.status;
      if (!requestError.response) {
        setError("Unable to reach the sign-in service. Check your connection and try again.");
      } else if (status === 401) {
        setError("Invalid username or password.");
      } else if (status === 429) {
        setError("Too many sign-in attempts. Please wait a few minutes before trying again.");
      } else if (status >= 500) {
        setError("Sign-in is temporarily unavailable. Please try again shortly.");
      } else {
        setError(requestError.response?.data?.message || "Unable to sign in. Please check your details and try again.");
      }
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
          <svg className="login-academic-art" viewBox="0 0 360 650" fill="none" aria-hidden="true" focusable="false">
            <defs>
              <linearGradient id="loginArtBlue" x1="32" y1="54" x2="318" y2="555" gradientUnits="userSpaceOnUse">
                <stop stopColor="#60A5FA" />
                <stop offset="1" stopColor="#2563EB" />
              </linearGradient>
            </defs>
            <path d="M32 92C110 30 191 50 241 112S321 228 292 307 188 408 169 477 203 572 300 586"
              stroke="url(#loginArtBlue)" strokeWidth="2" strokeDasharray="5 9" strokeLinecap="round" opacity=".46"/>
            <circle cx="32" cy="92" r="6" fill="#93C5FD" opacity=".72"/>
            <circle cx="292" cy="307" r="6" fill="#93C5FD" opacity=".72"/>
            <circle cx="300" cy="586" r="6" fill="#93C5FD" opacity=".72"/>
            <circle cx="76" cy="28" r="4" fill="#DBEAFE"/>
            <circle cx="325" cy="44" r="8" stroke="#BFDBFE" strokeWidth="2" opacity=".8"/>
            <g transform="translate(72 63) rotate(10 106 78)">
              <rect x="0" y="0" width="216" height="158" rx="17" fill="#EFF6FF" fillOpacity=".62" stroke="#93C5FD" strokeWidth="2"/>
              <path d="M0 42H216" stroke="#93C5FD" strokeWidth="2"/>
              <path d="M43 0V-13M174 0V-13" stroke="#60A5FA" strokeWidth="7" strokeLinecap="round"/>
              <rect x="20" y="59" width="38" height="24" rx="5" fill="#DBEAFE"/>
              <rect x="70" y="59" width="38" height="24" rx="5" fill="#DBEAFE"/>
              <rect x="120" y="59" width="38" height="24" rx="5" fill="#DBEAFE"/>
              <rect x="170" y="59" width="26" height="24" rx="5" fill="#BFDBFE"/>
              <rect x="20" y="94" width="38" height="24" rx="5" fill="#DBEAFE"/>
              <rect x="70" y="94" width="38" height="24" rx="5" fill="#BFDBFE"/>
              <rect x="120" y="94" width="38" height="24" rx="5" fill="#DBEAFE"/>
              <rect x="170" y="94" width="26" height="24" rx="5" fill="#DBEAFE"/>
              <rect x="20" y="129" width="38" height="14" rx="5" fill="#DBEAFE"/>
              <rect x="70" y="129" width="38" height="14" rx="5" fill="#DBEAFE"/>
              <rect x="120" y="129" width="38" height="14" rx="5" fill="#DBEAFE"/>
            </g>
            <g transform="translate(222 220)">
              <circle cx="44" cy="44" r="43" fill="#F8FBFF" fillOpacity=".92" stroke="#60A5FA" strokeWidth="3"/>
              <circle cx="44" cy="44" r="31" stroke="#BFDBFE" strokeWidth="2"/>
              <path d="M44 22V45L59 55" stroke="#3B82F6" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="44" cy="44" r="4" fill="#3B82F6"/>
              <path d="M44 8V14M44 74V80M8 44H14M74 44H80" stroke="#60A5FA" strokeWidth="3" strokeLinecap="round"/>
            </g>
            <g transform="translate(104 472) rotate(-5 94 62)">
              <path d="M12 78C42 65 76 65 102 78V111C75 98 42 98 12 111V78Z" fill="#DBEAFE" stroke="#93C5FD" strokeWidth="2"/>
              <path d="M102 78C130 65 163 65 190 78V111C163 98 130 98 102 111V78Z" fill="#EFF6FF" stroke="#93C5FD" strokeWidth="2"/>
              <path d="M102 78V111" stroke="#60A5FA" strokeWidth="2"/>
              <path d="M12 61C42 48 76 48 102 61V78C75 65 42 65 12 78V61Z" fill="#BFDBFE" stroke="#93C5FD" strokeWidth="2"/>
              <path d="M102 61C130 48 163 48 190 61V78C163 65 130 65 102 78V61Z" fill="#DBEAFE" stroke="#93C5FD" strokeWidth="2"/>
              <path d="M12 43C42 30 76 30 102 43V61C75 48 42 48 12 61V43Z" fill="#EFF6FF" stroke="#93C5FD" strokeWidth="2"/>
              <path d="M102 43C130 30 163 30 190 43V61C163 48 130 48 102 61V43Z" fill="#F8FBFF" stroke="#93C5FD" strokeWidth="2"/>
              <path d="M160 9C166 -2 184 -4 192 5C186 19 173 23 160 9Z" fill="#BFDBFE" fillOpacity=".78"/>
              <path d="M160 9C166 19 171 28 173 37" stroke="#93C5FD" strokeWidth="2" strokeLinecap="round"/>
              <path d="M176 24C188 16 202 20 205 31C194 40 183 37 176 24Z" fill="#DBEAFE"/>
            </g>
            <circle cx="52" cy="398" r="9" stroke="#BFDBFE" strokeWidth="2"/>
            <circle cx="70" cy="419" r="3" fill="#93C5FD"/>
            <circle cx="301" cy="431" r="5" fill="#BFDBFE"/>
            <g className="login-art-study-card" transform="translate(248 348) rotate(6 44 36)">
              <rect x="0" y="0" width="86" height="72" rx="11" fill="#F8FBFF" fillOpacity=".94" stroke="#60A5FA" strokeWidth="2"/>
              <path d="M0 19H86" stroke="#93C5FD" strokeWidth="2"/>
              <circle cx="12" cy="10" r="2.4" fill="#60A5FA"/>
              <circle cx="21" cy="10" r="2.4" fill="#93C5FD"/>
              <rect x="11" y="29" width="26" height="11" rx="3" fill="#BFDBFE"/>
              <rect x="43" y="29" width="31" height="11" rx="3" fill="#DBEAFE"/>
              <rect x="11" y="47" width="19" height="11" rx="3" fill="#DBEAFE"/>
              <rect x="36" y="47" width="19" height="11" rx="3" fill="#BFDBFE"/>
              <rect x="61" y="47" width="13" height="11" rx="3" fill="#DBEAFE"/>
            </g>
            <g transform="translate(284 150)">
              <path d="M0 11L3.6 3.6L11 0L3.6 -3.6L0 -11L-3.6 -3.6L-11 0L-3.6 3.6Z" fill="#93C5FD" fillOpacity=".82"/>
            </g>
            <g transform="translate(34 286)">
              <circle cx="0" cy="0" r="10" stroke="#93C5FD" strokeWidth="2"/>
              <path d="M-4 0L-1 3L5 -4" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </g>
          </svg>
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
                    disabled={busy}
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
                    onKeyDown={updateCapsLock}
                    onKeyUp={updateCapsLock}
                    onBlur={() => setCapsLockOn(false)}
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    required
                    disabled={busy}
                  />
                  <button
                    type="button"
                    className="login-password-toggle"
                    onClick={() => setShowPassword(value => !value)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                    title={showPassword ? "Hide password" : "Show password"}
                    disabled={busy}
                  >
                    {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                  </button>
                </div>
                {capsLockOn && (
                  <p className="login-caps-lock-warning" role="status">
                    <AlertTriangle size={15} aria-hidden="true" />
                    Caps Lock is on
                  </p>
                )}
              </div>

              {error && <div className="login-error" role="alert" aria-live="assertive">{error}</div>}

              <button className="primary login-submit" type="submit" disabled={busy} aria-busy={busy}>
                <span>{busy ? "Signing in…" : "Sign In"}</span>
                {busy
                  ? <LoaderCircle className="login-submit-spinner" size={18} aria-hidden="true" />
                  : <ArrowRight size={18} aria-hidden="true" />}
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
