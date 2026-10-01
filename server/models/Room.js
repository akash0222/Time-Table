import mongoose from "mongoose";

const roomSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  type: { type: String, enum: ["Classroom", "Lab"], default: "Classroom" },
  capacity: { type: Number, default: 60, min: 1 }
}, { timestamps: true });

export default mongoose.model("Room", roomSchema);
