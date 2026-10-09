import express from "express";
import Student from "../models/Student.js";
import Section from "../models/Section.js";
import AcademicSession from "../models/AcademicSession.js";
import StudentPromotion from "../models/StudentPromotion.js";

const router = express.Router();
const allowRoles = (...roles) => (req,res,next) => roles.includes(req.user?.role) ? next() : res.status(403).json({message:"You are not authorized for this action."});

function sectionLabel(s){
  return [s?.program || s?.programId?.name || "", s?.semester || "", s?.name || ""].filter(Boolean).join(" · ");
}
function sessionIdOfSection(s){ return s?.academicSession ? String(s.academicSession) : ""; }
function sourceSessionIdOfStudent(section){ return sessionIdOfSection(section); }
function normalizeIds(ids){ return [...new Set((Array.isArray(ids)?ids:[]).map(String).filter(Boolean))]; }

router.get("/history", allowRoles("ADMIN","SCHEDULER"), async (req,res)=>{
  try{
    const filter={};
    if(req.query.sessionId) filter.academicSession=req.query.sessionId;
    if(req.query.studentId) filter.student=req.query.studentId;
    if(req.query.status) filter.status=req.query.status;
    const limit=Math.min(Math.max(Number(req.query.limit||100),1),500);
    const rows=await StudentPromotion.find(filter)
      .sort({createdAt:-1}).limit(limit)
      .populate("student","admissionNo rollNo name active section")
      .populate("fromSection","name program programId semester academicSession")
      .populate("toSection","name program programId semester academicSession")
      .populate("academicSession","name")
      .lean();
    res.json(rows);
  }catch(e){res.status(500).json({message:e.message});}
});

router.post("/preview", allowRoles("ADMIN","SCHEDULER"), async (req,res)=>{
  try{
    const studentIds=normalizeIds(req.body?.studentIds);
    const toSectionId=req.body?.toSection;
    const academicSessionId=req.body?.academicSessionId;
    const sourceAcademicSessionId=req.body?.sourceAcademicSessionId||"";
    const action=req.body?.action||"PROMOTED";
    if(!studentIds.length) return res.status(400).json({message:"Select at least one student."});
    if(!toSectionId||!academicSessionId) return res.status(400).json({message:"Target section and academic session are required."});
    if(!["PROMOTED","TRANSFERRED"].includes(action)) return res.status(400).json({message:"Invalid promotion action."});

    const [target,session,sourceSession,students]=await Promise.all([
      Section.findById(toSectionId).populate("programId","name code").lean(),
      AcademicSession.findById(academicSessionId).lean(),
      sourceAcademicSessionId ? AcademicSession.findById(sourceAcademicSessionId).lean() : Promise.resolve(null),
      Student.find({_id:{$in:studentIds},active:true}).populate("section").lean()
    ]);
    if(!target) return res.status(404).json({message:"Target section not found."});
    if(!session) return res.status(404).json({message:"Target academic session not found."});
    if(sourceAcademicSessionId && !sourceSession) return res.status(404).json({message:"Source academic session not found."});
    if(!students.length) return res.status(400).json({message:"No active students found for promotion."});

    const currentCount=await Student.countDocuments({section:target._id,active:true,$and:[{_id:{$nin:studentIds}}]});
    const capacity=Number(target.capacity||target.maxStudents||0);
    const available=capacity>0?Math.max(capacity-currentCount,0):null;
    const issues=[];
    const warnings=[];
    const details=students.map(s=>{
      const from=s.section;
      const same=String(from?._id||"")===String(target._id);
      const fromSessionId=sessionIdOfSection(from);
      const targetSessionId=sessionIdOfSection(target);
      if(same) warnings.push(`${s.name} is already in ${sectionLabel(target)}.`);
      if(fromSessionId && targetSessionId && fromSessionId===targetSessionId && action==="PROMOTED") warnings.push(`${s.name}: promotion is within the same academic session; use Transfer if this is intentional.`);
      if(targetSessionId && targetSessionId!==String(session._id)) issues.push(`${s.name}: target section belongs to a different academic session than the selected session.`);
      if(sourceAcademicSessionId && fromSessionId && fromSessionId!==String(sourceSession?._id||"")) issues.push(`${s.name}: source section does not belong to the selected source academic session.`);
      return {studentId:s._id,name:s.name,admissionNo:s.admissionNo,rollNo:s.rollNo,fromSection:from?{_id:from._id,label:sectionLabel(from)}:null,targetSection:{_id:target._id,label:sectionLabel(target)}};
    });
    if(capacity>0 && students.length>available) issues.push(`Target section capacity is ${capacity}; ${currentCount} active student(s) are already enrolled, leaving room for ${available}.`);
    if(action==="PROMOTED"){
      const sourceSessions=[...new Set(students.map(s=>sessionIdOfSection(s.section)).filter(Boolean))];
      if(sourceSessions.length===1 && sourceSessions[0]===String(session._id)) warnings.push("The selected students are already in the selected academic session. This operation is safer as a section transfer unless the section hierarchy is intentionally being corrected.");
    }
    res.json({ok:issues.length===0,action,session:{_id:session._id,name:session.name},target:{_id:target._id,label:sectionLabel(target),capacity,activeCount:currentCount,available},students:details,issues,warnings,summary:{selected:studentIds.length,valid:students.length,capacity,available}});
  }catch(e){res.status(400).json({message:e.message});}
});

