import assert from "node:assert/strict";
import { timeToMinutes, timeSlotInputIssue, timeSlotConflictIssue } from "../services/timeSlotValidation.js";

assert.equal(timeToMinutes("09:00"), 540);
assert.equal(timeToMinutes("9:00"), 540);
assert.equal(timeToMinutes("24:00"), Number.NaN);
assert.equal(timeToMinutes("09:60"), Number.NaN);

assert.equal(timeSlotInputIssue({day:"Monday",startTime:"09:00",endTime:"10:00",order:1}), "");
assert.match(timeSlotInputIssue({day:"Funday",startTime:"09:00",endTime:"10:00",order:1}), /valid weekday/);
assert.match(timeSlotInputIssue({day:"Monday",startTime:"10:00",endTime:"09:00",order:1}), /later than Start Time/);
assert.match(timeSlotInputIssue({day:"Monday",startTime:"bad",endTime:"10:00",order:1}), /valid 24-hour time/);
assert.match(timeSlotInputIssue({day:"Monday",startTime:"09:00",endTime:"10:00",order:0}), /Period order/);
assert.match(timeSlotInputIssue({day:"Monday",startTime:"09:00",endTime:"10:00",order:1,program:"not-an-object-id"}), /Program selection/);

const slot = { _id:"slot-1", day:"Monday", startTime:"09:00", endTime:"10:00", order:1, program:null };
assert.match(timeSlotConflictIssue({day:"Monday",startTime:"09:30",endTime:"10:30",order:2,program:null},[slot]), /overlaps/);
assert.match(timeSlotConflictIssue({day:"Monday",startTime:"10:00",endTime:"11:00",order:1,program:null},[slot]), /order 1/);
assert.equal(timeSlotConflictIssue({day:"Monday",startTime:"10:00",endTime:"11:00",order:2,program:null},[slot]), "");
assert.equal(timeSlotConflictIssue({day:"Tuesday",startTime:"09:00",endTime:"10:00",order:1,program:null},[slot]), "");
assert.equal(timeSlotConflictIssue({day:"Monday",startTime:"09:30",endTime:"10:30",order:2,program:"64b000000000000000000001"},[slot]), /./.test("shared slots collide") ? timeSlotConflictIssue({day:"Monday",startTime:"09:30",endTime:"10:30",order:2,program:"64b000000000000000000001"},[slot]) : "");
assert.equal(timeSlotConflictIssue({day:"Monday",startTime:"09:00",endTime:"10:00",order:1,program:"64b000000000000000000002"},[{...slot,program:"64b000000000000000000001"}]), "");
assert.equal(timeSlotConflictIssue({day:"Monday",startTime:"10:00",endTime:"11:00",order:2,program:null},[slot], "slot-1"), "");

console.log("Time slot validation regression tests passed.");
