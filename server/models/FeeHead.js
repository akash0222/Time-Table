import mongoose from "mongoose";

const feeHeadSchema = new mongoose.Schema({
  name:{type:String,required:true,trim:true},
  code:{type:String,required:true,trim:true,uppercase:true},
  program:{type:String,default:"",trim:true},
  semester:{type:String,default:"",trim:true},
  amount:{type:Number,required:true,min:0},
  frequency:{type:String,enum:["ONE_TIME","ANNUAL","SEMESTER","MONTHLY"],default:"SEMESTER"},
  dueDate:{type:Date,default:null},
  active:{type:Boolean,default:true},
  description:{type:String,default:"",trim:true}
},{timestamps:true});
feeHeadSchema.index({code:1},{unique:true});
export default mongoose.model("FeeHead",feeHeadSchema);
