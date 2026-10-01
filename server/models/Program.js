import mongoose from "mongoose";

const programSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  code: { type: String, trim: true },
  department: { type: String, trim: true, default: "" },
  durationYears: { type: Number, default: 4, min: 1, max: 6 },
  active: { type: Boolean, default: true }
}, { timestamps: true });

export default mongoose.model("Program", programSchema);
