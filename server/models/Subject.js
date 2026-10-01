import mongoose from "mongoose";

const subjectSchema = new mongoose.Schema({
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

export default mongoose.model("Subject", subjectSchema);
