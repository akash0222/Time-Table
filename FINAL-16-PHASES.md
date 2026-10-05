# Time Table — Final 16-Phase Product Scope

This release consolidates the timetable platform into the following 16 functional modules. The existing implementation is retained; this document is the final product/module contract.

## 1. Academic Session Architecture
- Academic sessions
- Active session
- Program-wise session dates
- Session status and descriptions

## 2. Program → Semester → Section Mapping
- Programs
- Semesters
- Sections
- Session-aware academic hierarchy
- Section capacity and daily class limits

## 3. Student Management + Student Mapping
- Student CRUD
- Bulk student import
- Student profile
- Program/semester/section mapping
- Section-based filtering

## 4. Student Promotion
- Source and target academic sessions
- Source/target sections
- Preview before apply
- Capacity validation
- Promotion/transfer history
- Admin rollback

## 5. Subject & Faculty Mapping
- Session/program/semester/section subject offerings
- Faculty assignment
- Subject type
- Classes per week
- Duration
- Room requirement
- Active/inactive mapping

## 6. Room & Time Slot Management
- Rooms
- Classroom/Lab room types
- Program-specific slots
- Break slots
- Working-day availability
- Faculty availability constraints

## 7. Holiday / Academic Calendar
- Academic-session holiday dates
- Recurring non-working days
- Sunday default holiday
- Program/session dates
- Date-aware full-session planning
- Holiday exclusion during generation

## 8. Timetable Generator
- Constraint-based generation
- Multi-run candidate generation
- Academic-session aware generation
- Weekly workload enforcement
- Faculty/section/room conflict prevention
- Quality scoring

## 9. Validation Center
- Generation readiness
- Missing mappings
- Capacity checks
- Faculty workload checks
- Section workload checks
- Room/time-slot checks
- Conflict diagnostics

## 10. Master Timetable
- Weekly timetable
- Full academic-session timetable
- All-program timetable
- Calendar view
- Current timetable version
- Read-only views

## 11. Timetable Approval & Publishing
- Draft
- Submitted
- Approved
- Published
- Locked
- Role-based workflow
- Approval history
- Publication controls

## 12. Faculty Portal
- Personal timetable
- Assigned classes
- Workload
- Availability
- Notifications
- Faculty-filtered timetable access

## 13. Student / Section Portal
- Section timetable
- Student-facing timetable
- Upcoming/current class information
- Section-filtered access
- No administration controls

## 14. Reports & Analytics
- Timetable quality score
- Coverage
- Faculty workload
- Section workload
- Room utilization
- Daily distribution
- Conflict analysis
- Generation metrics

## 15. Audit & Version Control
- Timetable versions
- Change history
- Audit logs
- Approval history
- Optimization history
- Current-version tracking
- Status transition traceability

## 16. Import Center
- Excel template download
- Programs
- Faculty
- Sections
- Rooms
- Time Slots
- Subjects
- Student data
- Availability data
- Import result summary
- Validation before database insertion

# Final End-to-End Workflow

Academic Session
→ Program / Semester / Section
→ Students
→ Student Mapping / Promotion
→ Subjects & Faculty Mapping
→ Rooms / Time Slots
→ Academic Calendar / Holidays
→ Generation Readiness
→ Timetable Generator
→ Validation Center
→ Optimization
→ Master Timetable
→ Approval
→ Publishing
→ Faculty Portal / Student Portal
→ Reports & Analytics
→ Audit / Version Control
→ Import Center

# Roles

### ADMIN
Full administration, approval, publishing, locking, rollback, audit and user management.

### SCHEDULER
Academic configuration, mapping, generation, validation, optimization and submission for approval.

### FACULTY
Personal/faculty timetable and permitted academic views.

### VIEWER / STUDENT
Read-only section/student timetable views.

# Product Rule

All timetable generation, validation, approval, publishing, reporting and portal views must be scoped to the selected Academic Session and current timetable version. Draft timetables remain editable; published/locked timetables are protected according to role and workflow rules.
