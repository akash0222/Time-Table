# Academic Foundation Update

This version establishes the core academic relationship used by the application:

Academic Session -> Program -> Semester -> Section -> Students

## Added
- Academic Structure module in navigation.
- Program/semester/section mapping UI.
- Academic-session-aware sections through `Section.academicSession`.
- Section `programId` is the authoritative Program relationship.
- Student Management form aligned to the 20-column Excel import structure.
- Student academic selection follows Program -> Semester -> Section.
- Section ID is displayed as a read-only derived value.
- Admission Date added to manual student entry.
- Bulk Student Import exposed directly in Student Management.
- Student Mapping module for bulk movement between sections.
- Bulk mapping accepts both `section` and legacy `toSection` payloads.
- Student records keep Program/Semester display fields synchronized with their Section.
- Demo data now creates an active 2026-27 Academic Session and assigns demo sections to it.
- Data loading is resilient to one failed API endpoint.

## Important rule
Students are mapped to a Section. Program and Semester are derived from that Section. This prevents conflicting academic mappings.

## API additions
- `GET /api/academic-structure?sessionId=<id>`
- `POST /api/academic-structure/sections`
- `PUT /api/academic-structure/sections/:id`
- `DELETE /api/academic-structure/sections/:id`

## Test order
1. Academic Sessions
2. Academic Structure
3. Master Data / Programs
4. Create Program + Semester + Section mapping
5. Students
6. Student Mapping
7. Subjects
8. Time Slots
9. Holiday Management
10. Generate Timetable
11. Full Session Timetable
12. All Program Timetables
