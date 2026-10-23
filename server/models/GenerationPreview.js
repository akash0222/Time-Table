import mongoose from "mongoose";

const generationPreviewSchema = new mongoose.Schema({
  createdBy: { type: String, required: true, index: true },
  academicSession: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicSession", required: true, index: true },
  programIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Program" }],
  entries: { type: [mongoose.Schema.Types.Mixed], default: [] },
  score: { type: Number, default: 0 },
  metrics: { type: mongoose.Schema.Types.Mixed, default: null },
  warnings: { type: [String], default: [] },
  report: { type: mongoose.Schema.Types.Mixed, default: null },
  expectedSessions: { type: Number, default: 0 },
  generationRuns: { type: Number, default: 1 },
  baseTimetableId: { type: mongoose.Schema.Types.ObjectId, ref: "Timetable", default: null },
  baseTimetableUpdatedAt: { type: Date, default: null },
  status: { type: String, enum: ["READY", "COMMITTED"], default: "READY", index: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
  committedTimetable: { type: mongoose.Schema.Types.ObjectId, ref: "Timetable", default: null }
}, { timestamps: true });

generationPreviewSchema.index({ createdBy: 1, status: 1, expiresAt: 1 });
export default mongoose.model("GenerationPreview", generationPreviewSchema);
