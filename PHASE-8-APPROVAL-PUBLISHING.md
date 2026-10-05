# Phase 8 — Timetable Approval & Publishing Workflow

## Purpose
Phase 8 formalizes the timetable lifecycle and protects timetable changes with authenticated, role-based workflow actions.

## Lifecycle

DRAFT → SUBMITTED → APPROVED → PUBLISHED → LOCKED

Controlled return paths:
- SUBMITTED → DRAFT
- APPROVED → SUBMITTED
- PUBLISHED → DRAFT (Admin only, with remarks)
- LOCKED → PUBLISHED (Admin only, with remarks)

## Roles

### ADMIN
- Submit
- Return to Draft
- Approve
- Request Changes
- Publish
- Lock
- Unlock to Published

### SCHEDULER
- Submit
- Return submitted timetable to Draft
- Edit only while Draft
- Cannot approve, publish, or lock

### FACULTY / VIEWER
- View timetable according to their existing portal permissions
- Cannot change workflow state
- Cannot edit a submitted/approved/published/locked timetable

## Approval history
Every workflow transition records:
- From status
- To status
- User
- Username
- Role
- Timestamp
- Remarks

Workflow transitions are also written to the existing Audit Log.

## Session-aware behavior
Timetable status, current version, latest timetable and approval history are scoped to the selected/current academic session. This prevents one session's workflow state from appearing on another session.

## Server-side protection
The API enforces role permissions and workflow transitions. Frontend buttons are only a convenience; direct API requests are also protected.

The manual timetable move endpoint is authenticated and remains editable only while the timetable is DRAFT.

## Endpoints

`PATCH /api/timetable/status`

Body:
```json
{
  "status": "SUBMITTED",
  "note": "Ready for review",
  "sessionId": "..."
}
```

`GET /api/timetable/status?sessionId=...`

`GET /api/timetable/workflow?sessionId=...`

`GET /api/timetable/latest?sessionId=...`

## Important
A generated/restored/cloned timetable starts as DRAFT. Approval history is reset for a newly restored or cloned version so the new version has its own auditable lifecycle.
