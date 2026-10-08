import mongoose from "mongoose";

const schedulerSettingSchema = new mongoose.Schema({
  key: { type: String, default: "default", index: true },
  academicSession: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicSession", default: null, index: true },
  maxConsecutiveFaculty: { type: Number, default: 2, min: 1, max: 8 },
  maxConsecutiveSection: { type: Number, default: 3, min: 1, max: 8 },
  avoidSameSubjectSameDay: { type: Boolean, default: true },
  distributeSubjectAcrossDays: { type: Boolean, default: true },
  avoidFirstLastPeriod: { type: Boolean, default: false },
  holidayDays: { type: [String], default: ["Sunday"] }
}, { timestamps: true });

schedulerSettingSchema.index({ academicSession: 1, key: 1 }, { unique: true });

export default mongoose.model("SchedulerSetting", schedulerSettingSchema);
