import mongoose from 'mongoose';
const entry = new mongoose.Schema({date:String,day:String,startTime:String,endTime:String,order:Number,duration:Number,section:{type:mongoose.Schema.Types.ObjectId,ref:'Section'},subject:{type:mongoose.Schema.Types.ObjectId,ref:'Subject'},faculty:{type:mongoose.Schema.Types.ObjectId,ref:'Faculty'},room:{type:mongoose.Schema.Types.ObjectId,ref:'Room'}},{_id:true});
const week = new mongoose.Schema({weekNumber:Number,startDate:String,endDate:String,calendarDates:[{date:String,day:String,status:{type:String,default:'WORKING'},title:String}],workingDates:[String],entries:[entry],variationPercent:Number},{_id:false});
const schema = new mongoose.Schema({academicSession:{type:mongoose.Schema.Types.ObjectId,ref:'AcademicSession',required:true,index:true},version:Number,status:{type:String,enum:['DRAFT','PUBLISHED'],default:'DRAFT'},isCurrent:{type:Boolean,default:true},holidays:[String],weeks:[week],totalEntries:Number,createdBy:String},{timestamps:true});
schema.index({academicSession:1,version:1},{unique:true});
export default mongoose.model('SessionPlan',schema);
