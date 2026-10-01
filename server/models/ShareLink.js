import mongoose from "mongoose";

const shareLinkSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true, index: true },
  timetable: { type: mongoose.Schema.Types.ObjectId, ref: "Timetable", required: true },
  academicSession: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicSession", default: null },
  scope: { type: String, enum: ["FULL", "SECTION", "FACULTY"], default: "FULL" },
  section: { type: mongoose.Schema.Types.ObjectId, ref: "Section", default: null },
  faculty: { type: mongoose.Schema.Types.ObjectId, ref: "Faculty", default: null },
  expiresAt: { type: Date, default: null },
  active: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  createdByName: { type: String, default: "" },
  accessCount: { type: Number, default: 0 },
  lastAccessedAt: { type: Date, default: null }
}, { timestamps: true });

export default mongoose.model("ShareLink", shareLinkSchema);
