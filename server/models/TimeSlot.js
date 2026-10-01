import mongoose from "mongoose";

const timeSlotSchema = new mongoose.Schema({
  // Optional program mapping. When set, this slot is available only to that program.
  // When null, the slot is shared by all programs.
  program: { type: mongoose.Schema.Types.ObjectId, ref: "Program", default: null },
  day: { type: String, required: true },
  startTime: { type: String, required: true },
  endTime: { type: String, required: true },
  order: { type: Number, required: true },
  isBreak: { type: Boolean, default: false }
}, { timestamps: true });

export default mongoose.model("TimeSlot", timeSlotSchema);
