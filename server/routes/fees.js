import express from "express";
import FeeHead from "../models/FeeHead.js";
import FeeInvoice from "../models/FeeInvoice.js";
import FeePayment from "../models/FeePayment.js";
import Student from "../models/Student.js";
import Section from "../models/Section.js";
import AcademicSession from "../models/AcademicSession.js";

const router=express.Router();
const adminScheduler=(req,res,next)=>["ADMIN","SCHEDULER"].includes(req.user?.role)?next():res.status(403).json({message:"You are not authorized for fee management."});
const canRead=(req,res,next)=>["ADMIN","SCHEDULER","VIEWER"].includes(req.user?.role)?next():res.status(403).json({message:"You are not authorized to view fee records."});
function invoiceStatus(inv){
  if(inv.paidAmount>=inv.netAmount)return "PAID";
  if(inv.dueDate && new Date(inv.dueDate)<new Date() && inv.paidAmount<inv.netAmount)return "OVERDUE";
  if(inv.paidAmount>0)return "PARTIAL";
  return "PENDING";
}
function makeNo(prefix="INV"){return `${prefix}-${Date.now()}-${Math.floor(Math.random()*900+100)}`}

router.get("/heads",canRead,async(req,res)=>{
  try{res.json(await FeeHead.find().sort({program:1,semester:1,name:1}).lean())}catch(e){res.status(500).json({message:e.message})}
});
router.post("/heads",adminScheduler,async(req,res)=>{
  try{
    const {name,code,program="",semester="",amount,frequency="SEMESTER",dueDate=null,active=true,description=""}=req.body||{};
    if(!name||!code||amount===undefined||Number(amount)<0)return res.status(400).json({message:"Name, code and a valid amount are required."});
    const row=await FeeHead.create({name,code,program,semester,amount:Number(amount),frequency,dueDate:dueDate||null,active,description});res.status(201).json(row);
  }catch(e){res.status(400).json({message:e.code===11000?"Fee head code must be unique.":e.message})}
});
router.put("/heads/:id",adminScheduler,async(req,res)=>{
  try{const body={...req.body};delete body._id;delete body.createdAt;delete body.updatedAt; if(body.amount!==undefined)body.amount=Number(body.amount);const row=await FeeHead.findByIdAndUpdate(req.params.id,body,{new:true,runValidators:true});if(!row)return res.status(404).json({message:"Fee head not found."});res.json(row)}catch(e){res.status(400).json({message:e.code===11000?"Fee head code must be unique.":e.message})}
});
router.delete("/heads/:id",adminScheduler,async(req,res)=>{try{const row=await FeeHead.findByIdAndUpdate(req.params.id,{active:false},{new:true});if(!row)return res.status(404).json({message:"Fee head not found."});res.json({message:"Fee head marked inactive.",row})}catch(e){res.status(400).json({message:e.message})}});

router.get("/invoices",canRead,async(req,res)=>{
  try{
    const filter={};
    if(req.query.studentId)filter.student=req.query.studentId;
    if(req.query.sectionId){const ids=await Student.find({section:req.query.sectionId}).distinct("_id");filter.student={$in:ids};}
    if(req.query.sessionId)filter.academicSession=req.query.sessionId;
    if(req.query.status)filter.status=req.query.status;
    if(req.user.role==="VIEWER")filter.student={$in:await Student.find({section:req.user.section||null}).distinct("_id")};
    const rows=await FeeInvoice.find(filter).sort({createdAt:-1}).populate("student","admissionNo rollNo name section").populate("feeHead","name code").populate("academicSession","name").lean();
    res.json(rows);
  }catch(e){res.status(500).json({message:e.message})}
});

router.post("/invoices/generate",adminScheduler,async(req,res)=>{
  try{
    const {sessionId,sectionId,feeHeadId}=req.body||{};
    if(!sessionId||!sectionId||!feeHeadId)return res.status(400).json({message:"Academic Session, Section and Fee Head are required."});
    const [session,section,head,students]=await Promise.all([AcademicSession.findById(sessionId).lean(),Section.findById(sectionId).lean(),FeeHead.findById(feeHeadId).lean(),Student.find({section:sectionId,active:true}).sort({rollNo:1}).lean()]);
    if(!session||!section||!head)return res.status(404).json({message:"Session, section or fee head not found."});
    if(head.program && String(head.program).toUpperCase()!==String(section.program||"").toUpperCase())return res.status(400).json({message:`Fee head ${head.name} is mapped to program ${head.program}, but the selected section belongs to ${section.program}.`});
    if(head.semester && String(head.semester).toUpperCase()!==String(section.semester||"").toUpperCase())return res.status(400).json({message:`Fee head ${head.name} is mapped to semester ${head.semester}, but the selected section is semester ${section.semester}.`});
    if(!students.length)return res.status(400).json({message:"No active students found in the selected section."});
    let created=0,existing=0;const docs=[];
    for(const s of students){
      const exists=await FeeInvoice.exists({student:s._id,academicSession:sessionId,feeHead:feeHeadId});
      if(exists){existing++;continue;}
      const amount=Number(head.amount||0), due=head.dueDate||null;
      docs.push({invoiceNo:makeNo("INV"),student:s._id,feeHead:feeHeadId,academicSession:sessionId,amount,discount:0,netAmount:amount,paidAmount:0,balance:amount,dueDate:due,status:due&&new Date(due)<new Date()?"OVERDUE":"PENDING"});
    }
    if(docs.length){await FeeInvoice.insertMany(docs,{ordered:false});created=docs.length;}
    res.status(201).json({message:`Generated ${created} invoice(s); ${existing} already existed.`,created,existing});
  }catch(e){res.status(400).json({message:e.message})}
});

