# TimeTable Pro — Production-Hardened College ERP

Current baseline: Phase 36

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
See `README-PRODUCTION.md` and `server/.env.example`.
