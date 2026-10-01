import mongoose from "mongoose";

const attendanceRecordSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
  status: { type: String, enum: ["PRESENT", "ABSENT", "LATE", "LEAVE", "UNMARKED"], default: "UNMARKED" },
  remarks: { type: String, default: "" }
}, { _id: false });

const attendanceSessionSchema = new mongoose.Schema({
  date: { type: String, required: true },
  academicSession: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicSession", default: null },
  timetable: { type: mongoose.Schema.Types.ObjectId, ref: "Timetable", required: true },
  timetableEntryId: { type: String, required: true },
  section: { type: mongoose.Schema.Types.ObjectId, ref: "Section", required: true },
  subject: { type: mongoose.Schema.Types.ObjectId, ref: "Subject", required: true },
  faculty: { type: mongoose.Schema.Types.ObjectId, ref: "Faculty", required: true },
  startTime: { type: String, default: "" },
  endTime: { type: String, default: "" },
  status: { type: String, enum: ["OPEN", "SUBMITTED", "LOCKED"], default: "OPEN" },
  records: { type: [attendanceRecordSchema], default: [] },
  notes: { type: String, default: "" },
  markedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  markedByName: { type: String, default: "" },
  markedAt: { type: Date, default: null }
}, { timestamps: true });

attendanceSessionSchema.index({ date: 1, timetable: 1, timetableEntryId: 1 }, { unique: true });
attendanceSessionSchema.index({ section: 1, date: 1 });
attendanceSessionSchema.index({ subject: 1, date: 1 });

export default mongoose.model("AttendanceSession", attendanceSessionSchema);
