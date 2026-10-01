import express from "express";
import Student from "../models/Student.js";
import AttendanceSession from "../models/AttendanceSession.js";
import FeeInvoice from "../models/FeeInvoice.js";
import FeePayment from "../models/FeePayment.js";
import StudentPromotion from "../models/StudentPromotion.js";
import Timetable from "../models/Timetable.js";

const router = express.Router();

async function allowed(req, student) {
  if (!student) return false;
  if (["ADMIN", "SCHEDULER"].includes(req.user?.role)) return true;
  if (req.user?.role === "VIEWER") return String(student.section?._id || student.section) === String(req.user.section || "");
  if (req.user?.role === "FACULTY") {
    if (!req.user?.faculty) return false;
    const timetable = await Timetable.findOne({ isCurrent: true }).lean();
    return Boolean((timetable?.entries || []).some(e =>
      String(e.faculty) === String(req.user.faculty) && String(e.section) === String(student.section?._id || student.section)
    ));
  }
  return false;
}

router.get("/:id", async (req, res) => {
  try {
    const student = await Student.findById(req.params.id)
      .populate("section", "name program semester")
      .lean();
    if (!student) return res.status(404).json({ message: "Student not found." });
    if (!await allowed(req, student)) return res.status(403).json({ message: "You are not authorized to view this student's profile." });

    const [attendance, invoices, payments, promotions] = await Promise.all([
      AttendanceSession.find({ "records.student": student._id })
        .populate("subject", "name code")
        .populate("section", "name program semester")
        .populate("faculty", "name code")
        .populate("academicSession", "name")
        .sort({ date: -1, startTime: -1 }).lean(),
      FeeInvoice.find({ student: student._id })
        .populate("feeHead", "name code")
        .populate("academicSession", "name")
        .sort({ createdAt: -1 }).lean(),
      FeePayment.find({ student: student._id })
        .populate("invoice", "invoiceNo")
        .sort({ paymentDate: -1 }).lean(),
      StudentPromotion.find({ student: student._id })
        .populate("fromSection", "name program semester")
        .populate("toSection", "name program semester")
        .populate("academicSession", "name")
        .sort({ createdAt: -1 }).lean()
    ]);

    const attendanceRows = [];
    const counts = { PRESENT: 0, ABSENT: 0, LATE: 0, LEAVE: 0, UNMARKED: 0 };
    for (const session of attendance) {
      const record = (session.records || []).find(r => String(r.student) === String(student._id));
      if (!record) continue;
      counts[record.status] = (counts[record.status] || 0) + 1;
      attendanceRows.push({
        _id: session._id,
        date: session.date,
        subject: session.subject,
        section: session.section,
        faculty: session.faculty,
        startTime: session.startTime,
        endTime: session.endTime,
        status: record.status,
        remarks: record.remarks || "",
        academicSession: session.academicSession
      });
    }
    const marked = counts.PRESENT + counts.ABSENT + counts.LATE + counts.LEAVE;
    const attended = counts.PRESENT + counts.LATE;
    const attendancePercentage = marked ? Number(((attended / marked) * 100).toFixed(2)) : 0;

    const feeSummary = invoices.reduce((a, i) => {
      a.billed += Number(i.netAmount || 0);
      a.paid += Number(i.paidAmount || 0);
      a.balance += Number(i.balance || 0);
      a.invoices += 1;
      return a;
    }, { invoices: 0, billed: 0, paid: 0, balance: 0 });

    res.json({
      student,
      summary: {
        attendance: { ...counts, marked, attended, percentage: attendancePercentage },
        fees: feeSummary,
        promotions: promotions.length,
        active: student.active !== false
      },
      attendance: attendanceRows,
      fees: invoices,
      payments,
      promotions
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

export default router;
