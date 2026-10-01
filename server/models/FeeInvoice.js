import mongoose from "mongoose";

const feeInvoiceSchema = new mongoose.Schema({
  invoiceNo:{type:String,required:true,unique:true,trim:true},
  student:{type:mongoose.Schema.Types.ObjectId,ref:"Student",required:true},
  feeHead:{type:mongoose.Schema.Types.ObjectId,ref:"FeeHead",required:true},
  academicSession:{type:mongoose.Schema.Types.ObjectId,ref:"AcademicSession",required:true},
  amount:{type:Number,required:true,min:0},
  discount:{type:Number,default:0,min:0},
  netAmount:{type:Number,required:true,min:0},
  paidAmount:{type:Number,default:0,min:0},
  balance:{type:Number,default:0,min:0},
  dueDate:{type:Date,default:null},
  status:{type:String,enum:["PENDING","PARTIAL","PAID","OVERDUE"],default:"PENDING"},
  remarks:{type:String,default:"",trim:true}
},{timestamps:true});
feeInvoiceSchema.index({student:1,academicSession:1,feeHead:1},{unique:true});
export default mongoose.model("FeeInvoice",feeInvoiceSchema);
