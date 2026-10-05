import mongoose from "mongoose";

const programDateSchema = new mongoose.Schema({
  program: { type: mongoose.Schema.Types.ObjectId, ref: "Program", required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true }
}, { _id: true });

programDateSchema.pre("validate", function(next) {
  if (this.startDate && this.endDate && this.endDate < this.startDate) {
    return next(new Error("Program session end date must be on or after the start date."));
  }
  next();
});

const schema = new mongoose.Schema({
  name:{type:String,required:true,unique:true,trim:true},
  // Legacy/global dates are retained for backward compatibility. New sessions
  // should use programDates so every program can have its own calendar.
  startDate:{type:Date},
  endDate:{type:Date},
  programDates:{type:[programDateSchema],default:[]},
  active:{type:Boolean,default:false},
<<<<<<< HEAD
  description:{type:String,default:""}
=======
  description:{type:String,default:""},
  holidayDates:{type:[String],default:[]}
>>>>>>> 62a144d (Phase 18 QA fixes and Link2 runtime fix)
},{timestamps:true});

schema.pre("validate", function(next) {
  if (this.startDate && this.endDate && this.endDate < this.startDate) {
    return next(new Error("Session end date must be on or after the start date."));
  }
  next();
});

export default mongoose.model("AcademicSession",schema);
