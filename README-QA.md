# TimeTable Pro — QA Quick Start

## Automated smoke test

The Phase 18 smoke test is intentionally dependency-light and uses Node's built-in `fetch`.

```powershell
cd server
npm install
npm run dev
```

Then in a second terminal:

```powershell
cd server
npm run qa
```

The test uses `QA_ADMIN_PASSWORD`, then `DEFAULT_ADMIN_PASSWORD`, and finally the local development fallback `admin123` when no value is supplied.

For production-like validation, always provide the actual administrator password explicitly:

```powershell
$env:QA_ADMIN_PASSWORD="<configured-admin-password>"
npm run qa
```

## What it checks

- API health/readiness
- protected route enforcement
- admin authentication
- authenticated Master Data access
- Academic Structure and Sessions
- Scheduler Settings
- Timetable Readiness validation
- Analytics and Share Links
- export route availability
- API 404 behavior

A failed check returns a non-zero process exit code so it can be used as a deployment gate or CI step.
