# Phase 5 — Intelligent Timetable Generation Engine

## Purpose
Phase 5 improves the timetable generation engine so it does not simply find a feasible timetable. It now evaluates multiple candidate generations and keeps the strongest candidate using coverage and quality metrics.

## Implemented
- Multi-run candidate generation using the configured generation run count.
- Global generation time limit with per-run time budgeting.
- Existing hard constraints remain enforced:
  - faculty availability
  - faculty maximum working days
  - faculty daily load
  - section daily load
  - faculty/section/room double-booking
  - consecutive-class limits
  - room type requirements
  - subject weekly requirements
  - program-aware time slots
  - holidays
- Soft-quality scoring and diagnostics:
  - timetable coverage percentage
  - unscheduled session count
  - repeated subject on the same day
  - faculty workload average and variance
  - section workload average and variance
  - first/last-period usage
- The selected timetable stores generation-quality metrics in `optimizationMetrics` and `optimizationScore`.
- `optimizationRuns` records how many candidate runs were requested.
- Existing Optimization Center remains available for post-generation corrections.

## Generation workflow

Academic Session → Subject/Faculty Mapping → Generation Readiness → Multi-run Generation → Quality Metrics → Draft Timetable → Validation → Optimization → Publish

## Quality metrics stored
- `qualityScore`
- `coveragePercent`
- `requiredSessions`
- `scheduledSessions`
- `unscheduledSessions`
- `subjectSameDayRepeats`
- `facultyLoadAverage`
- `facultyLoadVariance`
- `sectionLoadAverage`
- `sectionLoadVariance`
- `edgePeriodClasses`

## Backward compatibility
The existing Timetable schema already contains optimization metadata fields, so Phase 5 reuses those fields instead of creating a separate collection. Existing timetable viewing, versioning, approval and optimization workflows remain intact.
