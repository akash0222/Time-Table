import mongoose from "mongoose";

const schema = new mongoose.Schema({
  academicSession: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicSession", required: true },
  sourceAcademicSession: { type: mongoose.Schema.Types.ObjectId, ref: "AcademicSession", default: null },
  student: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true },
  fromSection: { type: mongoose.Schema.Types.ObjectId, ref: "Section", required: true },
  toSection: { type: mongoose.Schema.Types.ObjectId, ref: "Section", required: true },
  action: { type: String, enum: ["PROMOTED", "TRANSFERRED"], default: "PROMOTED" },
  remarks: { type: String, default: "" },
  changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  changedByName: { type: String, default: "" },
  status: { type: String, enum: ["COMPLETED", "ROLLED_BACK"], default: "COMPLETED" },
  rolledBackAt: { type: Date, default: null },
  rolledBackBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
}, { timestamps: true });

schema.index({ academicSession: 1, student: 1, createdAt: -1 });

export default mongoose.model("StudentPromotion", schema);
