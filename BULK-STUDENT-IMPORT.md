# Bulk Student Addition

## Where to use it

Open **Students** in the ERP. The **Bulk Add Students** panel is available to ADMIN and SCHEDULER users.

## Workflow

1. Click **Download Student Template**.
2. Fill the `Students` sheet.
3. Required columns:
   - Admission No
   - Roll No
   - Name
   - Section
4. Section can be identified using either:
   - Section ID, or
   - Program + Semester + Section Name
5. Upload the `.xlsx` file.
6. Click **Import Students**.
7. The result shows imported rows and row-level errors.

## Rules

- Maximum 1000 student rows per upload.
- Admission No is unique.
- Existing Admission No values are skipped and reported.
- Duplicate Admission No values inside the same file are reported.
- Invalid sections are reported.
- Invalid DOB or Admission Date values are reported.
- Valid rows are imported even when other rows contain errors.
- Existing student records are not deleted or overwritten.
- `.xlsx` is supported; legacy `.xls` is not supported by the ExcelJS parser used by this project.

## API

- `GET /api/students/bulk-template`
- `POST /api/students/bulk` with multipart field `file`

Both endpoints require ADMIN or SCHEDULER authentication.
