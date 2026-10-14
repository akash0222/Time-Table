import mongoose from "mongoose";

const semesterSchema = new mongoose.Schema({
  academicSession: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicSession", required: true, index: true },
  program: { type: mongoose.Schema.Types.ObjectId, ref: "Program", required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 80 },
  order: { type: Number, required: true, min: 1, max: 20, default: 1 },
  active: { type: Boolean, default: true }
}, { timestamps: true });

semesterSchema.index({ academicSession: 1, program: 1, name: 1 }, { unique: true });

export default mongoose.model("Semester", semesterSchema);
