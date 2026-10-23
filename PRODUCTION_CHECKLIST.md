# Time Table — Production Checklist

## Local development

### Server

```powershell
cd server
npm install
copy .env.example .env
npm run dev
```

Set these values in `server/.env`:

- `MONGO_URI`
- `JWT_SECRET` (at least 32 random characters in production)
- `DEFAULT_ADMIN_PASSWORD` (at least 10 characters)
- `CORS_ORIGINS`
- `PUBLIC_APP_URL`

### Client

```powershell
cd client
npm install
npm run dev
```

For production builds, set:

```
VITE_API_URL=https://<your-render-api>/api
```

## QA smoke test

Start the server, then:

```powershell
cd server
$env:QA_BASE_URL="http://localhost:5000"
$env:QA_ADMIN_USERNAME="admin"
$env:QA_ADMIN_PASSWORD="<your-admin-password>"
npm run test:qa
```

The smoke test verifies health, anonymous access rejection, login, authenticated master-data reads, academic sessions, scheduler settings, and timetable readiness.

## Production security

Rotate every credential that was previously committed to the repository. Updating the current `.env.example` does not remove secrets from historical Git commits.

Recommended sequence:

1. Rotate the MongoDB user password in Atlas; update Render's `MONGO_URI` immediately after.
2. Use a dedicated least-privilege MongoDB database user for the production database; keep QA on a separate database and separate database user.
3. Generate a new unique production `JWT_SECRET` (at least 32 random characters); do not reuse the disposable CI/QA secret.
4. Change the live admin password and remove `DEFAULT_ADMIN_PASSWORD` from the runtime environment after initial admin creation, if the app no longer needs it.
5. Rotate any other credential ever shared in chat or committed. A current example file does not erase historical Git commits; use GitHub secret scanning/history review before public redistribution.

Never use the production admin password for production QA. Create a dedicated account with the `VIEWER` role and configure GitHub repository variable `QA_USERNAME` plus Actions secret `QA_PASSWORD`. Enable authenticated production checks with `RUN_PRODUCTION_AUTHENTICATED_QA=true` only after these are set. The smoke test verifies the QA role is `VIEWER` and that it cannot create time slots. The disposable CI workflow continues to use a separate temporary administrator in an isolated database.

## Timetable generation behavior

Generation now follows:

```
Session
  -> session-scoped sections
  -> session-scoped subject mappings
  -> faculty / rooms / slots
  -> generator
  -> hard-constraint validator
  -> save only when complete and valid
```

An incomplete timetable is rejected instead of being saved as a usable draft.

Manual timetable moves run through the same hard-constraint validator before persistence.

## Academic sessions

When importing Excel data, provide `academicSessionId` or `sessionId` in the multipart request. Sections and Subjects imported with that value are linked to the selected academic session.

Scheduler settings can be saved globally or with `academicSessionId` for session-specific overrides.

## Important compatibility note

Sunday is always treated as a holiday by the scheduler. Additional recurring holiday weekdays and specific academic-session holiday dates are also supported.

## Deployment

### Render

Build/start from the `server` directory:

```
npm install
npm start
```

Required environment variables:

```
NODE_ENV=production
MONGO_URI=...
JWT_SECRET=...
DEFAULT_ADMIN_PASSWORD=...
CORS_ORIGINS=https://<your-vercel-domain>
PUBLIC_APP_URL=https://<your-vercel-domain>
TRUST_PROXY=true
```

### Vercel

Build from the `client` directory and set:

```
VITE_API_URL=https://<your-render-domain>/api
```

After deployment, run the QA smoke test against the Render API and manually verify:

- login
- academic session selection
- holiday management
- validation center
- timetable generation
- manual move
- submit / approve / publish
- version restore
- faculty portal
- section portal
- public share link
- Excel/PDF export



## Time-slot integrity

- The bulk endpoint commits the whole batch in one MongoDB transaction; if validation or any write fails, the transaction aborts without partial rows.
- Atomic bulk saves require MongoDB Atlas, a replica set, or a sharded cluster. A standalone local `mongod` returns HTTP 503 for this endpoint; configure local replica-set support before using multi-day or multi-program saves.
- The endpoint accepts at most 500 slots per request and checks invalid weekdays/times, repeated period orders, overlapping clock times, configured session/program/semester references, and conflicts with already-saved slots.
- A shared transaction guard serializes bulk validation against concurrent bulk saves. Slot writes also use a renewable database lease lock.

- Time-slot writes are serialized by a MongoDB lease lock across app instances.
- Bulk time-slot creation validates the whole batch and existing rows before any insert.
- A failed batch attempts to remove any rows created by that batch before returning an error.
- Use the bulk endpoint for multi-program or multi-day creation; do not loop individual POST requests from the browser.