router.post("/invoices/:id/discount",adminScheduler,async(req,res)=>{
  try{const invoice=await FeeInvoice.findById(req.params.id);if(!invoice)return res.status(404).json({message:"Invoice not found."});const discount=Number(req.body?.discount||0);if(discount<0||discount>invoice.amount)return res.status(400).json({message:"Invalid discount."});if(invoice.paidAmount>invoice.amount-discount)return res.status(400).json({message:"Discount cannot reduce the balance below the amount already paid."});invoice.discount=discount;invoice.netAmount=invoice.amount-discount;invoice.balance=Math.max(0,invoice.netAmount-invoice.paidAmount);invoice.status=invoiceStatus(invoice);await invoice.save();res.json(invoice)}catch(e){res.status(400).json({message:e.message})}
});

router.post("/payments",adminScheduler,async(req,res)=>{
  try{
    const {invoiceId,amount,mode="CASH",reference="",remarks="",paymentDate}=req.body||{};
    const invoice=await FeeInvoice.findById(invoiceId).populate("student","name admissionNo rollNo");if(!invoice)return res.status(404).json({message:"Invoice not found."});
    const paid=Number(amount);if(!Number.isFinite(paid)||paid<=0)return res.status(400).json({message:"Enter a valid payment amount."});
    if(paid>invoice.balance)return res.status(400).json({message:`Payment exceeds outstanding balance of ${invoice.balance.toFixed(2)}.`});
    const receiptNo=makeNo("REC");
    const payment=await FeePayment.create({receiptNo,invoice:invoice._id,student:invoice.student._id,amount:paid,paymentDate:paymentDate||new Date(),mode,reference,remarks,collectedBy:req.user.id,collectedByName:req.user.name||req.user.username||""});
    invoice.paidAmount+=paid;invoice.balance=Math.max(0,invoice.netAmount-invoice.paidAmount);invoice.status=invoiceStatus(invoice);await invoice.save();
    res.status(201).json({message:`Payment collected. Receipt ${receiptNo}.`,payment,invoice});
  }catch(e){res.status(400).json({message:e.message})}
});
router.get("/payments",canRead,async(req,res)=>{try{const filter={};if(req.query.studentId)filter.student=req.query.studentId;if(req.user.role==="VIEWER")filter.student={$in:await Student.find({section:req.user.section||null}).distinct("_id")};const rows=await FeePayment.find(filter).sort({paymentDate:-1}).populate("student","admissionNo rollNo name").populate("invoice","invoiceNo").lean();res.json(rows)}catch(e){res.status(500).json({message:e.message})}});

router.get("/reports",canRead,async(req,res)=>{
  try{
    const filter={};if(req.query.sessionId)filter.academicSession=req.query.sessionId;if(req.query.sectionId){const ids=await Student.find({section:req.query.sectionId}).distinct("_id");filter.student={$in:ids};}
    if(req.user.role==="VIEWER")filter.student={$in:await Student.find({section:req.user.section||null}).distinct("_id")};
    const [invoices,payments]=await Promise.all([FeeInvoice.find(filter).populate("student","admissionNo rollNo name section").populate("feeHead","name code").lean(),FeePayment.find(req.user.role==="VIEWER"?{student:{$in:await Student.find({section:req.user.section||null}).distinct("_id")}}:{}).lean()]);
    const total=invoices.reduce((n,x)=>n+Number(x.netAmount||0),0),paid=invoices.reduce((n,x)=>n+Number(x.paidAmount||0),0),balance=Math.max(0,total-paid);
    res.json({summary:{invoices:invoices.length,total,paid,balance,overdue:invoices.filter(x=>invoiceStatus(x)==="OVERDUE").length},invoices,payments});
  }catch(e){res.status(500).json({message:e.message})}
});

export default router;
