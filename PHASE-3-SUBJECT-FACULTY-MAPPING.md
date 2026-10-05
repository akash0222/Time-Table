# Phase 3 — Subject & Faculty Academic Mapping

Phase 3 adds a session-aware academic subject allocation layer on top of the Phase 2 Student Promotion project.

## What was added

- Academic Session is stored on every new subject mapping.
- Program relationship is stored with the subject mapping.
- Section remains the authoritative Program/Semester/Section target.
- Faculty is explicitly assigned to each subject.
- Subject type: Core, Elective, Practical or Lab.
- Weekly class requirement.
- Maximum weekly class value.
- Period duration (1–3 periods).
- Room requirement: Classroom, Lab or Any.
- Active/inactive mapping flag.
- Dedicated **Subject & Faculty Mapping** administration page.
- Session → Program → Semester → Section filtering.
- Faculty filtering.
- Mapping coverage summary by section.
- Sections without subject mappings are highlighted.
- Edit and remove mapping support.
- Timetable generation now scopes sections and subjects to the selected Academic Session.
- Legacy subjects without an Academic Session remain usable when their section belongs to the selected session, preserving backward compatibility.
- Demo/seed data is now created with the 2026-27 Academic Session mapping.

## Recommended workflow

1. Open **Academic Sessions** and create/activate the required session.
2. Create the Program, Semester and Sections under that session.
3. Open **Subject & Faculty Mapping**.
4. Select the Academic Session.
5. Select Program, Semester and Section.
6. Add each subject and assign its Faculty.
7. Set weekly load, duration and room requirement.
8. Review **Section Mapping Coverage**.
9. Confirm that sections requiring timetable generation have their required subjects mapped.
10. Generate the timetable.

## New API

- `GET /api/subject-mappings`
- `POST /api/subject-mappings`
- `PUT /api/subject-mappings/:id`
- `DELETE /api/subject-mappings/:id`
- `GET /api/subject-mappings/summary?sessionId=<id>`

All Phase 3 mapping endpoints require authentication and Admin/Scheduler write permissions.

## Timetable generation behavior

When a generation request includes `academicSessionId`, the server:

- loads only Sections belonging to that Academic Session;
- loads active Subjects assigned to those Sections;
- prefers Subjects explicitly assigned to that Academic Session;
- permits legacy session-less Subjects only when their Section belongs to the selected session;
- validates Faculty and Section references before scheduling.

This prevents subjects belonging to another academic session from being accidentally scheduled into the selected session.
