import assert from "node:assert/strict";
import { resolveProgramCalendar, timeSlotMatchesSection, sectionProgramId, resolveTimeSlotsForSection } from "../services/timetable/academicCalendar.js";
import { validateTimetable } from "../services/timetable/validator.js";

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


const globalDefault = [
  { _id:"global-1", day:"Monday", startTime:"10:30", endTime:"11:30", order:1 },
  { _id:"global-2", day:"Tuesday", startTime:"10:30", endTime:"11:30", order:1 }
];
const scopedEnt = [
  ...globalDefault,
  { _id:"ent-i-1", academicSession:sessionId, program:programEnt._id, semester:"Semester I", day:"Monday", startTime:"09:00", endTime:"10:15", order:1 },
  { _id:"ent-i-2", academicSession:sessionId, program:programEnt._id, semester:"Semester I", day:"Tuesday", startTime:"09:00", endTime:"10:15", order:1 },
  { _id:"ent-iii-1", academicSession:sessionId, program:programEnt._id, semester:"Semester III", day:"Monday", startTime:"09:30", endTime:"10:45", order:1 }
];
assert.deepEqual(
  resolveTimeSlotsForSection(scopedEnt,entSem1,programs,sessionId).map(x=>x._id),
  ["ent-i-1","ent-i-2"]
);
assert.deepEqual(
  resolveTimeSlotsForSection(scopedEnt,entSem3,programs,sessionId).map(x=>x._id),
  ["ent-iii-1"]
);
assert.deepEqual(
  resolveTimeSlotsForSection(globalDefault,comSem1,programs,sessionId).map(x=>x._id),
  ["global-1","global-2"]
);
assert.deepEqual(
  resolveTimeSlotsForSection([
    ...globalDefault,
    { _id:"session-wide",academicSession:sessionId,day:"Wednesday",startTime:"08:00",endTime:"09:00",order:1 }
  ],comSem1,programs,sessionId).map(x=>x._id),
  ["session-wide"]
);


const faculty = [{_id:"faculty-shared",name:"Shared Faculty",availableDays:["Monday"],maxWorkingDays:5,maxClassesPerDay:4}];
const rooms = [{_id:"room-ent",name:"ENT Room",type:"Classroom",capacity:60},{_id:"room-com",name:"COM Room",type:"Classroom",capacity:60}];
const subjects = [
  {_id:"subject-ent",name:"ENT Subject",code:"ENT101",faculty:"faculty-shared",section:entSem1._id,roomType:"Classroom"},
  {_id:"subject-com",name:"COM Subject",code:"COM101",faculty:"faculty-shared",section:comSem1._id,roomType:"Classroom"}
];
const clockSlots = [
  {academicSession:sessionId,program:programEnt._id,semester:"Semester I",day:"Monday",startTime:"09:00",endTime:"10:15",order:1},
  {academicSession:sessionId,program:programCom._id,semester:"Semester I",day:"Monday",startTime:"10:30",endTime:"11:45",order:1}
];
const clockEntries = [
  {day:"Monday",startTime:"09:00",endTime:"10:15",order:1,duration:1,section:entSem1._id,subject:"subject-ent",faculty:"faculty-shared",room:"room-ent"},
  {day:"Monday",startTime:"10:30",endTime:"11:45",order:1,duration:1,section:comSem1._id,subject:"subject-com",faculty:"faculty-shared",room:"room-com"}
];
const clockValidation = validateTimetable({
  entries:clockEntries,faculty,sections:[entSem1,comSem1],subjects,rooms,slots:clockSlots,programs,
  settings:{maxConsecutiveFaculty:1,maxConsecutiveSection:3,avoidSameSubjectSameDay:false},
  academicSessionId:sessionId,holidayDays:["Sunday"]
});
assert.ok(clockValidation.errors.some(error=>error.includes("Faculty Shared Faculty exceeds consecutive-class limit.")),
  "Consecutive classes must be checked by real clock intervals even when period order is local to each program.");

console.log("Program-semester calendar and time-slot scope regression tests passed.");
