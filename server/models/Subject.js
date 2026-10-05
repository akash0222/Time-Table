import mongoose from "mongoose";

const subjectSchema = new mongoose.Schema({
<<<<<<< HEAD
=======
  academicSession: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicSession", default: null, index: true },
  programId: { type: mongoose.Schema.Types.ObjectId, ref: "Program", default: null, index: true },
  subjectType: { type: String, enum: ["CORE", "ELECTIVE", "PRACTICAL", "LAB"], default: "CORE" },
  active: { type: Boolean, default: true },
>>>>>>> 62a144d (Phase 18 QA fixes and Link2 runtime fix)
  name: { type: String, required: true, trim: true },
  code: { type: String, trim: true },
  faculty: { type: mongoose.Schema.Types.ObjectId, ref: "Faculty", required: true },
  section: { type: mongoose.Schema.Types.ObjectId, ref: "Section", required: true },
  classesPerWeek: { type: Number, required: true, min: 1, max: 20 },
  totalSessions: { type: Number, default: 0, min: 0, max: 1000 },
  maxClassesPerWeek: { type: Number, default: 0, min: 0, max: 20 },
  duration: { type: Number, default: 1, min: 1, max: 3 },
  roomType: { type: String, enum: ["Classroom", "Lab", "Any"], default: "Classroom" }
}, { timestamps: true });

<<<<<<< HEAD
=======
subjectSchema.index({ academicSession: 1, section: 1, faculty: 1 });

>>>>>>> 62a144d (Phase 18 QA fixes and Link2 runtime fix)
export default mongoose.model("Subject", subjectSchema);
