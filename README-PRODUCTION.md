# TimeTable Pro — Production Readiness

## Required environment variables

- `NODE_ENV=production`
- `MONGO_URI` — production MongoDB connection string
- `JWT_SECRET` — random secret with at least 32 characters
- `DEFAULT_ADMIN_PASSWORD` — non-default password with at least 10 characters
- `CLIENT_URL` — primary frontend origin
- `CORS_ORIGINS` — comma-separated allowlist of frontend origins
- `PUBLIC_APP_URL` — public URL used for QR/share links

## Security baseline

The server now:

- requires authentication for master-data CRUD, settings, imports, seed/demo loading, and timetable exports
- restricts master-data writes to ADMIN/SCHEDULER
- restricts production default-admin creation to an explicitly configured password
- applies request-size limits
- validates CORS origins
- sends baseline security headers
- exposes `/api/health` for liveness and `/api/readiness` for database readiness
- returns generic 500 errors in production
- supports graceful SIGINT/SIGTERM shutdown
- keeps public timetable sharing limited to explicitly created active share links

## Windows production checklist

1. Create `server/.env` from `server/.env.example`.
2. Set a strong `JWT_SECRET`.
3. Set a strong `DEFAULT_ADMIN_PASSWORD`.
4. Set the exact frontend origin in `CORS_ORIGINS`.
5. Set `PUBLIC_APP_URL` to the URL users will actually open.
6. Run `npm ci` in `server` and `client`.
7. Run `npm run build` in `client`.
8. Start the API with `npm start`.
9. Serve the generated `client/dist` from your web server or hosting provider.
10. Verify `/api/health` and `/api/readiness` before opening the application.

## Smoke test

Set `TEST_ADMIN_PASSWORD` to the configured admin password and run:

```powershell
node test.mjs
```

Expected results:

```text
health 200
protected /api/faculty 401
login 200
```

After login, manually verify the 16-module workflow documented in `FINAL-16-PHASES.md`.
