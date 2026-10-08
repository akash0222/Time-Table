import mongoose from "mongoose";

const approvalHistorySchema = new mongoose.Schema({
  from: { type: String, default: "" },
  to: { type: String, required: true },
  note: { type: String, default: "" },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  username: { type: String, default: "" },
  role: { type: String, default: "" },
  changedAt: { type: Date, default: Date.now }
}, { _id: true });

const timetableSchema = new mongoose.Schema({
  generatedAt: { type: Date, default: Date.now },
  entries: [{
    day: String,
    startTime: String,
    endTime: String,
    order: Number,
    duration: { type: Number, default: 1 },
    section: { type: mongoose.Schema.Types.ObjectId, ref: "Section" },
    subject: { type: mongoose.Schema.Types.ObjectId, ref: "Subject" },
    faculty: { type: mongoose.Schema.Types.ObjectId, ref: "Faculty" },
    room: { type: mongoose.Schema.Types.ObjectId, ref: "Room" }
  }],
  score: Number,
  optimizationScore: { type: Number, default: null },
  optimizationMetrics: { type: mongoose.Schema.Types.Mixed, default: null },
  optimizationRuns: { type: Number, default: 0 },
  optimizationComparison: { type: mongoose.Schema.Types.Mixed, default: [] },
  warnings: [String],
  academicSession:{type:mongoose.Schema.Types.ObjectId,ref:"AcademicSession"},
  version:{type:Number,default:1},
  versionLabel:{type:String,default:""},
  isCurrent:{type:Boolean,default:true},
  createdBy:{type:String,default:""},
  notes:{type:String,default:""},
  status: { type: String, enum: ["DRAFT", "SUBMITTED", "APPROVED", "PUBLISHED", "LOCKED"], default: "DRAFT" },
  statusChangedAt: { type: Date, default: Date.now },
  statusNote: { type: String, default: "" },
  approvalHistory: { type: [approvalHistorySchema], default: [] }
}, { timestamps: true });

// Session-aware lookups are used throughout the application. Keep this index
// aligned with the current-timetable query pattern without forcing a unique
// index until existing production data has been reconciled.
timetableSchema.index({ academicSession: 1, isCurrent: 1, createdAt: -1 });

export default mongoose.model("Timetable", timetableSchema);
