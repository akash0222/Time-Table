import express from "express";
import Student from "../models/Student.js";
import Section from "../models/Section.js";
import Timetable from "../models/Timetable.js";
import AcademicSession from "../models/AcademicSession.js";
import { canAccessStudentSectionList } from "../services/attendanceAccess.js";
import ExcelJS from "exceljs";
import { assertSafeXlsxBuffer } from "../services/xlsxSafety.js";
import multer from "multer";

const router = express.Router();

function allowRoles(...roles) {
  return (req, res, next) => roles.includes(req.user?.role) ? next() : res.status(403).json({ message: "You are not authorized for this action." });
}


const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});

function normalizeHeader(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function cellText(value) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object" && value.text) return String(value.text);
  return String(value).trim();
}

function parseBoolean(value, fallback = true) {
  const v = String(value ?? "").trim().toLowerCase();
  if (!v) return fallback;
  if (["true", "1", "yes", "y", "active"].includes(v)) return true;
  if (["false", "0", "no", "n", "inactive"].includes(v)) return false;
  return fallback;
}

function parseDate(value) {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(excelEpoch.getTime() + Math.round(value * 86400000));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (/^\d{4,6}(?:\.\d+)?$/.test(String(value).trim())) {
    const n = Number(value);
    if (n > 20000 && n < 80000) {
      const excelEpoch = new Date(Date.UTC(1899, 11, 30));
      const excelDate = new Date(excelEpoch.getTime() + Math.round(n * 86400000));
      if (!Number.isNaN(excelDate.getTime())) return excelDate;
    }
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function sectionKey(program, semester, name) {
  return [program, semester, name].map(v => String(v || "").trim().toLowerCase()).join("|");
}

function normalizedRoll(value) {
  return String(value ?? "").trim().toLowerCase();
}

function isActiveValue(value, fallback = true) {
  if (typeof value === "boolean") return value;
  return parseBoolean(value, fallback);
}

async function validateStudentPlacement({ sectionId, rollNo, excludeStudentId = null, active = true, academicSessionId = null }) {
  const section = await Section.findById(sectionId).populate("programId", "name code").lean();
  if (!section) return { error: "Selected section does not exist." };

  if (academicSessionId && String(section.academicSession || "") !== String(academicSessionId)) {
    return { error: "Selected section does not belong to the chosen academic session." };
  }

  const rollKey = normalizedRoll(rollNo);
  if (rollKey) {
    const rollFilter = { section: section._id };
    if (excludeStudentId) rollFilter._id = { $ne: excludeStudentId };
    const sectionStudents = await Student.find(rollFilter).select("rollNo").lean();
    if (sectionStudents.some(student => normalizedRoll(student.rollNo) === rollKey)) {
      return { error: `Roll No ${String(rollNo).trim()} already exists in section ${section.name}.` };
    }
  }

  const capacity = Math.max(0, Number(section.capacity || section.maxStudents || 0));
  if (active && capacity > 0) {
    const countFilter = { section: section._id, active: true };
    if (excludeStudentId) countFilter._id = { $ne: excludeStudentId };
    const activeCount = await Student.countDocuments(countFilter);
    if (activeCount >= capacity) {
      return { error: `Section ${section.name} is at capacity (${activeCount}/${capacity}). Increase capacity or choose another section.` };
    }
  }

  return { section };
}

router.get("/bulk-template", allowRoles("ADMIN", "SCHEDULER"), async (_req, res) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Students");
  sheet.columns = [
    { header: "Admission No", key: "admissionNo", width: 18 },
    { header: "Roll No", key: "rollNo", width: 14 },
    { header: "Name", key: "name", width: 28 },
    { header: "Email", key: "email", width: 30 },
    { header: "Phone", key: "phone", width: 16 },
    { header: "Gender", key: "gender", width: 12 },
    { header: "Date of Birth", key: "dateOfBirth", width: 16 },
    { header: "Father Name", key: "fatherName", width: 24 },
    { header: "Mother Name", key: "motherName", width: 24 },
    { header: "Category", key: "category", width: 16 },
    { header: "Address", key: "address", width: 35 },
    { header: "City", key: "city", width: 18 },
    { header: "State", key: "state", width: 18 },
    { header: "Pincode", key: "pincode", width: 12 },
    { header: "Section ID", key: "sectionId", width: 26 },
    { header: "Program", key: "program", width: 20 },
    { header: "Semester", key: "semester", width: 14 },
    { header: "Section Name", key: "sectionName", width: 18 },
    { header: "Active", key: "active", width: 12 },
    { header: "Admission Date", key: "admissionDate", width: 18 }
  ];
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  // Production template intentionally contains no sample/demo student data.
  const example = workbook.addWorksheet("Data Entry Guide");
  example.getCell(1, 1).value = "Enter student records in the Students sheet. Do not upload this guide sheet.";
  example.getCell(1, 1).font = { italic: true, color: { argb: "FF64748B" } };
  example.getColumn(1).width = 90;
  example.views = [{ state: "frozen", ySplit: 1 }];
  const instructions = workbook.addWorksheet("Instructions");
  instructions.getColumn(1).width = 110;
  [
    "Bulk Student Import Instructions",
    "Required: Admission No, Roll No, Name, and Section.",
    "Section can be supplied using Section ID OR the combination Program + Semester + Section Name.",
    "Admission No must be unique. Duplicate existing admission numbers are skipped.",
    "Active accepts Yes/No, True/False, 1/0. Blank means Yes.",
    "Date fields can be Excel dates or YYYY-MM-DD values.",
    "Maximum 1000 student rows per upload.",
    "Rows with validation errors are reported and are not imported. Valid rows are imported."
  ].forEach((text, i) => { instructions.getCell(i + 1, 1).value = text; });
  instructions.getCell(1, 1).font = { bold: true, size: 16 };
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="student-bulk-import-template.xlsx"');
  await workbook.xlsx.write(res);
  res.end();
});

router.post("/bulk", allowRoles("ADMIN", "SCHEDULER"), upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "Please upload an Excel file (.xlsx)." });
    if (!/\.xlsx$/i.test(req.file.originalname || "")) return res.status(400).json({ message: "Only .xlsx files are supported for bulk student import." });

    const workbook = new ExcelJS.Workbook();
    assertSafeXlsxBuffer(req.file.buffer);
    await workbook.xlsx.load(req.file.buffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) return res.status(400).json({ message: "The workbook does not contain a worksheet." });

    const headerRow = sheet.getRow(1);
    const headers = {};
    headerRow.eachCell((cell, col) => {
      const key = normalizeHeader(cell.value);
      if (key) headers[key] = col;
    });

    const aliases = {
      admissionNo: ["admissionno", "admissionnumber", "admissionid"],
      rollNo: ["rollno", "rollnumber"],
      name: ["name", "studentname", "fullname"],
      email: ["email", "emailid"],
      phone: ["phone", "mobile", "mobileno", "phonenumber"],
      gender: ["gender", "sex"],
      dateOfBirth: ["dateofbirth", "dob", "birthdate"],
      fatherName: ["fathername", "father"],
      motherName: ["mothername", "mother"],
      category: ["category", "caste"],
      address: ["address"],
      city: ["city"],
      state: ["state"],
      pincode: ["pincode", "postalcode", "zipcode"],
      sectionId: ["sectionid", "section"],
      program: ["program", "programname"],
      semester: ["semester", "term"],
      sectionName: ["sectionname", "sectioncode"],
      active: ["active", "status"],
      admissionDate: ["admissiondate", "dateofadmission"]
    };

    const col = name => {
      for (const alias of aliases[name]) if (headers[alias]) return headers[alias];
      return null;
    };

    for (const required of ["admissionNo", "rollNo", "name"]) {
      if (!col(required)) return res.status(400).json({ message: `Missing required column: ${required}.` });
    }
    if (!col("sectionId") && !(col("program") && col("semester") && col("sectionName"))) {
      return res.status(400).json({ message: "Section is required. Provide Section ID, or Program + Semester + Section Name." });
    }

    const academicSessionId = String(req.body?.academicSessionId || "").trim();
    const sectionFilter = academicSessionId ? { academicSession: academicSessionId } : {};
    if (academicSessionId && !await AcademicSession.exists({ _id: academicSessionId })) {
      return res.status(400).json({ message: "Selected academic session does not exist." });
    }
    const sections = await Section.find(sectionFilter).lean();
    const sectionById = new Map(sections.map(s => [String(s._id), s]));
    const sectionByKey = new Map();
    for (const section of sections) {
      const key = sectionKey(section.program, section.semester, section.name);
      const matches = sectionByKey.get(key) || [];
      matches.push(section);
      sectionByKey.set(key, matches);
    }
    const existingStudents = await Student.find({}, { admissionNo: 1, rollNo: 1, section: 1, active: 1 }).lean();
    const existingAdmissions = new Set(existingStudents.map(s => String(s.admissionNo).trim().toLowerCase()));
    const rollKeys = new Set(existingStudents.map(s => String(s.section) + "|" + normalizedRoll(s.rollNo)));
    const activeCounts = new Map();
    for (const student of existingStudents) {
      if (student.active !== false) {
        const key = String(student.section);
        activeCounts.set(key, (activeCounts.get(key) || 0) + 1);
      }
    }
    const seenAdmissions = new Set();
    const seenRolls = new Set();
    const rows = [];
    const errors = [];

    const maxRows = Math.min(sheet.rowCount, 1001);
    for (let rowNo = 2; rowNo <= maxRows; rowNo++) {
      const row = sheet.getRow(rowNo);
      const value = key => { const c = col(key); return c ? cellText(row.getCell(c).value) : ""; };
      const admissionNo = value("admissionNo");
      const rollNo = value("rollNo");
      const name = value("name");
      if (!admissionNo && !rollNo && !name) continue;

      const rowErrors = [];
      if (!admissionNo) rowErrors.push("Admission No is required");
      if (!rollNo) rowErrors.push("Roll No is required");
      if (!name) rowErrors.push("Name is required");

      const admissionKey = admissionNo.toLowerCase();
      if (admissionNo && existingAdmissions.has(admissionKey)) rowErrors.push("Admission No already exists");
      if (admissionNo && seenAdmissions.has(admissionKey)) rowErrors.push("Duplicate Admission No in uploaded file");

      let section = null;
      const sectionId = value("sectionId");
      if (sectionId) section = sectionById.get(sectionId);
      if (!section && value("program") && value("semester") && value("sectionName")) {
        const matches = sectionByKey.get(sectionKey(value("program"), value("semester"), value("sectionName"))) || [];
        if (matches.length === 1) section = matches[0];
        else if (matches.length > 1) rowErrors.push("Section mapping is ambiguous across academic sessions. Provide Section ID or select an Academic Session.");
      }
      if (!section) rowErrors.push("Section not found for the selected academic session.");

      const dateOfBirthRaw = value("dateOfBirth");
      const admissionDateRaw = value("admissionDate");
      const dateOfBirth = parseDate(dateOfBirthRaw);
      const admissionDate = parseDate(admissionDateRaw);
      const active = parseBoolean(value("active"), true);
      if (dateOfBirthRaw && !dateOfBirth) rowErrors.push("Invalid Date of Birth");
      if (admissionDateRaw && !admissionDate) rowErrors.push("Invalid Admission Date");

      const rollKey = section ? String(section._id) + "|" + normalizedRoll(rollNo) : "";
      if (section && rollNo && rollKeys.has(rollKey)) rowErrors.push("Roll No already exists in this section");
      if (section && rollNo && seenRolls.has(rollKey)) rowErrors.push("Duplicate Roll No in uploaded file for this section");
      if (section && academicSessionId && String(section.academicSession || "") !== academicSessionId) {
        rowErrors.push("Section does not belong to the selected academic session");
      }
      if (section && active) {
        const capacity = Math.max(0, Number(section.capacity || section.maxStudents || 0));
        const currentCount = activeCounts.get(String(section._id)) || 0;
        if (capacity > 0 && currentCount >= capacity) {
          rowErrors.push(`Section capacity exceeded (${currentCount}/${capacity})`);
        }
      }

      if (rowErrors.length) {
        errors.push({ row: rowNo, admissionNo, name, errors: rowErrors });
        continue;
      }

      seenAdmissions.add(admissionKey);
      seenRolls.add(rollKey);
      rollKeys.add(rollKey);
      if (active) activeCounts.set(String(section._id), (activeCounts.get(String(section._id)) || 0) + 1);
      rows.push({
        admissionNo, rollNo, name, email: value("email"), phone: value("phone"), gender: value("gender"),
        dateOfBirth, fatherName: value("fatherName"), motherName: value("motherName"), category: value("category"),
        address: value("address"), city: value("city"), state: value("state"), pincode: value("pincode"),
        section: section._id, program: section.program || value("program") || "", semester: section.semester || value("semester") || "", active, admissionDate
      });
    }

    if (sheet.rowCount > 1001) errors.push({ row: "2-1001", admissionNo: "", name: "", errors: ["Only the first 1000 student rows were processed."] });

    let inserted = 0;
    if (rows.length) {
      const result = await Student.insertMany(rows, { ordered: false });
      inserted = result.length;
    }

    res.status(201).json({
      message: `Bulk student import completed. ${inserted} student(s) imported.`,
      imported: inserted,
      skipped: errors.length,
      totalRows: Math.max(0, Math.min(sheet.rowCount, 1001) - 1),
      errors
    });
  } catch (e) {
    res.status(400).json({ message: e.code === 11000 ? "One or more Admission No values already exist." : e.message });
  }
});


