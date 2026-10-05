# Phase 4 — Pre-Generation Readiness & Constraint Diagnostics

Phase 4 adds a pre-generation diagnostic layer for the active Academic Session.

## What it checks

- Academic session exists and has sections.
- Active subject mappings exist for the session.
- Every mapped subject has a valid Faculty and Section reference.
- Sections without subject mappings are reported.
- Weekly subject load is calculated.
- Faculty weekly load is compared with available working-day and daily-class capacity.
- Section weekly load is compared with configured section daily capacity.
- Classroom/Lab room availability is checked against mapped room requirements.
- Faculty availability and unavailable time slots are checked.
- Usable timetable periods are counted after excluding breaks and Sunday.

## New page

`Insights → Generation Readiness`

The page reports:

- READY
- READY_WITH_WARNINGS
- NOT_READY

Errors should be resolved before generating the timetable. Warnings can be reviewed before generation.

## API

`GET /api/timetable/readiness?sessionId=<academic-session-id>`

The endpoint returns the session, readiness status, resource summary, findings, faculty load and section load.

## Existing functionality preserved

Phase 4 does not replace the existing timetable generator or the post-generation `Validation` page. It adds a pre-generation check so configuration problems can be identified before generation starts.
