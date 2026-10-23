import assert from "node:assert/strict";
import { timeToMinutes, timeSlotInputIssue, timeSlotConflictIssue, timeSlotBatchInputIssue } from "../services/timeSlotValidation.js";

const sessionA = "64b000000000000000000010";
const sessionB = "64b000000000000000000011";
const programA = "64b000000000000000000001";
const programB = "64b000000000000000000002";

assert.equal(timeToMinutes("09:00"), 540);
assert.equal(timeToMinutes("9:00"), 540);
assert.ok(Number.isNaN(timeToMinutes("24:00")));
assert.ok(Number.isNaN(timeToMinutes("09:60")));

assert.equal(timeSlotInputIssue({day:"Monday",startTime:"09:00",endTime:"10:00",order:1}), "");
assert.match(timeSlotInputIssue({day:"Funday",startTime:"09:00",endTime:"10:00",order:1}), /valid weekday/);
assert.match(timeSlotInputIssue({day:"Monday",startTime:"10:00",endTime:"09:00",order:1}), /later than Start Time/);
assert.match(timeSlotInputIssue({day:"Monday",startTime:"bad",endTime:"10:00",order:1}), /valid 24-hour time/);
assert.match(timeSlotInputIssue({day:"Monday",startTime:"09:00",endTime:"10:00",order:0}), /Period order/);
assert.match(timeSlotInputIssue({day:"Monday",startTime:"09:00",endTime:"10:00",order:1,program:"bad"}), /Program selection/);
assert.match(timeSlotInputIssue({day:"Monday",startTime:"09:00",endTime:"10:00",order:1,academicSession:"bad"}), /Academic session selection/);
assert.match(timeSlotInputIssue({day:"Monday",startTime:"09:00",endTime:"10:00",order:1,semester:"Semester I"}), /Select a Program/);

const shared = { _id:"slot-1", day:"Monday", startTime:"09:00", endTime:"10:00", order:1, academicSession:null, program:null, semester:"" };
const ent = {...shared, _id:"slot-ent", program:programA, semester:"Semester I"};
const com = {...shared, _id:"slot-com", program:programB, semester:"Semester I", startTime:"09:30", endTime:"10:30"};
const mba = {...shared, _id:"slot-mba", program:programA, semester:"Semester III", startTime:"09:30", endTime:"10:30"};

assert.match(timeSlotConflictIssue({day:"Monday",startTime:"09:30",endTime:"10:30",order:2},[shared]), /overlaps/);
assert.match(timeSlotConflictIssue({day:"Monday",startTime:"10:00",endTime:"11:00",order:1},[shared]), /order 1/);
assert.equal(timeSlotConflictIssue({day:"Monday",startTime:"10:00",endTime:"11:00",order:2},[shared]), "");
assert.equal(timeSlotConflictIssue({day:"Tuesday",startTime:"09:00",endTime:"10:00",order:1},[shared]), "");
assert.match(timeSlotConflictIssue({day:"Monday",startTime:"09:30",endTime:"10:30",order:2,program:programA,semester:"Semester I"},[ent]), /overlaps/);
assert.equal(timeSlotConflictIssue({day:"Monday",startTime:"09:30",endTime:"10:30",order:1,program:programA,semester:"Semester I"},[shared]), "");
assert.match(timeSlotConflictIssue({...ent,startTime:"09:30",endTime:"10:30"},[ent]), /order 1/);
assert.equal(timeSlotConflictIssue({day:"Monday",startTime:"09:30",endTime:"10:30",order:1,program:programB,semester:"Semester I"},[ent]), "");
assert.equal(timeSlotConflictIssue({day:"Monday",startTime:"09:30",endTime:"10:30",order:1,program:programA,semester:"Semester III"},[ent]), "");
assert.equal(timeSlotConflictIssue({day:"Monday",startTime:"09:30",endTime:"10:30",order:2,academicSession:sessionA},[{...shared,academicSession:sessionB}]), "");
assert.equal(timeSlotConflictIssue({day:"Monday",startTime:"09:00",endTime:"10:00",order:1,program:programB},[{...shared,program:programA}], "ignored"), "");
assert.equal(timeSlotConflictIssue({day:"Monday",startTime:"10:00",endTime:"11:00",order:2,program:programA,semester:"Semester I"},[ent], "slot-ent"), "");


const batchBase = { day:"Monday", startTime:"09:00", endTime:"10:00", order:1, academicSession:sessionA, program:programA, semester:"Semester I", isBreak:false };
assert.equal(timeSlotBatchInputIssue([], []), "Add at least one time slot.");
assert.equal(timeSlotBatchInputIssue([{...batchBase}, {...batchBase, day:"Tuesday"}]), "");
assert.match(timeSlotBatchInputIssue([{...batchBase}, {...batchBase}]), /Time slot 2:.*order 1/);
assert.match(timeSlotBatchInputIssue([{...batchBase}, {...batchBase, order:2, startTime:"09:30", endTime:"10:30"}]), /Time slot 2:.*overlaps/);
assert.equal(timeSlotBatchInputIssue([{...batchBase}, {...batchBase, order:2, program:programB, startTime:"09:30", endTime:"10:30"}]), "");
assert.match(timeSlotBatchInputIssue([{...batchBase, day:"Funday"}]), /Time slot 1:.*valid weekday/);
assert.match(timeSlotBatchInputIssue([{...batchBase}], [{...batchBase, _id:"existing-batch-slot"}]), /Time slot 1:.*order 1/);
assert.match(timeSlotBatchInputIssue(Array.from({length:501}, (_,index)=>({...batchBase, order:index+1}))), /at most 500/);

console.log("Time slot validation regression tests passed.");
