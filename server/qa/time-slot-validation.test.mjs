import assert from "node:assert/strict";
import { timeToMinutes, timeSlotInputIssue, timeSlotConflictIssue } from "../services/timeSlotValidation.js";

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
assert.equal(timeSlotConflictIssue({day:"Monday",startTime:"09:30",endTime:"10:30",order:2,program:programA,semester:"Semester I"},[ent]), /./.test("same scope should conflict") ? timeSlotConflictIssue({day:"Monday",startTime:"09:30",endTime:"10:30",order:2,program:programA,semester:"Semester I"},[ent]) : "");
assert.equal(timeSlotConflictIssue({day:"Monday",startTime:"09:30",endTime:"10:30",order:1,program:programB,semester:"Semester I"},[ent]), "");
assert.equal(timeSlotConflictIssue({day:"Monday",startTime:"09:30",endTime:"10:30",order:1,program:programA,semester:"Semester III"},[ent]), "");
assert.match(timeSlotConflictIssue({day:"Monday",startTime:"09:30",endTime:"10:30",order:2,academicSession:sessionA},[{...shared,academicSession:sessionB}]), /./.test("different academic sessions should not conflict") ? timeSlotConflictIssue({day:"Monday",startTime:"09:30",endTime:"10:30",order:2,academicSession:sessionA},[{...shared,academicSession:sessionB}]) : "");
assert.equal(timeSlotConflictIssue({day:"Monday",startTime:"09:00",endTime:"10:00",order:1,program:programB},[{...shared,program:programA}], "ignored"), "");
assert.equal(timeSlotConflictIssue({day:"Monday",startTime:"10:00",endTime:"11:00",order:2,program:programA,semester:"Semester I"},[ent], "slot-ent"), "");

console.log("Time slot validation regression tests passed.");
