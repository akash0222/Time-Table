# Timetable Generator — Feature Updates

## Added: All Program Timetables
- Added a dedicated `All Program Timetables` module.
- Added navigation route `/all-program-timetables`.
- The screen lists every configured active program, including programs with no generated classes.
- Program, semester, section, day and text-search filters are supported.
- Each program timetable uses its mapped periods.
- CSV export and print are retained.
- Program-specific empty states explain how to configure Time Slots.

## Added: Program-specific Time Slots
- `TimeSlot` now has an optional `program` reference.
- A Time Slot can be:
  - Global — available to all programs.
  - Program-specific — available only to the selected program.
- The generator uses program-specific slots when they exist.
- If a program has no program-specific slots, global slots are used as fallback.
- The Master Data > Time Slots form now includes Program mapping.
- Time Slot cards show the mapped program.
- Excel import accepts a `Program` column in the `TimeSlots` sheet.

## Generator Mapping
- Sections continue to use their existing Program value (name/code/id compatible).
- The generator resolves the section's Program against the Program master data.
- Subject sessions are therefore constrained to the correct Program Time Slots.

## Navigation Resize Fix
- Sidebar now has stable flex sizing.
- Main workspace can shrink correctly without forcing horizontal overflow.
- Collapsed sidebar width is stable.
- Mobile navigation remains fixed and full-width.
- Navigation labels use ellipsis instead of expanding the sidebar.

## Important
Existing Time Slots remain global (`program: null`) unless they are edited/imported with a Program mapping. No destructive migration is required.
