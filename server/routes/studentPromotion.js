import express from "express";
import Student from "../models/Student.js";
import Section from "../models/Section.js";
import AcademicSession from "../models/AcademicSession.js";
import StudentPromotion from "../models/StudentPromotion.js";

const router = express.Router();
const allowRoles = (...roles) => (req,res,next) => roles.includes(req.user?.role) ? next() : res.status(403).json({message:"You are not authorized for this action."});

router.get("/history", allowRoles("ADMIN","SCHEDULER"), async (req,res)=>{
  try{
    const filter={};
    if(req.query.sessionId) filter.academicSession=req.query.sessionId;
    const rows=await StudentPromotion.find(filter)
      .sort({createdAt:-1}).limit(300)
      .populate("student","admissionNo rollNo name")
      .populate("fromSection","name program semester")
      .populate("toSection","name program semester")
      .populate("academicSession","name")
      .lean();
    res.json(rows);
  }catch(e){res.status(500).json({message:e.message});}
});

router.post("/bulk", allowRoles("ADMIN","SCHEDULER"), async (req,res)=>{
  try{
    const {studentIds=[], toSection, academicSessionId, action="PROMOTED", remarks=""}=req.body||{};
    if(!Array.isArray(studentIds)||!studentIds.length) return res.status(400).json({message:"Select at least one student."});
    if(!toSection||!academicSessionId) return res.status(400).json({message:"Target section and academic session are required."});
    if(!["PROMOTED","TRANSFERRED"].includes(action)) return res.status(400).json({message:"Invalid promotion action."});
    const [target,session,students]=await Promise.all([
      Section.findById(toSection).lean(),
      AcademicSession.findById(academicSessionId).lean(),
      Student.find({_id:{$in:studentIds},active:true}).lean()
    ]);
    if(!target) return res.status(404).json({message:"Target section not found."});
    if(!session) return res.status(404).json({message:"Academic session not found."});
    if(!students.length) return res.status(400).json({message:"No active students found for promotion."});
    const operations=[];
    const history=[];
    for(const s of students){
      const from=String(s.section||"");
      if(from===String(target._id)) continue;
      operations.push({updateOne:{filter:{_id:s._id},update:{$set:{section:target._id}}}});
      history.push({academicSession:session._id,student:s._id,fromSection:s.section,toSection:target._id,action,remarks,changedBy:req.user.id,changedByName:req.user.name||req.user.username||""});
    }
    if(operations.length) await Student.bulkWrite(operations);
    if(history.length) await StudentPromotion.insertMany(history);
    res.json({ok:true,updated:operations.length,skipped:students.length-operations.length,message:`${operations.length} student(s) ${action==="PROMOTED"?"promoted":"transferred"} successfully.`});
  }catch(e){res.status(400).json({message:e.message});}
});

export default router;
