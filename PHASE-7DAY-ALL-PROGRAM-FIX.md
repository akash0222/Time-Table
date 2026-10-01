# Time Table — 7-Day Timetable + All Program Timetables

## Fixes included

1. Timetable grid is now exactly 8 columns:
   - Time
   - Monday
   - Tuesday
   - Wednesday
   - Thursday
   - Friday
   - Saturday
   - Sunday
2. Time rows are no longer broken because of a 5-day CSS grid.
3. Horizontal scrolling is enabled on smaller screens instead of dropping Saturday/Sunday into the wrong row.
4. Added **All Program Timetables** module.
5. New route: `/all-program-timetables`.
6. All Program Timetables shows every program in one page with program filter and day filter.
7. Existing timetable entries, faculty, section, room and subject information are preserved.
8. Changed product branding from **TimeTable Pro** to **Time Table** in the client and report branding.
9. Generator mapping warning now returns to Master Data Settings instead of a non-existent Subjects route.

## Install

### Server

```powershell
cd "E:\project\timetable generator\server"
npm install
npm run dev
```

### Client — new terminal

```powershell
cd "E:\project\timetable generator\client"
npm install
npm run build
npm run dev
```

Open:

- Dashboard: `http://localhost:5173/dashboard`
- Timetable: `http://localhost:5173/timetable`
- All Program Timetables: `http://localhost:5173/all-program-timetables`
- Calendar: `http://localhost:5173/calendar`

## Important

Do not delete TimeSlot records. The 7-day grid uses the existing day-specific TimeSlot records and renders unique time periods as rows.
