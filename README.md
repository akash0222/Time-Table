# TimeTable Pro — Production-Hardened College ERP

Current baseline: Phase 18 — Automated QA & Deployment Readiness

## Modules
- Academic sessions with program-wise dates
- Full-session timetable generation
- Timetable versions, approval and publishing
- Public timetable sharing and QR access
- Faculty availability
- Student management
- Attendance
- Fees and payments
- Student promotion / section transfer
- Student profiles and academic history
- Master Data Settings
- Notifications, audit logs, analytics and reports

## Production hardening
- Configurable API URL and CORS allowlist
- JWT secret validation in production
- Login throttling
- Password policy and stronger bcrypt hashing
- Secure response headers
- Request size limits
- Health/readiness endpoints
- Graceful shutdown
- Generic production error responses
- Admin-only user directory

## Local development
### API
```powershell
cd server
npm install
npm run dev
```

### Frontend
```powershell
cd client
npm install
npm run dev
```

## Production
See `README-PRODUCTION.md` and `server/.env.example`. The production baseline also requires a non-default `DEFAULT_ADMIN_PASSWORD`, a strong `JWT_SECRET`, and an explicit CORS allowlist.

## Phase 18 — Automated QA

Run the API against a running MongoDB-backed server, then execute:

```powershell
cd server
npm run qa
```

The smoke suite validates authentication, protected Master Data, Academic Structure, Sessions, settings, timetable readiness, analytics, share links, exports, health/readiness, and API 404 behavior. See `PHASE-18-QA-DEPLOYMENT-READINESS.md`.

## Phase 3

See `PHASE-3-SUBJECT-FACULTY-MAPPING.md` for the session-aware Subject & Faculty Academic Mapping workflow.
