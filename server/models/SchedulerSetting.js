import mongoose from "mongoose";

const schedulerSettingSchema = new mongoose.Schema({
  // Keep the legacy singleton key so existing production data/indexes remain compatible.
  key: { type: String, unique: true, default: "default" },
  maxConsecutiveFaculty: { type: Number, default: 2, min: 1, max: 8 },
  maxConsecutiveSection: { type: Number, default: 3, min: 1, max: 8 },
  avoidSameSubjectSameDay: { type: Boolean, default: true },
  distributeSubjectAcrossDays: { type: Boolean, default: true },
  avoidFirstLastPeriod: { type: Boolean, default: false },
  holidayDays: { type: [String], default: ["Sunday"] },
  generationRuns: { type: Number, default: 8, min: 1, max: 30 },
  generationTimeLimitMs: { type: Number, default: 30000, min: 1000, max: 120000 },
  generationAttempts: { type: Number, default: 500, min: 50, max: 5000 },
  sessionOverrides: {
    type: [{
      academicSession: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicSession", required: true },
      maxConsecutiveFaculty: { type: Number, min: 1, max: 8 },
      maxConsecutiveSection: { type: Number, min: 1, max: 8 },
      avoidSameSubjectSameDay: { type: Boolean },
      distributeSubjectAcrossDays: { type: Boolean },
      avoidFirstLastPeriod: { type: Boolean },
      holidayDays: { type: [String] },
      generationRuns: { type: Number, min: 1, max: 30 },
      generationTimeLimitMs: { type: Number, min: 1000, max: 120000 },
      generationAttempts: { type: Number, min: 50, max: 5000 }
    }],
    default: []
  }
}, { timestamps: true });

export default mongoose.model("SchedulerSetting", schedulerSettingSchema);
