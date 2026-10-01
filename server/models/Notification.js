import mongoose from "mongoose";

const readSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  readAt: { type: Date, default: Date.now }
}, { _id: false });

const notificationSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  message: { type: String, required: true, trim: true },
  priority: { type: String, enum: ["NORMAL", "IMPORTANT", "URGENT"], default: "NORMAL" },
  audience: { type: String, enum: ["ALL", "FACULTY", "SECTION", "USER"], default: "ALL" },
  faculty: { type: mongoose.Schema.Types.ObjectId, ref: "Faculty", default: null },
  section: { type: mongoose.Schema.Types.ObjectId, ref: "Section", default: null },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  published: { type: Boolean, default: true },
  startAt: { type: Date, default: Date.now },
  endAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  readBy: { type: [readSchema], default: [] },
  sourceType: { type: String, default: "" },
  sourceId: { type: String, default: "" },
  eventKey: { type: String, default: "" },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

export default mongoose.model("Notification", notificationSchema);