router.post("/bulk", allowRoles("ADMIN","SCHEDULER"), async (req,res)=>{
  try{
    const studentIds=normalizeIds(req.body?.studentIds);
    const toSection=req.body?.toSection;
    const academicSessionId=req.body?.academicSessionId;
    const sourceAcademicSessionId=req.body?.sourceAcademicSessionId||"";
    const action=req.body?.action||"PROMOTED";
    const remarks=String(req.body?.remarks||"").trim();
    if(!studentIds.length) return res.status(400).json({message:"Select at least one student."});
    if(!toSection||!academicSessionId) return res.status(400).json({message:"Target section and academic session are required."});
    if(!["PROMOTED","TRANSFERRED"].includes(action)) return res.status(400).json({message:"Invalid promotion action."});

    const [target,session,sourceSession,students]=await Promise.all([
      Section.findById(toSection).populate("programId","name code").lean(),
      AcademicSession.findById(academicSessionId).lean(),
      sourceAcademicSessionId ? AcademicSession.findById(sourceAcademicSessionId).lean() : Promise.resolve(null),
      Student.find({_id:{$in:studentIds},active:true}).populate("section").lean()
    ]);
    if(!target) return res.status(404).json({message:"Target section not found."});
    if(!session) return res.status(404).json({message:"Target academic session not found."});
    if(sourceAcademicSessionId && !sourceSession) return res.status(404).json({message:"Source academic session not found."});
    if(!students.length) return res.status(400).json({message:"No active students found for promotion."});
    if(sourceAcademicSessionId){
      const invalidSource=students.find(s=>sessionIdOfSection(s.section)!==String(sourceAcademicSessionId));
      if(invalidSource) return res.status(400).json({message:`${invalidSource.name} is not enrolled in the selected source academic session.`});
    }
    if(target.academicSession && String(target.academicSession)!==String(session._id)) return res.status(400).json({message:"Target section does not belong to the selected academic session."});

    const movingIds=students.filter(s=>String(s.section?._id||"")!==String(target._id)).map(s=>s._id);
    const capacity=Number(target.capacity||target.maxStudents||0);
    if(capacity>0){
      const currentCount=await Student.countDocuments({section:target._id,active:true,_id:{$nin:movingIds}});
      if(currentCount+movingIds.length>capacity) return res.status(400).json({message:`Target section capacity exceeded. Capacity ${capacity}; current ${currentCount}; requested ${movingIds.length}.`});
    }

    const operations=[]; const history=[];
    for(const s of students){
      const from = s.section?._id ?? null;
      if(String(from||"")===String(target._id)) continue;
      operations.push({updateOne:{filter:{_id:s._id,active:true},update:{$set:{section:target._id,program:target.program||target.programId?.name||"",semester:target.semester||""}}}});
      history.push({academicSession:session._id,sourceAcademicSession:sourceSession?._id||null,student:s._id,fromSection:from,toSection:target._id,action,remarks,changedBy:req.user.id,changedByName:req.user.name||req.user.username||"",status:"COMPLETED"});
    }
    if(operations.length) await Student.bulkWrite(operations);
    if(history.length) await StudentPromotion.insertMany(history);
    res.json({ok:true,updated:operations.length,skipped:students.length-operations.length,message:`${operations.length} student(s) ${action==="PROMOTED"?"promoted":"transferred"} successfully.`,historyCount:history.length});
  }catch(e){res.status(400).json({message:e.message});}
});

router.post("/rollback/:id", allowRoles("ADMIN"), async (req,res)=>{
  try{
    const history=await StudentPromotion.findById(req.params.id).lean();
    if(!history) return res.status(404).json({message:"Movement record not found."});
    if(history.status==="ROLLED_BACK") return res.status(400).json({message:"This movement has already been rolled back."});
    const student=await Student.findById(history.student).lean();
    if(!student) return res.status(404).json({message:"Student no longer exists."});
    if(String(student.section)!==String(history.toSection)) return res.status(409).json({message:"Rollback blocked because the student's current section has changed since this movement."});
    const from=await Section.findById(history.fromSection).populate("programId","name code").lean();
    if(!from) return res.status(409).json({message:"Original section no longer exists; rollback cannot be completed."});
    await Student.updateOne({_id:student._id},{$set:{section:from._id,program:from.program||from.programId?.name||"",semester:from.semester||""}});
    await StudentPromotion.updateOne({_id:history._id},{$set:{status:"ROLLED_BACK",rolledBackAt:new Date(),rolledBackBy:req.user.id}});
    res.json({ok:true,message:`${student.name} was restored to ${sectionLabel(from)}.`});
  }catch(e){res.status(400).json({message:e.message});}
});

export default router;
