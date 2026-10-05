# Phase 7 — Advanced Constraint Optimization

Phase 7 extends the Phase 6 Quality Dashboard with an actionable optimization workflow.

## Features

- Manual optimization suggestions remain available.
- New **Fix Issues Automatically** action.
- Automatic optimization is limited to the current `DRAFT` timetable.
- Only `ADMIN` and `SCHEDULER` users can apply optimization changes.
- Up to 10 changes are applied per automatic run from the highest-scoring safe candidate available at each iteration.
- Each change is re-evaluated against current timetable constraints before the next change.
- Existing faculty, section, room, availability and room-type checks are reused.
- Remaining issues are returned for manual review.
- Automatic optimization is recorded in the audit log.
- Published/approved/locked timetables are protected from optimization changes.

## Workflow

```text
Generate Timetable
       ↓
Validation / Quality Dashboard
       ↓
Optimization Center
       ↓
Review Suggestions
       ├── Apply individual suggestion
       └── Fix Issues Automatically
                    ↓
             Re-check constraints
                    ↓
              Remaining issues
                    ↓
              Manual review
```

## New API

```text
POST /api/timetable/optimization/auto-fix
Body: { "maxChanges": 10 }
```

The endpoint returns the changes applied, remaining issue count and the updated optimization report.

## Safety

Automatic changes are never applied to a non-DRAFT timetable. The operation is role-restricted to ADMIN and SCHEDULER users and is recorded in `AuditLog`.
