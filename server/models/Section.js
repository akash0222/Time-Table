import mongoose from "mongoose";

const sectionSchema = new mongoose.Schema({
  program: { type: String, required: true, trim: true },
  semester: { type: String, required: true, trim: true },
  name: { type: String, required: true, trim: true },
  maxClassesPerDay: { type: Number, default: 6, min: 1, max: 12 }
}, { timestamps: true });

export default mongoose.model("Section", sectionSchema);
