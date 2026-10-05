import mongoose from "mongoose";

const studentSchema = new mongoose.Schema({
  admissionNo: { type: String, required: true, unique: true, trim: true },
  rollNo: { type: String, required: true, trim: true },
  name: { type: String, required: true, trim: true },
  email: { type: String, trim: true, default: "" },
  phone: { type: String, trim: true, default: "" },
  gender: { type: String, trim: true, default: "" },
  dateOfBirth: { type: Date, default: null },
  fatherName: { type: String, trim: true, default: "" },
  motherName: { type: String, trim: true, default: "" },
  category: { type: String, trim: true, default: "" },
  address: { type: String, trim: true, default: "" },
  city: { type: String, trim: true, default: "" },
  state: { type: String, trim: true, default: "" },
  pincode: { type: String, trim: true, default: "" },
  section: { type: mongoose.Schema.Types.ObjectId, ref: "Section", required: true },
  // Section is the source of truth for Program/Semester/Section mapping.
  // These legacy display fields are optional and are kept only for import compatibility.
  program: { type: String, trim: true, default: "" },
  semester: { type: String, trim: true, default: "" },
  active: { type: Boolean, default: true },
  admissionDate: { type: Date, default: null }
}, { timestamps: true });

studentSchema.index({ section: 1, rollNo: 1 });

export default mongoose.model("Student", studentSchema);
