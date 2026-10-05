import mongoose from "mongoose";

const sectionSchema = new mongoose.Schema({
  programId: { type: mongoose.Schema.Types.ObjectId, ref: "Program", default: null, index: true },
  academicSession: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicSession", default: null, index: true },
  program: { type: String, required: true, trim: true },
  semester: { type: String, required: true, trim: true },
  name: { type: String, required: true, trim: true },
  maxClassesPerDay: { type: Number, default: 6, min: 1, max: 12 },
  capacity: { type: Number, default: 0, min: 0 }
}, { timestamps: true });

export default mongoose.model("Section", sectionSchema);
