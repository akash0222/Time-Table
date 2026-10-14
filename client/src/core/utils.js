export const days = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
export const apiName = {programs:"Programs",faculty:"Faculty",subjects:"Subjects",sections:"Sections",rooms:"Rooms",timeslots:"Time Slots"};

export function refId(v){return String(v?._id??v??"");}

export function authRole(){try{return JSON.parse(localStorage.getItem("tt_user")||"null")?.role||""}catch{return ""}}

export function localToday(){return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date())}

function normalizeScopeValue(value){return String(value??"").trim().toLowerCase()}

export function resolveEffectiveTimeSlots(slots=[],section,programs=[],academicSessionId=""){
  const sectionProgramId=refId(section?.programId) || refId(
    (programs||[]).find(program=>{
      const value=normalizeScopeValue(typeof section?.program==="object"
        ? section.program.name||section.program.code
        : section?.program);
      return value && [program?.name,program?.code].some(candidate=>normalizeScopeValue(candidate)===value)
    })
  );
  const semester=normalizeScopeValue(section?.semester);
  const sessionId=refId(academicSessionId)||refId(section?.academicSession);
  const candidates=(slots||[]).filter(slot=>{
    if(slot?.isBreak)return false;
    const slotSession=refId(slot?.academicSession);
    if(slotSession&&(!sessionId||slotSession!==sessionId))return false;
    const slotProgram=refId(slot?.program);
    if(slotProgram&&(!sectionProgramId||slotProgram!==sectionProgramId))return false;
    const slotSemester=normalizeScopeValue(slot?.semester);
    if(slotSemester&&slotSemester!==semester)return false;
    return true;
  });
  const exactSession=slot=>Boolean(sessionId)&&refId(slot?.academicSession)===sessionId;
  const globalSession=slot=>!refId(slot?.academicSession);
  const exactProgram=slot=>Boolean(sectionProgramId)&&refId(slot?.program)===sectionProgramId;
  const globalProgram=slot=>!refId(slot?.program);
  const exactSemester=slot=>Boolean(semester)&&normalizeScopeValue(slot?.semester)===semester;
  const programDefault=slot=>!normalizeScopeValue(slot?.semester);
  const scopes=[
    slot=>exactSession(slot)&&exactProgram(slot)&&exactSemester(slot),
    slot=>exactSession(slot)&&exactProgram(slot)&&programDefault(slot),
    slot=>exactSession(slot)&&globalProgram(slot)&&programDefault(slot),
    slot=>globalSession(slot)&&exactProgram(slot)&&exactSemester(slot),
    slot=>globalSession(slot)&&exactProgram(slot)&&programDefault(slot),
    slot=>globalSession(slot)&&globalProgram(slot)&&programDefault(slot)
  ];
  for(const scope of scopes){
    const rows=candidates.filter(scope);
    if(rows.length)return rows.sort((a,b)=>Number(a.order||0)-Number(b.order||0)||
      String(a.startTime||"").localeCompare(String(b.startTime||""));
  }
  return [];
}
