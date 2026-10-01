import mongoose from "mongoose";

const feePaymentSchema = new mongoose.Schema({
  receiptNo:{type:String,required:true,unique:true,trim:true},
  invoice:{type:mongoose.Schema.Types.ObjectId,ref:"FeeInvoice",required:true},
  student:{type:mongoose.Schema.Types.ObjectId,ref:"Student",required:true},
  amount:{type:Number,required:true,min:0.01},
  paymentDate:{type:Date,default:Date.now},
  mode:{type:String,enum:["CASH","UPI","CARD","BANK_TRANSFER","CHEQUE"],default:"CASH"},
  reference:{type:String,default:"",trim:true},
  remarks:{type:String,default:"",trim:true},
  collectedBy:{type:mongoose.Schema.Types.ObjectId,ref:"User",default:null},
  collectedByName:{type:String,default:"",trim:true}
},{timestamps:true});
feePaymentSchema.index({student:1,paymentDate:-1});
export default mongoose.model("FeePayment",feePaymentSchema);
