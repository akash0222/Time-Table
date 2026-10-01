import mongoose from "mongoose";

const facultySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  code: { type: String, trim: true },
  maxWorkingDays: { type: Number, default: 5, min: 1, max: 7 },
  maxClassesPerDay: { type: Number, default: 4, min: 1, max: 12 },
  availableDays: {
    type: [String],
    default: ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"]
  },
  unavailableSlots: { type: [String], default: [] }
}, { timestamps: true });

export default mongoose.model("Faculty", facultySchema);
