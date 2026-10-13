import assert from "node:assert/strict";
import { calculateFacultyWorkloadCapacity } from "../services/facultyWorkload.js";

const DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday"];
const slots = DAYS.flatMap(day => Array.from({length:4},(_,index)=>({
  day,
  startTime:`${String(9+index).padStart(2,"0")}:00`,
  endTime:`${String(10+index).padStart(2,"0")}:00`,
  isBreak:false
})));

function calculate(overrides={}) {
  return calculateFacultyWorkloadCapacity({
    classes:8,
    periods:10,
    maxWorkingDays:5,
    maxClassesPerDay:2,
    availableDays:DAYS,
    unavailableSlots:[],
    dailyMap:new Map([["Monday",{day:"Monday",classes:2,periods:2}]]),
    usableSlots:slots,
    ...overrides
  });
}

let passed=0;
function check(name,fn) {
  fn();
  passed+=1;
  console.log("PASS  "+name);
}

check("capacity is bounded by max classes per day and max working days",()=>{
  const result=calculate({maxWorkingDays:2});
  assert.equal(result.capacityClasses,4);
  assert.equal(result.capacityUtilization,200);
  assert.equal(result.loadStatus,"OVER_CAPACITY");
});

check("load below forty percent is flagged low utilization",()=>{
  const result=calculate({classes:3,maxWorkingDays:5,maxClassesPerDay:2});
  assert.equal(result.capacityClasses,10);
  assert.equal(result.capacityUtilization,30);
  assert.equal(result.loadStatus,"LOW_UTILIZATION");
});

check("load at or above eighty-five percent is near capacity",()=>{
  const result=calculate({classes:9,maxWorkingDays:5,maxClassesPerDay:2});
  assert.equal(result.capacityUtilization,90);
  assert.equal(result.loadStatus,"NEAR_CAPACITY");
});

check("load over one hundred percent is over capacity",()=>{
  const result=calculate({classes:11,maxWorkingDays:5,maxClassesPerDay:2});
  assert.equal(result.capacityUtilization,110);
  assert.equal(result.loadStatus,"OVER_CAPACITY");
});

check("normal configured load is within capacity",()=>{
  const result=calculate({classes:6,maxWorkingDays:5,maxClassesPerDay:2});
  assert.equal(result.capacityUtilization,60);
  assert.equal(result.loadStatus,"WITHIN_CAPACITY");
});

check("missing limits are not inferred",()=>{
  const result=calculate({maxWorkingDays:0,maxClassesPerDay:0});
  assert.equal(result.capacityConfigured,false);
  assert.equal(result.capacityClasses,null);
  assert.equal(result.capacityUtilization,null);
  assert.equal(result.loadStatus,"LIMITS_NOT_CONFIGURED");
});

check("configured faculty with no matching working-day slots has no capacity",()=>{
  const result=calculate({availableDays:["Sunday"]});
  assert.equal(result.capacityConfigured,true);
  assert.equal(result.capacityClasses,0);
  assert.equal(result.capacityUtilization,null);
  assert.equal(result.loadStatus,"NO_AVAILABLE_CAPACITY");
});

check("unavailable slots reduce both available periods and weekly capacity",()=>{
  const blocked=slots.filter(slot=>slot.day==="Monday"||slot.day==="Tuesday")
    .map(slot=>`${slot.day}|${slot.startTime}-${slot.endTime}`);
  const result=calculate({unavailableSlots:blocked,maxWorkingDays:5,maxClassesPerDay:2});
  assert.equal(result.availablePeriods,12);
  assert.equal(result.capacityClasses,6);
});

check("daily breakdown includes class capacity and free available periods",()=>{
  const result=calculate();
  const monday=result.dailyBreakdown.find(day=>day.day==="Monday");
  const sunday=result.dailyBreakdown.find(day=>day.day==="Sunday");
  assert.deepEqual(
    {classes:monday.classes,periods:monday.periods,available:monday.availablePeriods,free:monday.freePeriods,capacity:monday.capacityClasses,utilization:monday.capacityUtilization},
    {classes:2,periods:2,available:4,free:2,capacity:2,utilization:100}
  );
  assert.equal(sunday.capacityClasses,null);
  assert.equal(sunday.availablePeriods,0);
});

console.log(`\nResult: ${passed} faculty workload regression checks passed.`);
