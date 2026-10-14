import mongoose from "mongoose";

function validDateOnly(value) {
  const text = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const parsed = new Date(`${text}T00:00:00.000Z`);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === text;
}

export function normalizeProgramDates(programDates) {
  if (!Array.isArray(programDates)) return [];
  return programDates.map(item => ({
    program: String(item?.program?._id ?? item?.program ?? "").trim(),
    semester: String(item?.semester ?? "").trim(),
    startDate: String(item?.startDate ?? "").trim(),
    endDate: String(item?.endDate ?? "").trim()
  }));
}

export function programDateInputIssue(programDates) {
  if (!Array.isArray(programDates) || !programDates.length) {
    return "At least one program calendar is required for an academic session.";
  }

  const seen = new Set();
  for (const row of programDates) {
    if (!row.program || !mongoose.isValidObjectId(row.program)) {
      return "Every program calendar must reference a valid program.";
    }
    const key = `${row.program}|${row.semester.trim().toLowerCase()}`;
    if (seen.has(key)) {
      return "A program and semester can have only one date range in an academic session.";
    }
    seen.add(key);

    if (!validDateOnly(row.startDate) || !validDateOnly(row.endDate)) {
      return "Every program must have valid Start Date and End Date values in YYYY-MM-DD format.";
    }
    if (row.endDate < row.startDate) {
      return "A program End Date cannot be before its Start Date.";
    }
  }

  return "";
}

 
export function sessionDateBounds(programDates=[], startDate="", endDate="") {
  const rows=Array.isArray(programDates)?programDates:[];
  const starts=rows.map(row=>String(row?.startDate||"")).filter(Boolean).sort();
  const ends=rows.map(row=>String(row?.endDate||"")).filter(Boolean).sort();
  return {
    startDate:String(startDate||starts[0]||"").trim().slice(0,10),
    endDate:String(endDate||ends[ends.length-1]||"").trim().slice(0,10)
  };
}

export function sessionDateBoundsIssue(programDates, startDate, endDate) {
  const start=String(startDate||"").trim();
  const end=String(endDate||"").trim();
  if(!validDateOnly(start)||!validDateOnly(end)){
    return "Academic session must have valid Start Date and End Date values in YYYY-MM-DD format.";
  }
  if(end<start){
    return "Academic session End Date cannot be before its Start Date.";
  }
  const outside=(Array.isArray(programDates)?programDates:[]).find(row=>
    row.startDate<start || row.endDate>end
  );
  if(outside){
    return "Overall academic session dates must include every program/semester calendar date range.";
  }
  return "";
}
