import assert from "node:assert/strict";
import { timeToMinutes, timeSlotInputIssue, timeSlotConflictIssue } from "../services/timeSlotValidation.js";

assert.equal(timeToMinutes("09:00"), 540);
assert.equal(timeToMinutes("9:00"), 540);
assert.ok(Number.isNaN(timeToMinutes("24:00")));
assert.ok(Number.isNaN(timeToMinutes("09:60")));

assert.equal(timeSlotInputIssue({day:"Monday",startTime:"09:00",endTime:"10:00",order:1}), "");
assert.match(timeSlotInputIssue({day:"Funday",startTime:"09:00",endTime:"10:00",order:1}), /valid weekday/);
assert.match(timeSlotInputIssue({day:"Monday",startTime:"10:00",endTime:"09:00",order:1}), /later than Start Time/);
assert.match(timeSlotInputIssue({day:"Monday",startTime:"bad",endTime:"10:00",order:1}), /valid 24-hour time/);
assert.match(timeSlotInputIssue({day:"Monday",startTime:"09:00",endTime:"10:00",order:0}), /Period order/);
assert.match(timeSlotInputIssue({day:"Monday",startTime:"09:00",endTime:"10:00",order:1,program:"not-an-object-id"}), /Program selection/);

const programA = "64b000000000000000000001";
const programB = "64b000000000000000000002";
const shared = { _id:"slot-1", day:"Monday", startTime:"09:00", endTime:"10:00", order:1, program:null };
const programSpecific = {...shared, _id:"slot-2", program:programA};

assert.match(timeSlotConflictIssue({day:"Monday",startTime:"09:30",endTime:"10:30",order:2,program:null},[shared]), /overlaps/);
assert.match(timeSlotConflictIssue({day:"Monday",startTime:"10:00",endTime:"11:00",order:1,program:null},[shared]), /order 1/);
assert.equal(timeSlotConflictIssue({day:"Monday",startTime:"10:00",endTime:"11:00",order:2,program:null},[shared]), "");
assert.equal(timeSlotConflictIssue({day:"Tuesday",startTime:"09:00",endTime:"10:00",order:1,program:null},[shared]), "");
assert.match(timeSlotConflictIssue({day:"Monday",startTime:"09:30",endTime:"10:30",order:2,program:programA},[shared]), /overlaps/);
assert.equal(timeSlotConflictIssue({day:"Monday",startTime:"09:00",endTime:"10:00",order:1,program:programB},[programSpecific]), "");
assert.match(timeSlotConflictIssue({day:"Monday",startTime:"10:00",endTime:"11:00",order:1,program:programA},[programSpecific]), /order 1/);
assert.equal(timeSlotConflictIssue({day:"Monday",startTime:"10:00",endTime:"11:00",order:2,program:null},[shared],"slot-1"), "");

console.log("Time slot validation regression tests passed.");
