# Phase 2 — Student Promotion & Academic Movement

## Implemented

- Separate source and target Academic Sessions.
- Source Section is filtered by the source session.
- Target Section is filtered by the target session.
- Promotion/Transfer preview before applying changes.
- Target section capacity validation.
- Target section session validation.
- Source session validation.
- Student academic mapping updates automatically from the target Section.
- Movement history stores target and source academic session.
- Movement status: COMPLETED / ROLLED_BACK.
- Admin-only safe rollback.
- Rollback is blocked if the student's current section has changed since the movement.
- Promotion history can be filtered by session, student, and status.
- Section capacity is configurable from Academic Structure. `0` means unlimited.

## Workflow

Source Session → Source Section → Students → Target Session → Target Section → Preview → Apply

## Promotion vs Transfer

- PROMOTED: intended for movement into the next academic structure/session.
- TRANSFERRED: intended for section/program movement where promotion semantics are not appropriate.

## Safety

The backend is authoritative. Frontend validation is only for user experience; the server repeats all critical validation before modifying students.
