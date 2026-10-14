import assert from "node:assert/strict";
import { resolveProgramCalendar, timeSlotMatchesSection, sectionProgramId } from "../services/timetable/academicCalendar.js";

const sessionId = "64b000000000000000000010";
const programEnt = {_id:"64b000000000000000000001",name:"BBA ENT",code:"ENT"};
const programCom = {_id:"64b000000000000000000002",name:"BBA COM",code:"COM"};
const programIm = {_id:"64b000000000000000000003",name:"BBA IM",code:"IM"};
const programs = [programEnt,programCom,programIm];
const entSem1 = {_id:"section-ent-1",academicSession:sessionId,programId:programEnt._id,program:programEnt.name,semester:"Semester I",name:"A"};
const entSem3 = {_id:"section-ent-3",academicSession:sessionId,programId:programEnt._id,program:programEnt.name,semester:"Semester III",name:"A"};
const comSem1 = {_id:"section-com-1",academicSession:sessionId,programId:programCom._id,program:programCom.name,semester:"Semester I",name:"A"};

const dates = [
  {program:programEnt._id,semester:"",startDate:"2026-07-01",endDate:"2027-06-30"},
  {program:programEnt._id,semester:"Semester I",startDate:"2026-07-15",endDate:"2026-12-15"},
  {program:programEnt._id,semester:"Semester III",startDate:"2027-01-01",endDate:"2027-06-30"},
  {program:programCom._id,semester:"Semester I",startDate:"2026-08-01",endDate:"2026-12-20"}
];
assert.equal(resolveProgramCalendar(dates,entSem1,programs).startDate,"2026-07-15");
assert.equal(resolveProgramCalendar(dates,entSem3,programs).startDate,"2027-01-01");
assert.equal(resolveProgramCalendar(dates,comSem1,programs).startDate,"2026-08-01");
assert.equal(resolveProgramCalendar([{program:programIm._id,semester:"Semester V",startDate:"2027-01-01",endDate:"2027-06-30"}],{...entSem3,programId:programIm._id},programs),null);
assert.equal(sectionProgramId(entSem1,programs),programEnt._id);

const slotEnt = {academicSession:sessionId,program:programEnt._id,semester:"Semester I",day:"Monday",startTime:"09:00",endTime:"10:00",order:1};
const slotCom = {academicSession:sessionId,program:programCom._id,semester:"Semester I",day:"Monday",startTime:"09:30",endTime:"10:30",order:1};
const slotEntSem3 = {academicSession:sessionId,program:programEnt._id,semester:"Semester III",day:"Monday",startTime:"09:30",endTime:"10:30",order:1};
const legacyShared = {day:"Monday",startTime:"10:00",endTime:"11:00",order:2};
assert.equal(timeSlotMatchesSection(slotEnt,entSem1,programs,sessionId),true);
assert.equal(timeSlotMatchesSection(slotEnt,comSem1,programs,sessionId),false);
assert.equal(timeSlotMatchesSection(slotCom,comSem1,programs,sessionId),true);
assert.equal(timeSlotMatchesSection(slotEnt,entSem3,programs,sessionId),false);
assert.equal(timeSlotMatchesSection(slotEntSem3,entSem3,programs,sessionId),true);
assert.equal(timeSlotMatchesSection({...slotEnt,academicSession:"64b000000000000000000011"},entSem1,programs,sessionId),false);
assert.equal(timeSlotMatchesSection(legacyShared,entSem1,programs,sessionId),true);

console.log("Program-semester calendar and time-slot scope regression tests passed.");
