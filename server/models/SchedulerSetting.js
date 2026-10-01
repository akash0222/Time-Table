import mongoose from "mongoose";

const schedulerSettingSchema = new mongoose.Schema({
  key: { type: String, unique: true, default: "default" },
  maxConsecutiveFaculty: { type: Number, default: 2, min: 1, max: 8 },
  maxConsecutiveSection: { type: Number, default: 3, min: 1, max: 8 },
  avoidSameSubjectSameDay: { type: Boolean, default: true },
  distributeSubjectAcrossDays: { type: Boolean, default: true },
  avoidFirstLastPeriod: { type: Boolean, default: false },
  generationRuns: { type: Number, default: 8, min: 1, max: 20 },
  generationTimeLimitMs: { type: Number, default: 30000, min: 5000, max: 60000 }
}, { timestamps: true });

export default mongoose.model("SchedulerSetting", schedulerSettingSchema);