router.post("/bulk-map", allowRoles("ADMIN", "SCHEDULER"), async (req, res) => {
  try {
    const studentIds = [...new Set(
      (Array.isArray(req.body?.studentIds) ? req.body.studentIds : [])
        .map(value => String(value || "").trim())
        .filter(Boolean)
    )];
    const sectionId = req.body?.section || req.body?.toSection;
    const academicSessionId = String(req.body?.academicSessionId || "").trim();

    if (!studentIds.length) return res.status(400).json({ message: "Select at least one student." });
    if (studentIds.length > 1000) return res.status(400).json({ message: "Select no more than 1000 students per operation." });
    if (!sectionId) return res.status(400).json({ message: "Destination section is required." });

    const section = await Section.findById(sectionId).populate("programId", "name code").lean();
    if (!section) return res.status(404).json({ message: "Destination section does not exist." });

    if (academicSessionId) {
      const session = await AcademicSession.findById(academicSessionId).select("_id name").lean();
      if (!session) return res.status(400).json({ message: "Selected academic session does not exist." });
      if (!section.academicSession || String(section.academicSession) !== String(session._id)) {
        return res.status(400).json({ message: "Destination section is not assigned to the selected academic session. Use Student Promotion for cross-session movement." });
      }
    }

    const students = await Student.find({ _id: { $in: studentIds } })
      .select("_id name active section")
      .populate("section", "academicSession")
      .lean();
    if (students.length !== studentIds.length) {
      return res.status(400).json({ message: "One or more selected student records no longer exist. Refresh the student list and try again." });
    }
    const inactive = students.find(student => student.active === false);
    if (inactive) {
      return res.status(400).json({ message: `${inactive.name || "A selected student"} is inactive and cannot be mapped.` });
    }
    const targetSectionSessionId = String(section.academicSession || "");
    const crossSessionStudent = students.find(student =>
      String(student.section?.academicSession?._id || student.section?.academicSession || "") !== targetSectionSessionId
    );
    if (crossSessionStudent) {
      return res.status(400).json({
        message: `${crossSessionStudent.name || "A selected student"} belongs to a different academic session. Use Student Promotion for cross-session movement.`
      });
    }
    if (academicSessionId) {
      const wrongSession = students.find(student =>
        !student.section?.academicSession ||
        String(student.section.academicSession) !== academicSessionId
      );
      if (wrongSession) {
        return res.status(400).json({ message: `${wrongSession.name || "A selected student"} is not assigned to the selected academic session. Use Student Promotion for cross-session movement.` });
      }
    }

    const movingIds = students
      .filter(student => String(student.section?._id || student.section || "") !== String(section._id))
      .map(student => student._id);
    const capacity = Number(section.capacity || section.maxStudents || 0);
    if (capacity > 0 && movingIds.length) {
      const currentCount = await Student.countDocuments({
        section: section._id,
        active: true,
        _id: { $nin: movingIds }
      });
      if (currentCount + movingIds.length > capacity) {
        return res.status(400).json({
          message: `Destination section capacity exceeded. Capacity ${capacity}; current ${currentCount}; requested ${movingIds.length}.`
        });
      }
    }

    const program = section.program || section.programId?.name || "";
    const semester = section.semester || "";
    const operations = students
      .filter(student => String(student.section?._id || student.section || "") !== String(section._id))
      .map(student => ({
        updateOne: {
          filter: { _id: student._id, active: true, section: student.section?._id || student.section },
          update: { $set: { section: section._id, program, semester } }
        }
      }));

    if (operations.length) {
      const result = await Student.bulkWrite(operations, { ordered: true });
      const updated = result.modifiedCount ?? result.nModified ?? 0;
      if (updated !== operations.length) {
        return res.status(409).json({ message: "Some student records changed during mapping. Refresh the list and verify the current section assignments before retrying.", updated });
      }
      return res.json({
        ok: true,
        updated,
        skipped: students.length - operations.length,
        message: `${updated} student(s) mapped to ${program} · Semester ${semester} · ${section.name}.`
      });
    }

    return res.json({
      ok: true,
      updated: 0,
      skipped: students.length,
      message: "All selected students are already mapped to the destination section."
    });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

router.get("/", async (req, res) => {
  try {
    const filter = {};
    const role = req.user?.role;

    if (role === "VIEWER") {
      const assignedSection = String(req.user?.section || "");
      if (!assignedSection) return res.status(403).json({ message: "No Section is mapped to this Viewer account." });
      if (req.query.sectionId && !canAccessStudentSectionList(role, req.user, req.query.sectionId)) {
        return res.status(403).json({ message: "You can only view students in your mapped section." });
      }
      filter.section = assignedSection;
    } else if (role === "FACULTY") {
      if (!req.user?.faculty) return res.status(403).json({ message: "No Faculty is mapped to this account." });
      const activeSession = await AcademicSession.findOne({ active: true }).select("_id").lean();
      const timetableFilter = activeSession
        ? { academicSession: activeSession._id, isCurrent: true }
        : { isCurrent: true };
      const timetable = await Timetable.findOne(timetableFilter).lean();
      const sectionIds = [...new Set((timetable?.entries || [])
        .filter(entry => String(entry.faculty) === String(req.user.faculty))
        .map(entry => String(entry.section)))];
      if (req.query.sectionId) {
        if (!canAccessStudentSectionList(role, req.user, req.query.sectionId, sectionIds)) {
          return res.status(403).json({ message: "You can only view students in sections assigned to your faculty account." });
        }
        filter.section = String(req.query.sectionId);
      } else {
        filter.section = { $in: sectionIds };
      }
    } else if (["ADMIN", "SCHEDULER"].includes(role)) {
      if (req.query.sectionId) filter.section = req.query.sectionId;
    } else {
      return res.status(403).json({ message: "You are not authorized to view student records." });
    }

    if (req.query.active !== undefined) filter.active = String(req.query.active) !== "false";
    const rows = await Student.find(filter)
      .sort({ section: 1, rollNo: 1, name: 1 })
      .populate("section", "name program programId semester academicSession")
      .lean();
    res.json(rows);
  } catch (e) { res.status(500).json({ message: e.message }); }
});

router.post("/", allowRoles("ADMIN", "SCHEDULER"), async (req, res) => {
  try {
    const body = req.body || {};
    const admissionNo = String(body.admissionNo || "").trim();
    const rollNo = String(body.rollNo || "").trim();
    const name = String(body.name || "").trim();
    const sectionId = String(body.section || "").trim();
    if (!admissionNo || !rollNo || !name || !sectionId) {
      return res.status(400).json({ message: "Admission No, Roll No, Name and Section are required." });
    }
    const active = isActiveValue(body.active, true);
    const placement = await validateStudentPlacement({
      sectionId,
      rollNo,
      active,
      academicSessionId: body.academicSessionId || null
    });
    if (placement.error) return res.status(400).json({ message: placement.error });
    const sectionDoc = placement.section;
    const created = await Student.create({
      admissionNo, rollNo, name,
      email: String(body.email || "").trim(),
      phone: String(body.phone || "").trim(),
      gender: String(body.gender || "").trim(),
      dateOfBirth: body.dateOfBirth || null,
      fatherName: String(body.fatherName || "").trim(),
      motherName: String(body.motherName || "").trim(),
      category: String(body.category || "").trim(),
      address: String(body.address || "").trim(),
      city: String(body.city || "").trim(),
      state: String(body.state || "").trim(),
      pincode: String(body.pincode || "").trim(),
      section: sectionDoc._id,
      program: sectionDoc.program || sectionDoc.programId?.name || "",
      semester: sectionDoc.semester || "",
      active,
      admissionDate: body.admissionDate || null
    });
    res.status(201).json(await Student.findById(created._id).populate("section", "name program programId semester academicSession"));
  } catch (e) {
    res.status(400).json({ message: e.code === 11000 ? "Admission No must be unique." : e.message });
  }
});

router.put("/:id", allowRoles("ADMIN", "SCHEDULER"), async (req, res) => {
  try {
    const current = await Student.findById(req.params.id).populate("section", "name program programId semester academicSession").lean();
    if (!current) return res.status(404).json({ message: "Student not found." });

    const allowedFields = [
      "admissionNo", "rollNo", "name", "email", "phone", "gender", "dateOfBirth",
      "fatherName", "motherName", "category", "address", "city", "state", "pincode",
      "section", "active", "admissionDate"
    ];
    const body = {};
    for (const key of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(req.body || {}, key)) body[key] = req.body[key];
    }
    delete body._id; delete body.createdAt; delete body.updatedAt;

    const targetSectionId = String(body.section || current.section?._id || "");
    if (!targetSectionId) return res.status(400).json({ message: "Student must be assigned to a section." });
    const targetSessionId = String(req.body?.academicSessionId || "");
    const placement = await validateStudentPlacement({
      sectionId: targetSectionId,
      rollNo: body.rollNo ?? current.rollNo,
      excludeStudentId: current._id,
      active: isActiveValue(body.active, current.active !== false),
      academicSessionId: targetSessionId || null
    });
    if (placement.error) return res.status(400).json({ message: placement.error });

    const oldSessionId = String(current.section?.academicSession || "");
    const newSessionId = String(placement.section.academicSession || "");
    if (oldSessionId && newSessionId && oldSessionId !== newSessionId) {
      return res.status(400).json({ message: "Changing a student's academic session must use Student Promotion, which records movement history." });
    }

    body.section = placement.section._id;
    body.program = placement.section.program || placement.section.programId?.name || "";
    body.semester = placement.section.semester || "";
    if (Object.prototype.hasOwnProperty.call(body, "active")) body.active = isActiveValue(body.active, current.active !== false);

    const updated = await Student.findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true })
      .populate("section", "name program programId semester academicSession");
    res.json(updated);
  } catch (e) {
    res.status(400).json({ message: e.code === 11000 ? "Admission No must be unique." : e.message });
  }
});

router.delete("/:id", allowRoles("ADMIN", "SCHEDULER"), async (req, res) => {
  try {
    const updated = await Student.findByIdAndUpdate(req.params.id, { active: false }, { new: true }).populate("section", "name program programId semester");
    if (!updated) return res.status(404).json({ message: "Student not found." });
    res.json({ ok: true, student: updated, message: "Student marked inactive. Historical attendance is retained." });
  } catch (e) { res.status(400).json({ message: e.message }); }
});

export default router;
