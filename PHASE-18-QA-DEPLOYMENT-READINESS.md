# Phase 18 — Automated QA & Deployment Readiness

## Objective
Provide a repeatable production-readiness check for the Phase 17 hardened release without adding another business module.

## Implemented

1. Added `server/qa/smoke.mjs` using Node's native `fetch` — no additional test dependency is required.
2. Added `npm run qa` to `server/package.json`.
3. Smoke coverage includes:
   - health and database state
   - readiness endpoint
   - JSON API 404 fallback
   - anonymous access rejection for protected Master Data
   - public share route availability
   - admin login and authenticated `/me`
   - authenticated Master Data read
   - Academic Structure
   - Academic Sessions
   - Scheduler Settings
   - Timetable Readiness validation
   - Analytics
   - Share Links
   - Timetable Excel export route
4. Fixed an integration defect in the server where `Student` was referenced by Academic Structure/Section deletion logic without being imported.
5. Fixed Master Data CRUD authentication so both reads and writes require an authenticated Admin/Scheduler role.
6. Restricted timetable generation to Admin/Scheduler roles.

## Run

Start MongoDB and the server first:

```powershell
cd server
npm install
npm run dev
```

In a second terminal:

```powershell
cd server
npm run qa
```

For a non-default admin password:

```powershell
$env:QA_ADMIN_PASSWORD="your-admin-password"
npm run qa
```

For another server URL:

```powershell
$env:QA_BASE_URL="http://localhost:5000"
npm run qa
```

## Expected behavior

The suite exits with code `0` only when every executed check passes. A non-zero exit code indicates that deployment should be investigated before release.

If no database/server is running, the suite will report connection/runtime failures instead of claiming success.

## Release gate

Before production deployment:

- `node --check server/server.js` passes.
- All route/model/service JavaScript files pass syntax validation.
- `npm run qa` passes against the intended environment.
- `NODE_ENV=production` is configured.
- `JWT_SECRET` is at least 32 characters and unique.
- `DEFAULT_ADMIN_PASSWORD` is non-default and at least 10 characters.
- `CORS_ORIGINS` contains only the intended frontend origin(s).
- `PUBLIC_APP_URL` points to the public frontend URL used by QR/share links.
- MongoDB backup/restore procedures have been tested outside the application.
- The frontend production build is verified in the deployment environment.
