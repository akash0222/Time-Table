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
  sessionOverrides: {
    type: [{
      academicSession: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicSession", required: true },
      maxConsecutiveFaculty: { type: Number, min: 1, max: 8 },
      maxConsecutiveSection: { type: Number, min: 1, max: 8 },
      avoidSameSubjectSameDay: { type: Boolean },
      distributeSubjectAcrossDays: { type: Boolean },
      avoidFirstLastPeriod: { type: Boolean },
      holidayDays: { type: [String] }
    }],
    default: []
  }
}, { timestamps: true });

export default mongoose.model("SchedulerSetting", schedulerSettingSchema);
