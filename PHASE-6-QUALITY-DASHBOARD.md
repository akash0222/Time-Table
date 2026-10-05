# Phase 6 — Timetable Quality & Conflict Dashboard

Adds a session-aware analytics dashboard on top of Phase 5.

## Features
- Quality score and coverage
- Unscheduled session count
- Faculty workload and variance
- Section workload and variance
- Room utilization
- Daily timetable distribution
- Subject same-day repeat metric
- Saved timetable version/status
- Faculty, section and room collision detection
- Warning list from generation metrics

## APIs
- `GET /api/analytics?sessionId=<id>`
- `GET /api/analytics/conflicts?sessionId=<id>`

The Analytics page automatically uses the active academic session. Existing Generation Readiness, Validation and Optimization modules remain separate.
