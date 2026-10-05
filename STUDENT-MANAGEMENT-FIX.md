# Student Management alignment

Student Management now uses the same 20-column structure as the Student Bulk Import template:

1. Admission No
2. Roll No
3. Name
4. Email
5. Phone
6. Gender
7. Date of Birth
8. Father Name
9. Mother Name
10. Category
11. Address
12. City
13. State
14. Pincode
15. Section ID
16. Program
17. Semester
18. Section Name
19. Active
20. Admission Date

For manual entry, Section ID is generated/read-only from the selected Program + Semester + Section Name. The backend continues to store the normalized academic relationship as the student's `section` reference, avoiding duplicated Program/Semester data.

Student Management also includes Bulk Student Import using POST /api/students/bulk and Download Student Template using GET /api/students/bulk-template.
