import mongoose from "mongoose";

const schema = new mongoose.Schema({
  action:{type:String,required:true,trim:true},
  category:{type:String,default:"SYSTEM",trim:true},
  description:{type:String,required:true,trim:true},
  user:{type:mongoose.Schema.Types.ObjectId,ref:"User",default:null},
  username:{type:String,default:""},
  role:{type:String,default:""},
  targetType:{type:String,default:""},
  targetId:{type:String,default:""},
  metadata:{type:mongoose.Schema.Types.Mixed,default:{}},
  ipAddress:{type:String,default:""}
},{timestamps:true});

schema.index({createdAt:-1});
schema.index({action:1,createdAt:-1});
schema.index({user:1,createdAt:-1});
export default mongoose.model("AuditLog",schema);
