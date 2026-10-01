import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  username: { type: String, required: true, unique: true, trim: true, lowercase: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ["ADMIN", "SCHEDULER", "FACULTY", "VIEWER"], default: "VIEWER" },
  faculty: { type: mongoose.Schema.Types.ObjectId, ref: "Faculty", default: null },
  section: { type: mongoose.Schema.Types.ObjectId, ref: "Section", default: null },
  active: { type: Boolean, default: true }
}, { timestamps: true });

export default mongoose.model("User", userSchema);
