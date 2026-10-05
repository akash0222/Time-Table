# Phase 17 — Production Hardening & End-to-End Integration

This phase is the final engineering hardening layer on top of the 16 functional modules.

## Included

1. Auth protection for master-data CRUD.
2. Role protection for master-data writes.
3. Auth protection for settings.
4. Auth and role protection for Excel import and demo-data loading.
5. Auth protection for timetable exports.
6. CORS allowlist support.
7. JSON request-size limit.
8. Baseline security response headers.
9. Database readiness endpoint.
10. Graceful SIGINT/SIGTERM shutdown.
11. Production-safe generic error responses.
12. Default administrator password is environment-driven; production rejects the default password.
13. Public share filtering correctly compares populated section/faculty IDs.
14. Public QR generation uses `PUBLIC_APP_URL` when configured.
15. Login UI no longer displays a hard-coded production password.

## End-to-end release order

Academic Session → Program/Semester/Section → Students → Promotion → Subject/Faculty → Rooms/Time Slots → Calendar → Import → Readiness → Generate → Validate → Optimize → Master Timetable → Approval → Publish → Faculty/Section Portals → Reports → Audit/Versions → Public Share.

## Verification

- All server `.js` files pass `node --check`.
- Client production build must be run on the target Windows environment with `npm ci` followed by `npm run build`.
- `test.mjs` verifies liveness, authentication protection and login.
