import mongoose from "mongoose";

const timeSlotSchema = new mongoose.Schema({
  // Optional scopes allow different programs/semesters to use independent
  // clock schedules during the same academic session.
  academicSession: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicSession", default: null, index: true },
  program: { type: mongoose.Schema.Types.ObjectId, ref: "Program", default: null, index: true },
  // Blank semester means a program-wide default; otherwise match Section.semester.
  semester: { type: String, trim: true, default: "", maxlength: 80 },
  day: { type: String, required: true },
  startTime: { type: String, required: true },
  endTime: { type: String, required: true },
  order: { type: Number, required: true },
  isBreak: { type: Boolean, default: false }
}, { timestamps: true });

export default mongoose.model("TimeSlot", timeSlotSchema);
