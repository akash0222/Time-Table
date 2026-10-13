import assert from "node:assert/strict";
import { compareTimetableVersions } from "../services/timetableVersionDiff.js";

const section={_id:"section-a",name:"A",program:"MBA",semester:"I"};
const math={_id:"subject-math",name:"Mathematics",code:"MATH"};
const analytics={_id:"subject-analytics",name:"Business Analytics",code:"BA"};
const facultyA={_id:"faculty-a",name:"Ms Faculty"};
const facultyB={_id:"faculty-b",name:"Mr Faculty"};
const roomA={_id:"room-a",name:"Room 101"};
const roomB={_id:"room-b",name:"Room 202"};

function entry(overrides={}) {
  return {
    _id:"entry-1",day:"Monday",startTime:"09:00",endTime:"10:00",order:1,duration:1,
    section,subject:math,faculty:facultyA,room:roomA,
    ...overrides
  };
}
let passed=0;
function check(name,fn) {
  fn();
  passed++;
  console.log("PASS  "+name);
}

check("identical versions report no changes",()=>{
  const result=compareTimetableVersions([entry()],[entry({_id:"entry-copy"})]);
  assert.deepEqual(result.summary,{added:0,removed:0,changed:0,unchanged:1});
  assert.deepEqual(result.changes,[]);
});

check("added class is reported with its destination details",()=>{
  const result=compareTimetableVersions([],[entry()]);
  assert.equal(result.summary.added,1);
  assert.equal(result.changes[0].type,"ADDED");
  assert.equal(result.changes[0].after.room,"Room 101");
});

check("removed class is reported with its previous details",()=>{
  const result=compareTimetableVersions([entry()],[]);
  assert.equal(result.summary.removed,1);
  assert.equal(result.changes[0].type,"REMOVED");
  assert.equal(result.changes[0].before.subject,"Mathematics");
});

check("time move is reported as a change, not add plus remove",()=>{
  const result=compareTimetableVersions([entry()],[entry({day:"Tuesday",startTime:"11:00",endTime:"12:00",order:3})]);
  assert.equal(result.summary.changed,1);
  assert.equal(result.summary.added,0);
  assert.equal(result.summary.removed,0);
  assert.deepEqual(result.changes[0].fields.map(field=>field.field),["Day","Start time","End time"]);
});

check("faculty and room reassignment are named in changed fields",()=>{
  const result=compareTimetableVersions([entry()],[entry({faculty:facultyB,room:roomB})]);
  assert.deepEqual(result.changes[0].fields.map(field=>field.field),["Faculty","Room"]);
  assert.equal(result.changes[0].fields[0].before,"Ms Faculty");
  assert.equal(result.changes[0].fields[0].after,"Mr Faculty");
});

check("new and removed subjects are separately identified",()=>{
  const left=[entry({subject:math})];
  const right=[entry({subject:analytics})];
  const result=compareTimetableVersions(left,right);
  assert.equal(result.summary.added,1);
  assert.equal(result.summary.removed,1);
  assert.deepEqual(new Set(result.changes.map(change=>change.type)),new Set(["ADDED","REMOVED"]));
});

check("repeated weekly sessions are paired deterministically by slot",()=>{
  const left=[entry({startTime:"11:00",endTime:"12:00",order:3}),entry()];
  const right=[entry({day:"Tuesday",startTime:"11:00",endTime:"12:00",order:3}),entry({day:"Tuesday",order:1})];
  const result=compareTimetableVersions(left,right);
  assert.equal(result.summary.changed,2);
  assert.equal(result.changes.length,2);
});

check("comparison does not mutate source entries",()=>{
  const before=entry();
  const after=entry({room:roomB});
  const beforeDay=before.day,afterRoom=after.room;
  compareTimetableVersions([before],[after]);
  assert.equal(before.day,beforeDay);
  assert.equal(after.room,afterRoom);
});

check("null and malformed entry lists are handled defensively",()=>{
  const result=compareTimetableVersions(null,undefined);
  assert.deepEqual(result.summary,{added:0,removed:0,changed:0,unchanged:0});
});

console.log(`\nResult: ${passed} timetable version comparison regression checks passed.`);
