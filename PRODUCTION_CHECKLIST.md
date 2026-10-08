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

1. Rotate the MongoDB user password.
2. Generate a new JWT secret.
3. Change the initial admin password.
4. Update Render environment variables.
5. Remove/rotate exposed credentials from Git history before public redistribution.

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

