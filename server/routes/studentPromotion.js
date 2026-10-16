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
function normalizeRollNo(value){ return String(value??"").trim().toLowerCase(); }

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
    if(studentIds.length>1000) return res.status(400).json({message:"Select no more than 1000 students per operation."});
    if(!toSectionId||!academicSessionId) return res.status(400).json({message:"Target section and academic session are required."});
    if(!["PROMOTED","TRANSFERRED"].includes(action)) return res.status(400).json({message:"Invalid promotion action."});

    const [target,session,sourceSession,students]=await Promise.all([
      Section.findById(toSectionId).populate("programId","name code").lean(),
      AcademicSession.findById(academicSessionId).lean(),
      sourceAcademicSessionId ? AcademicSession.findById(sourceAcademicSessionId).lean() : Promise.resolve(null),
      Student.find({_id:{$in:studentIds}}).populate("section").lean()
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
    if(students.length!==studentIds.length) issues.push("One or more selected student records no longer exist. Refresh the roster before continuing.");
    const inactiveStudent=students.find(s=>s.active===false);
    if(inactiveStudent) issues.push(`${inactiveStudent.name} is inactive and cannot be moved.`);
    const details=students.map(s=>{
      const from=s.section;
      const same=String(from?._id||"")===String(target._id);
      const fromSessionId=sessionIdOfSection(from);
      const targetSessionId=sessionIdOfSection(target);
      if(same) warnings.push(`${s.name} is already in ${sectionLabel(target)}.`);
      if(fromSessionId && targetSessionId && fromSessionId===targetSessionId && action==="PROMOTED") warnings.push(`${s.name}: promotion is within the same academic session; use Transfer if this is intentional.`);
      if(!targetSessionId || targetSessionId!==String(session._id)) issues.push(`${s.name}: target section must belong to the selected academic session.`);
      if(!from?._id) issues.push(`${s.name}: student has no valid current section assignment.`);
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
  let dbSession;
  try{
    const studentIds=normalizeIds(req.body?.studentIds);
    const toSection=req.body?.toSection;
    const academicSessionId=String(req.body?.academicSessionId||"");
    const sourceAcademicSessionId=String(req.body?.sourceAcademicSessionId||"");
    const action=req.body?.action||"PROMOTED";
    const remarks=String(req.body?.remarks||"").trim().slice(0,1000);

    if(!studentIds.length) return res.status(400).json({message:"Select at least one student."});
    if(studentIds.length>1000) return res.status(400).json({message:"Select no more than 1000 students per operation."});
    if(!toSection||!academicSessionId) return res.status(400).json({message:"Target section and academic session are required."});
    if(!["PROMOTED","TRANSFERRED"].includes(action)) return res.status(400).json({message:"Invalid promotion action."});

    const [target,session,sourceSession,allStudents]=await Promise.all([
      Section.findById(toSection).populate("programId","name code").lean(),
      AcademicSession.findById(academicSessionId).lean(),
      sourceAcademicSessionId ? AcademicSession.findById(sourceAcademicSessionId).lean() : Promise.resolve(null),
      Student.find({_id:{$in:studentIds}}).populate("section").lean()
    ]);
    if(!target) return res.status(404).json({message:"Target section not found."});
    if(!session) return res.status(404).json({message:"Target academic session not found."});
    if(sourceAcademicSessionId&&!sourceSession) return res.status(404).json({message:"Source academic session not found."});
    if(allStudents.length!==studentIds.length) return res.status(400).json({message:"One or more selected student records no longer exist. Refresh the list and try again."});
    const inactive=allStudents.find(s=>s.active===false);
    if(inactive) return res.status(400).json({message:`${inactive.name} is inactive and cannot be moved.`});
    if(!target.academicSession || String(target.academicSession)!==String(session._id)) {
      return res.status(400).json({message:"Target section must belong to the selected target academic session."});
    }
    if(sourceAcademicSessionId){
      const invalidSource=allStudents.find(s=>sessionIdOfSection(s.section)!==String(sourceAcademicSessionId));
      if(invalidSource) return res.status(400).json({message:`${invalidSource.name} is not enrolled in the selected source academic session.`});
    }
    const noSource=allStudents.find(s=>!s.section?._id);
    if(noSource) return res.status(400).json({message:`${noSource.name} has no valid current section assignment.`});

    const moving=allStudents.filter(s=>String(s.section?._id||"")!==String(target._id));
    if(moving.length){
      const destinationStudents=await Student.find({
        section:target._id,
        _id:{$nin:moving.map(s=>s._id)}
      }).select("rollNo").lean();
      const destinationRolls=new Set(destinationStudents.map(s=>normalizeRollNo(s.rollNo)));
      for(const student of moving){
        const rollKey=normalizeRollNo(student.rollNo);
        if(rollKey&&destinationRolls.has(rollKey)){
          return res.status(400).json({message:`Roll No ${student.rollNo} already exists in destination section ${target.name}.`});
        }
        if(rollKey)destinationRolls.add(rollKey);
      }
    }
    const capacity=Number(target.capacity||target.maxStudents||0);
    if(capacity>0 && moving.length){
      const currentCount=await Student.countDocuments({section:target._id,active:true,_id:{$nin:moving.map(s=>s._id)}});
      if(currentCount+moving.length>capacity) return res.status(400).json({message:`Target section capacity exceeded. Capacity ${capacity}; current ${currentCount}; requested ${moving.length}.`});
    }
    if(!moving.length) return res.json({ok:true,updated:0,skipped:allStudents.length,message:"All selected students are already assigned to the target section.",historyCount:0});

    // Update student assignments and their audit history as one transaction:
    // neither side should be committed if the other side fails.
    const mongoose = (await import("mongoose")).default;
    dbSession=await mongoose.startSession();
    const program=target.program||target.programId?.name||"";
    const semester=target.semester||"";
    const history=moving.map(s=>({
      academicSession:session._id,
      sourceAcademicSession:sourceSession?._id||null,
      student:s._id,
      fromSection:s.section._id,
      toSection:target._id,
      action,
      remarks,
      changedBy:req.user.id,
      changedByName:req.user.name||req.user.username||"",
      status:"COMPLETED"
    }));
    try {
      await dbSession.withTransaction(async()=>{
        const operations=moving.map(s=>({
          updateOne:{
            filter:{_id:s._id,active:true,section:s.section._id},
            update:{$set:{section:target._id,program,semester}}
          }
        }));
        const result=await Student.bulkWrite(operations,{ordered:true,session:dbSession});
        const updated=result.modifiedCount??result.nModified??0;
        if(updated!==moving.length) throw new Error("Student assignments changed during promotion. No changes were committed; refresh and try again.");
        await StudentPromotion.insertMany(history,{session:dbSession,ordered:true});
      });
    } catch (transactionError) {
      // Local MongoDB installations are often standalone and cannot run transactions.
      // Fall back only for that explicit server limitation, and compensate the
      // student changes if audit-history insertion fails.
      const message=String(transactionError?.message||"");
      const transactionUnsupported=/Transaction numbers are only allowed|replica set member or mongos|does not support retryable writes/i.test(message);
      if(!transactionUnsupported) throw transactionError;

      const operations=moving.map(s=>({
        updateOne:{
          filter:{_id:s._id,active:true,section:s.section._id},
          update:{$set:{section:target._id,program,semester}}
        }
      }));
      const result=await Student.bulkWrite(operations,{ordered:true});
      const updated=result.modifiedCount??result.nModified??0;
      if(updated!==moving.length) throw new Error("Student assignments changed during promotion. Refresh and try again.");
      try {
        await StudentPromotion.insertMany(history,{ordered:true});
      } catch (historyError) {
        const restore=moving.map(s=>({
          updateOne:{
            filter:{_id:s._id,active:true,section:target._id},
            update:{$set:{
              section:s.section._id,
              program:s.section.program||s.section.programId?.name||"",
              semester:s.section.semester||""
            }}
          }
        }));
        await Student.bulkWrite(restore,{ordered:true});
        throw historyError;
      }
    }
    return res.json({ok:true,updated:moving.length,skipped:allStudents.length-moving.length,message:`${moving.length} student(s) ${action==="PROMOTED"?"promoted":"transferred"} successfully.`,historyCount:history.length});
  }catch(e){
    return res.status(400).json({message:e.message});
  }finally{
    if(dbSession) await dbSession.endSession().catch(()=>{});
  }
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
    const destinationRolls=await Student.find({section:from._id,_id:{$ne:student._id}}).select("rollNo").lean();
    if(destinationRolls.some(row=>normalizeRollNo(row.rollNo)===normalizeRollNo(student.rollNo))){
      return res.status(409).json({message:`Rollback blocked because Roll No ${student.rollNo} already exists in the original section.`});
    }
    const capacity=Number(from.capacity||from.maxStudents||0);
    if(capacity>0){
      const currentCount=await Student.countDocuments({section:from._id,active:true,_id:{$ne:student._id}});
      if(currentCount>=capacity) return res.status(409).json({message:`Rollback blocked because the original section is at capacity (${currentCount}/${capacity}).`});
    }
    const moved=await Student.updateOne(
      {_id:student._id,section:history.toSection,active:true},
      {$set:{section:from._id,program:from.program||from.programId?.name||"",semester:from.semester||""}}
    );
    if((moved.modifiedCount??moved.nModified??0)!==1) return res.status(409).json({message:"Student assignment changed during rollback. Refresh and try again."});
    const marked=await StudentPromotion.updateOne(
      {_id:history._id,status:"COMPLETED"},
      {$set:{status:"ROLLED_BACK",rolledBackAt:new Date(),rolledBackBy:req.user.id}}
    );
    if((marked.modifiedCount??marked.nModified??0)!==1){
      await Student.updateOne(
        {_id:student._id,section:from._id,active:true},
        {$set:{section:history.toSection,program:student.program||"",semester:student.semester||""}}
      );
      return res.status(409).json({message:"Movement history changed during rollback. The student assignment was restored; refresh and try again."});
    }
    res.json({ok:true,message:`${student.name} was restored to ${sectionLabel(from)}.`});
  }catch(e){res.status(400).json({message:e.message});}
});

export default router;
