function idOf(v) {
<<<<<<< HEAD
  return String(v?._id ?? v ?? "");
}

function norm(v) {
  return String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function normDay(v) {
  const x = norm(v);
  const map = {
    mon: "monday", monday: "monday",
    tue: "tuesday", tues: "tuesday", tuesday: "tuesday",
    wed: "wednesday", wednesday: "wednesday",
    thu: "thursday", thur: "thursday", thurs: "thursday", thursday: "thursday",
    fri: "friday", friday: "friday",
    sat: "saturday", saturday: "saturday",
    sun: "sunday", sunday: "sunday"
  };
  return map[x] || x;
}

function normRoomType(v) {
  const x = norm(v);
  if (x === "any" || x === "all") return "any";
  if (x === "lab" || x === "laboratory" || x === "computer lab") return "lab";
  if (x === "classroom" || x === "class room" || x === "class") return "classroom";
  return x;
}

function normTime(v) {
  const x = String(v ?? "").trim();
  const m = x.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return x;
  return `${String(Number(m[1])).padStart(2,"0")}:${m[2]}`;
}

function slotKey(s) {
  return `${normDay(s.day)}|${normTime(s.startTime)}-${normTime(s.endTime)}`;
}

function shuffle(a) {
  const x = [...a];
  for (let i = x.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [x[i], x[j]] = [x[j], x[i]];
=======
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && v._id !== undefined) return String(v._id);
  return String(v);
}


function normalizeLookup(value){
  return String(value??"").trim().toLowerCase();
}

function programMatches(section, slot, programs=[]){
  // A slot without a program is global and is available to every section.
  if(!slot?.program) return true;
  const slotProgramId=idOf(slot.program);
  if(!slotProgramId) return true;

  const sectionProgramId = idOf(section?.programId);
  if(sectionProgramId && sectionProgramId===slotProgramId) return true;
  const sectionProgram=section?.program;
  if(!sectionProgram) return false;
  const legacySectionProgramId=idOf(sectionProgram);
  if(legacySectionProgramId && legacySectionProgramId===slotProgramId) return true;

  const program=programs.find(p=>idOf(p)===slotProgramId);
  if(!program) return false;

  const value=normalizeLookup(sectionProgram);
  return value===normalizeLookup(program.name) || value===normalizeLookup(program.code);
}

function slotKey(s) {
  return `${s.day}|${s.startTime}-${s.endTime}`;
}

function shuffle(a) {
  const x=[...a];
  for(let i=x.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [x[i],x[j]]=[x[j],x[i]];
>>>>>>> 62a144d (Phase 18 QA fixes and Link2 runtime fix)
  }
  return x;
}

<<<<<<< HEAD
function buildBlocks(slots, duration) {
  const x = [...slots]
    .filter(s => !s.isBreak)
    .sort((a, b) =>
      normDay(a.day).localeCompare(normDay(b.day)) ||
      Number(a.order || 0) - Number(b.order || 0)
    );

  const out = [];
  const d = Math.max(1, Number(duration || 1));

  for (let i = 0; i < x.length; i++) {
    const block = x.slice(i, i + d);
    if (block.length !== d) continue;
    if (block.some(s => String(s.day) !== String(x[i].day))) continue;

    let consecutive = true;
    for (let j = 1; j < block.length; j++) {
      if (Number(block[j].order) !== Number(block[j - 1].order) + 1) {
        consecutive = false;
        break;
      }
    }
    if (consecutive) out.push(block);
  }

  return out;
}

function maxRun(orders) {
  const x = [...new Set(orders.map(Number).filter(Number.isFinite))]
    .sort((a, b) => a - b);

  let best = 0;
  let run = 0;
  let prev = null;

  for (const n of x) {
    if (prev !== null && n === prev + 1) run++;
    else run = 1;
    best = Math.max(best, run);
    prev = n;
  }

  return best;
}

function getEntryOrders(entries, field, id, day) {
  const orders = [];

  for (const e of entries) {
    if (e.day !== day || idOf(e[field]) !== id) continue;

    const start = Number(e.order || 0);
    const duration = Math.max(1, Number(e.duration || 1));

    for (let i = 0; i < duration; i++) {
      orders.push(start + i);
    }
  }

  return orders;
}

function normalizeAvailableDays(facultyMember, slots) {
  const configured = Array.isArray(facultyMember?.availableDays)
    ? facultyMember.availableDays.map(norm).filter(Boolean)
    : [];

  // IMPORTANT:
  // An empty availableDays array means "no day matrix has been configured",
  // not "faculty is unavailable every day".
  if (!configured.length) {
    return new Set(
      [...new Set(slots.map(s => norm(s.day)).filter(Boolean))]
    );
  }

  return new Set(configured);
}

function normalizeUnavailableSlots(facultyMember) {
  return new Set(
    (Array.isArray(facultyMember?.unavailableSlots)
      ? facultyMember.unavailableSlots
      : []
    ).map(v => {
      const raw = String(v ?? "").trim();
      const m = raw.match(/^([^|]+)\|(.+?)-(.+)$/);
      return m
        ? `${normDay(m[1])}|${normTime(m[2])}-${normTime(m[3])}`
        : normDay(raw);
    })
  );
}

export function generateTimetable({
  faculty = [],
  subjects = [],
  programs = [],
  sections = [],
  rooms = [],
  slots = [],
  settings = {},
  attempts = 150,
  maxMillis = 20000
}) {
  const deadline = Date.now() + Math.max(1000, Number(maxMillis || 20000));

  const fMap = new Map(faculty.map(x => [idOf(x), x]));
  const sMap = new Map(sections.map(x => [idOf(x), x]));
  const pMap = new Map();
  for (const p of programs) {
    pMap.set(idOf(p), p);
    if (p?.name) pMap.set(`name:${norm(p.name)}`, p);
    if (p?.code) pMap.set(`code:${norm(p.code)}`, p);
  }

  function sectionProgram(section) {
    const raw = String(section?.program ?? "").trim();
    if (!raw) return null;
    return (
      pMap.get(raw) ||
      pMap.get(`name:${norm(raw)}`) ||
      pMap.get(`code:${norm(raw)}`) ||
      null
    );
  }

  function slotBelongsToSectionProgram(slot, section) {
    const slotProgramId = idOf(slot?.program);
    if (!slotProgramId) return true; // global slot
    const program = sectionProgram(section);
    return Boolean(program && slotProgramId === idOf(program));
  }

  const usableSlots = slots
    .filter(s => !s.isBreak)
    .sort((a, b) =>
      normDay(a.day).localeCompare(normDay(b.day)) ||
      Number(a.order || 0) - Number(b.order || 0)
    );

  if (!usableSlots.length) {
    return {
      entries: [],
      score: 0,
      warnings: ["No usable time slots are configured."]
    };
  }

  const tasks = [];

  for (const subject of subjects) {
    const weekly = Math.max(0, Number(subject.classesPerWeek || 0));
    for (let n = 1; n <= weekly; n++) {
      tasks.push({ subject, n });
    }
  }

  if (!tasks.length) {
    return {
      entries: [],
      score: 0,
      warnings: ["No subject sessions are configured."]
    };
  }

  const cfg = {
    maxConsecutiveFaculty: Math.max(
      1,
      Number(settings.maxConsecutiveFaculty || 2)
    ),
    maxConsecutiveSection: Math.max(
      1,
      Number(settings.maxConsecutiveSection || 3)
    ),
    // This is now a SOFT preference. It no longer makes the whole problem
    // impossible when a subject has many weekly sessions.
    avoidSameSubjectSameDay:
      settings.avoidSameSubjectSameDay !== false,
    distributeSubjectAcrossDays:
      settings.distributeSubjectAcrossDays !== false,
    avoidFirstLastPeriod:
      Boolean(settings.avoidFirstLastPeriod)
  };

  const candidatesByTask = tasks.map(task => {
    const allowedDays = Array.isArray(task.subject.allowedDays)
      ? new Set(task.subject.allowedDays.map(normDay))
      : null;
    const section = sMap.get(idOf(task.subject.section));
    const programSlots = usableSlots.filter(slot =>
      slotBelongsToSectionProgram(slot, section)
    );
    const candidateSlots = (allowedDays && allowedDays.size
      ? programSlots.filter(s => allowedDays.has(normDay(s.day)))
      : programSlots);
    return {
      task,
      blocks: buildBlocks(
        candidateSlots,
        Math.max(1, Number(task.subject.duration || 1))
      )
    };
  });

  const candidateWarnings = [];

  for (const item of candidatesByTask) {
    const sub = item.task.subject;
    const fid = idOf(sub.faculty);
    const sid = idOf(sub.section);

    if (!fMap.has(fid)) {
      candidateWarnings.push(
        `${sub.name}: Faculty reference is not available to the generator.`
      );
    }

    if (!sMap.has(sid)) {
      candidateWarnings.push(
        `${sub.name}: Section reference is not available to the generator.`
      );
    }

    const matchingRooms = rooms.filter(r => {
      const wanted = normRoomType(sub.roomType || "Classroom");
      const actual = normRoomType(r.type || "Classroom");
      return wanted === "any" || wanted === actual;
    });

    if (!matchingRooms.length) {
      candidateWarnings.push(
        `${sub.name}: no room matches room type "${sub.roomType || "Classroom"}".`
      );
    }

    if (!item.blocks.length) {
      candidateWarnings.push(
        `${sub.name}: no ${Number(sub.duration || 1)}-period consecutive block exists.`
      );
    }
  }

  const preflight = candidatesByTask.map(item => {
    const sub = item.task.subject;
    const fid = idOf(sub.faculty);
    const sid = idOf(sub.section);
    const f = fMap.get(fid);
    const sec = sMap.get(sid);
    const wanted = normRoomType(sub.roomType || "Classroom");
    const roomMatches = rooms.filter(r => wanted === "any" || normRoomType(r.type || "Classroom") === wanted).length;
    const allowedDays = f ? normalizeAvailableDays(f, usableSlots) : new Set();
    const dayBlocks = item.blocks.filter(b => allowedDays.has(normDay(b[0].day))).length;
    return {
      subject: sub.name,
      faculty: f?.name || "MISSING",
      section: sec?.name || "MISSING",
      roomType: sub.roomType || "Classroom",
      matchingRooms: roomMatches,
      allowedDayBlocks: dayBlocks,
      maxFacultyDays: Number(f?.maxWorkingDays || 0),
      maxFacultyClassesPerDay: Number(f?.maxClassesPerDay || 0),
      maxSectionClassesPerDay: Number(sec?.maxClassesPerDay || 0),
      possible: Boolean(f && sec && roomMatches > 0 && dayBlocks > 0)
    };
  });
  const impossiblePreflight = preflight.filter(x => !x.possible);

  let best = {
    entries: [],
    score: -Infinity,
    warnings: []
  };

  // Keep the best partial timetable during backtracking. Previously the
  // engine only evaluated `entries` after the recursive search returned, so
  // one impossible subject could cause an otherwise useful partial schedule
  // to collapse back to zero entries.
  let bestPartial = [];

  const firstOrder = usableSlots.length
    ? Math.min(...usableSlots.map(s => Number(s.order || 0)))
    : null;

  const lastOrder = usableSlots.length
    ? Math.max(...usableSlots.map(s => Number(s.order || 0)))
    : null;

  for (let attempt = 0; attempt < Number(attempts || 150); attempt++) {
    if (Date.now() >= deadline) break;

    const entries = [];
    const fBusy = new Set();
    const secBusy = new Set();
    const roomBusy = new Set();

    const fDays = new Map();
    const fDayCount = new Map();
    const secDayCount = new Map();
    const subDayCount = new Map();

    function getOptions(item) {
      const sub = item.task.subject;
      const fid = idOf(sub.faculty);
      const sid = idOf(sub.section);

      const f = fMap.get(fid);
      const sec = sMap.get(sid);

      if (!f || !sec) return [];

      const roomsAllowed = rooms.filter(r => {
        const wanted = normRoomType(sub.roomType || "Classroom");
        const actual = normRoomType(r.type || "Classroom");
        return wanted === "any" || wanted === actual;
      });

      if (!roomsAllowed.length) return [];

      const allowedDays = normalizeAvailableDays(f, usableSlots);
      const unavailable = normalizeUnavailableSlots(f);
      const options = [];

      for (const block of item.blocks) {
        const day = normDay(block[0].day);

        if (!allowedDays.has(day)) continue;

        const dayKey = normDay(block[0].day);

        if (
          (fDays.get(fid)?.size || 0) >=
            Number(f.maxWorkingDays || 7) &&
          !fDays.get(fid)?.has(dayKey)
        ) {
          continue;
        }

        // Classes/day means teaching sessions, not occupied periods.
        const facultyDaySessions =
          fDayCount.get(`${fid}|${dayKey}`) || 0;
        const sectionDaySessions =
          secDayCount.get(`${sid}|${dayKey}`) || 0;

        if (
          facultyDaySessions + 1 >
          Number(f.maxClassesPerDay || 99)
        ) {
          continue;
        }

        if (
          sectionDaySessions + 1 >
          Number(sec?.maxClassesPerDay || 99)
        ) {
          continue;
        }

        if (
          block.some(slot =>
            unavailable.has(
              slotKey(slot).trim().toLowerCase()
            )
          )
        ) {
          continue;
        }

        for (const room of roomsAllowed) {
          const roomId = idOf(room);

          const conflict = block.some(slot => {
            const key = slotKey(slot);

=======
function buildBlocks(slots,duration){
  const d=Math.max(1,Number(duration||1));
  const x=[...slots]
    .filter(s=>s && !s.isBreak)
    .sort((a,b)=>{
      const dayCmp=String(a.day).localeCompare(String(b.day));
      return dayCmp || Number(a.order||0)-Number(b.order||0);
    });

  const out=[];
  for(let i=0;i<x.length;i++){
    const block=x.slice(i,i+d);
    if(block.length!==d) continue;
    if(block.some(s=>String(s.day)!==String(x[i].day))) continue;

    let consecutive=true;
    for(let j=1;j<block.length;j++){
      if(Number(block[j].order)!==Number(block[j-1].order)+1){
        consecutive=false;
        break;
      }
    }
    if(consecutive) out.push(block);
  }
  return out;
}

function maxRun(orders){
  const x=[...new Set(orders.map(Number).filter(Number.isFinite))].sort((a,b)=>a-b);
  let best=0,run=0,prev=null;
  for(const n of x){
    if(prev!==null && n===prev+1) run++;
    else run=1;
    best=Math.max(best,run);
    prev=n;
  }
  return best;
}

function normalizeRoomType(value){
  const v=String(value||"Classroom").trim().toLowerCase();
  if(v==="any") return "Any";
  if(v==="lab" || v==="laboratory") return "Lab";
  return "Classroom";
}


function calculateQualityMetrics({entries=[], tasks=[], subjects=[], faculty=[], sections=[], slots=[], settings={}}){
  const required=Math.max(0,tasks.length);
  const scheduled=entries.length;
  const coveragePercent=required?Number((scheduled/required*100).toFixed(1)):100;
  const byFaculty=new Map(), bySection=new Map(), bySubjectDay=new Map();
  for(const e of entries){
    const fid=idOf(e.faculty), sid=idOf(e.section), sk=`${idOf(e.subject)}|${e.day}`;
    byFaculty.set(fid,(byFaculty.get(fid)||0)+Math.max(1,Number(e.duration||1)));
    bySection.set(sid,(bySection.get(sid)||0)+Math.max(1,Number(e.duration||1)));
    bySubjectDay.set(sk,(bySubjectDay.get(sk)||0)+1);
  }
  const distributionPenalty=[...bySubjectDay.values()].reduce((n,c)=>n+(c>1?c-1:0),0);
  const facultyLoads=[...byFaculty.values()];
  const sectionLoads=[...bySection.values()];
  const avg=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0;
  const variance=(a)=>{const m=avg(a);return a.length?a.reduce((n,x)=>n+(x-m)**2,0)/a.length:0};
  const firstOrder=slots.length?Math.min(...slots.map(x=>Number(x.order)).filter(Number.isFinite)):0;
  const lastOrder=slots.length?Math.max(...slots.map(x=>Number(x.order)).filter(Number.isFinite)):0;
  const edgeCount=entries.filter(e=>Number(e.order)===firstOrder||Number(e.order)===lastOrder).length;
  const score=Math.max(0,Math.min(100,Math.round(
    coveragePercent*0.65 +
    Math.max(0,100-distributionPenalty*5)*0.10 +
    Math.max(0,100-Math.sqrt(variance(facultyLoads))*8)*0.10 +
    Math.max(0,100-Math.sqrt(variance(sectionLoads))*8)*0.10 +
    Math.max(0,100-(edgeCount/Math.max(1,scheduled))*100*0.05)*0.05
  )));
  return {
    qualityScore:score, coveragePercent, requiredSessions:required, scheduledSessions:scheduled,
    unscheduledSessions:Math.max(0,required-scheduled), subjectSameDayRepeats:distributionPenalty,
    facultyLoadAverage:Number(avg(facultyLoads).toFixed(2)), facultyLoadVariance:Number(variance(facultyLoads).toFixed(2)),
    sectionLoadAverage:Number(avg(sectionLoads).toFixed(2)), sectionLoadVariance:Number(variance(sectionLoads).toFixed(2)),
    edgePeriodClasses:edgeCount
  };
}

export function generateBestTimetable({
  faculty=[],
  subjects=[],
  sections=[],
  rooms=[],
  slots=[],
  programs=[],
  settings={},
  runs=4,
  totalMaxMillis=12000,
  perRunMillis=4000,
  attemptsPerRun=500
}) {
  const started=Date.now();
  let best=null;
  const count=Math.max(1, Number(runs)||1);

  for(let i=0;i<count;i++){
    const remaining=Number(totalMaxMillis||12000)-(Date.now()-started);
    if(i>0 && remaining<=0) break;

    const maxMillis=Math.max(250, Math.min(Number(perRunMillis||4000), remaining>0?remaining:Number(perRunMillis||4000)));
    const result=generateTimetable({
      faculty,
      subjects,
      sections,
      rooms,
      slots,
      programs,
      settings,
      attempts:Math.max(1, Number(attemptsPerRun)||500),
      maxMillis
    });

    const score=Number(result?.score||0);
    const entryCount=Array.isArray(result?.entries)?result.entries.length:0;
    const bestEntryCount=Array.isArray(best?.entries)?best.entries.length:0;
    if(!best || entryCount>bestEntryCount || (entryCount===bestEntryCount && score>Number(best.score||0))){
      best=result;
    }

    if(result?.warnings?.some(w=>String(w).startsWith('No valid subjects'))){
      break;
    }
  }

  return best || {entries:[],score:0,warnings:['Timetable generation produced no result.']};
}

export function generateTimetable({
  faculty=[],
  subjects=[],
  sections=[],
  rooms=[],
  slots=[],
  programs=[],
  settings={},
  attempts=60,
  maxMillis=10000
}){
  const deadline=Date.now()+Number(maxMillis||10000);

  const fMap=new Map(faculty.map(x=>[idOf(x),x]));
  const sMap=new Map(sections.map(x=>[idOf(x),x]));

  const warnings=[];
  const validSubjects=[];
  let orphanSubjects=0;

  for(const subject of subjects){
    const fid=idOf(subject.faculty);
    const sid=idOf(subject.section);
    const f=fMap.get(fid);
    const s=sMap.get(sid);

    if(!fid || !f || !sid || !s){
      orphanSubjects++;
      continue;
    }

    validSubjects.push(subject);
  }

  if(orphanSubjects){
    warnings.push(
      `${orphanSubjects} subject(s) were skipped because their Faculty or Section reference is missing.`
    );
  }

  if(!validSubjects.length){
    return {
      entries:[],
      score:0,
      warnings:[
        ...warnings,
        "No valid subjects can be scheduled. Check Subjects and make sure every subject has an existing Faculty and Section."
      ]
    };
  }

  const configuredHolidayDays = Array.isArray(settings.holidayDays) ? settings.holidayDays.map(x=>String(x).trim()) : [];
  // Sunday is always a holiday and cannot be overridden. Additional recurring
  // holiday weekdays can be configured from Scheduler Settings.
  const holidayDays = new Set(["Sunday", ...configuredHolidayDays]);
  const allUsableSlots=slots.filter(s=>s && !s.isBreak);
  const usableSlots=allUsableSlots.filter(s=>!holidayDays.has(String(s.day)));
  const excludedHolidaySlots=allUsableSlots.length-usableSlots.length;

  if(!usableSlots.length){
    return {entries:[],score:0,warnings:[`No usable time slots are configured after excluding holidays: ${[...holidayDays].join(", ")}.`]};
  }

  const holidayWarnings = [`Sunday is a default holiday and is never scheduled.`];
  if(configuredHolidayDays.length){
    holidayWarnings.push(`Holiday weekdays excluded from generation: ${configuredHolidayDays.filter(d=>d!=="Sunday").join(", ")}.`);
  }

  if(!rooms.length){
    return {entries:[],score:0,warnings:["No rooms are configured."]};
  }

  const cfg={
    maxConsecutiveFaculty:Math.max(1,Number(settings.maxConsecutiveFaculty||2)),
    maxConsecutiveSection:Math.max(1,Number(settings.maxConsecutiveSection||3)),
    avoidSameSubjectSameDay:settings.avoidSameSubjectSameDay!==false,
    distributeSubjectAcrossDays:settings.distributeSubjectAcrossDays!==false,
    avoidFirstLastPeriod:Boolean(settings.avoidFirstLastPeriod)
  };

  const tasks=[];
  for(const subject of validSubjects){
    const count=Math.max(0,Number(subject.classesPerWeek||0));
    for(let i=0;i<count;i++){
      tasks.push({subject,n:i+1});
    }
  }

  if(!tasks.length){
    return {entries:[],score:0,warnings:[...warnings,"No subject sessions are configured."]};
  }

  const candidatesByTask=tasks.map(task=>{
    const section=sMap.get(idOf(task.subject.section));
    const subjectSlots=usableSlots.filter(slot=>programMatches(section,slot,programs));
    return {
      task,
      blocks:buildBlocks(subjectSlots,Number(task.subject.duration||1))
    };
  });

  const invalidBlockTasks=candidatesByTask.filter(x=>x.blocks.length===0);
  if(invalidBlockTasks.length){
    warnings.push(
      `${invalidBlockTasks.length} subject task(s) have no valid consecutive time block for their duration.`
    );
  }

  const orderedSlots=[...usableSlots].sort((a,b)=>Number(a.order||0)-Number(b.order||0));
  const firstOrder=orderedSlots[0]?.order;
  const lastOrder=orderedSlots.at(-1)?.order;

  let best={
    entries:[],
    score:-Infinity,
    warnings:[...warnings, ...holidayWarnings],
    metrics:null
  };
  let timedOut=false;

  for(let attempt=0;attempt<Number(attempts||60);attempt++){
    if(Date.now()>=deadline){ timedOut=true; break; }

    const entries=[];
    const fBusy=new Set();
    const secBusy=new Set();
    const roomBusy=new Set();

    const fDays=new Map();
    const fDayCount=new Map();
    const secDayCount=new Map();
    const subDayCount=new Map();

    const ordered=shuffle(candidatesByTask).sort((a,b)=>{
      const af=fMap.get(idOf(a.task.subject.faculty));
      const bf=fMap.get(idOf(b.task.subject.faculty));

      const aAvail=(af?.availableDays?.length || 7);
      const bAvail=(bf?.availableDays?.length || 7);

      return aAvail-bAvail || a.blocks.length-b.blocks.length;
    });

    function canPlaceConsecutive(fid,sid,block,day){
      const fOrders=[];
      const sOrders=[];

      for(const e of entries){
        if(e.day!==day) continue;

        const start=Number(e.order||0);
        const duration=Math.max(1,Number(e.duration||1));
        const orders=Array.from({length:duration},(_,i)=>start+i);

        if(idOf(e.faculty)===fid) fOrders.push(...orders);
        if(idOf(e.section)===sid) sOrders.push(...orders);
      }

      fOrders.push(...block.map(s=>Number(s.order||0)));
      sOrders.push(...block.map(s=>Number(s.order||0)));

      return (
        maxRun(fOrders)<=cfg.maxConsecutiveFaculty &&
        maxRun(sOrders)<=cfg.maxConsecutiveSection
      );
    }

    function getOptions(item){
      const sub=item.task.subject;
      const fid=idOf(sub.faculty);
      const sid=idOf(sub.section);
      const f=fMap.get(fid);
      const sec=sMap.get(sid);

      if(!f || !sec) return [];

      const wantedType=normalizeRoomType(sub.roomType);

      const roomsAllowed=rooms.filter(room=>{
        const roomType=normalizeRoomType(room.type);
        return wantedType==="Any" || roomType===wantedType;
      });

      if(!roomsAllowed.length) return [];

      const unavailable=new Set(
        Array.isArray(f.unavailableSlots)?f.unavailableSlots:[]
      );

      const availableDays=Array.isArray(f.availableDays)
        ? f.availableDays
        : [];

      const effectiveAvailableDays=availableDays.length
        ? new Set(availableDays)
        : new Set(usableSlots.map(s=>s.day));

      const opts=[];

      for(const block of item.blocks){
        if(!block.length) continue;

        const day=block[0].day;

        if(!effectiveAvailableDays.has(day)) continue;

        const workingDays=fDays.get(fid)||new Set();
        const maxWorkingDays=Number(f.maxWorkingDays||7);

        if(!workingDays.has(day) && workingDays.size>=maxWorkingDays){
          continue;
        }

        const maxFacultyDay=Number(f.maxClassesPerDay||99);
        const facultyCount=fDayCount.get(`${fid}|${day}`)||0;
        if(facultyCount+block.length>maxFacultyDay) continue;

        const maxSectionDay=Number(sec.maxClassesPerDay||99);
        const sectionCount=secDayCount.get(`${sid}|${day}`)||0;
        if(sectionCount+block.length>maxSectionDay) continue;

        if(block.some(slot=>unavailable.has(slotKey(slot)))) continue;

        if(
          cfg.avoidFirstLastPeriod &&
          block.some(slot=>
            Number(slot.order)===Number(firstOrder) ||
            Number(slot.order)===Number(lastOrder)
          )
        ){
          continue;
        }

        const repeated=subDayCount.get(`${idOf(sub)}|${day}`)||0;

        if(!canPlaceConsecutive(fid,sid,block,day)) continue;

        for(const room of roomsAllowed){
          const roomId=idOf(room);

          const conflict=block.some(slot=>{
            const key=slotKey(slot);
>>>>>>> 62a144d (Phase 18 QA fixes and Link2 runtime fix)
            return (
              fBusy.has(`${fid}|${key}`) ||
              secBusy.has(`${sid}|${key}`) ||
              roomBusy.has(`${roomId}|${key}`)
            );
          });

<<<<<<< HEAD
          if (conflict) continue;

          const repeated =
            subDayCount.get(`${idOf(sub)}|${dayKey}`) || 0;

          options.push({
            block,
            room,
            repeated
=======
          if(conflict) continue;

          opts.push({
            block,
            room,
            repeated,
            sameSubjectDay: repeated > 0
>>>>>>> 62a144d (Phase 18 QA fixes and Link2 runtime fix)
          });
        }
      }

<<<<<<< HEAD
      return shuffle(options).sort(
        (a, b) => a.repeated - b.repeated
      );
    }

    function place(remaining) {
      if (Date.now() >= deadline) return false;
      if (remaining.length === 0) return true;

      // Minimum-remaining-values (MRV): at every step choose the subject
      // session that currently has the fewest legal placements. This is much
      // more effective than a fixed/random task order for real master data.
      let chosenIndex = -1;
      let chosenOptions = null;

      for (let i = 0; i < remaining.length; i++) {
        const options = getOptions(remaining[i]);
        if (!chosenOptions || options.length < chosenOptions.length) {
          chosenIndex = i;
          chosenOptions = options;
          if (options.length === 0) break;
          if (options.length === 1) break;
        }
      }

      if (!chosenOptions || chosenOptions.length === 0) return false;

      const item = remaining[chosenIndex];
      const sub = item.task.subject;
      const fid = idOf(sub.faculty);
      const sid = idOf(sub.section);
      const nextRemaining = remaining.filter((_, i) => i !== chosenIndex);

      for (const option of chosenOptions) {
        const block = option.block;
        const room = option.room;
        const day = String(block[0].day);

        const fd = `${fid}|${day}`;
        const sd = `${sid}|${day}`;
        const subDayKey = `${idOf(sub)}|${day}`;

        for (const slot of block) {
          const key = slotKey(slot);
          fBusy.add(`${fid}|${key}`);
          secBusy.add(`${sid}|${key}`);
          roomBusy.add(`${idOf(room)}|${key}`);
        }

        if (!fDays.has(fid)) fDays.set(fid, new Set());
        fDays.get(fid).add(day);
        fDayCount.set(fd, (fDayCount.get(fd) || 0) + 1);
        secDayCount.set(sd, (secDayCount.get(sd) || 0) + 1);
        subDayCount.set(subDayKey, (subDayCount.get(subDayKey) || 0) + 1);

        entries.push({
          day: block[0].day,
          startTime: block[0].startTime,
          endTime: block[block.length - 1].endTime,
          order: block[0].order,
          duration: block.length,
          section: sMap.get(sid)._id,
          subject: sub._id,
          faculty: fMap.get(fid)._id,
          room: room._id
        });

        if (entries.length > bestPartial.length) {
          bestPartial = [...entries];
        }

        if (place(nextRemaining)) return true;

        entries.pop();
        for (const slot of block) {
          const key = slotKey(slot);
          fBusy.delete(`${fid}|${key}`);
          secBusy.delete(`${sid}|${key}`);
          roomBusy.delete(`${idOf(room)}|${key}`);
        }

        fDayCount.set(fd, Math.max(0, (fDayCount.get(fd) || 1) - 1));
        secDayCount.set(sd, Math.max(0, (secDayCount.get(sd) || 1) - 1));
        subDayCount.set(subDayKey, Math.max(0, (subDayCount.get(subDayKey) || 1) - 1));

        if (!entries.some(e => idOf(e.faculty) === fid && e.day === day)) {
          fDays.get(fid)?.delete(day);
          if (!fDays.get(fid)?.size) fDays.delete(fid);
=======
      return shuffle(opts).sort((a,b)=>{
        const ap=(cfg.avoidSameSubjectSameDay&&a.sameSubjectDay)?100:0;
        const bp=(cfg.avoidSameSubjectSameDay&&b.sameSubjectDay)?100:0;
        return (ap+a.repeated)-(bp+b.repeated);
      });
    }

    function place(index){
      if(Date.now()>=deadline){ timedOut=true; return false; }
      if(index===ordered.length) return true;

      const item=ordered[index];
      const sub=item.task.subject;
      const fid=idOf(sub.faculty);
      const sid=idOf(sub.section);
      const f=fMap.get(fid);
      const sec=sMap.get(sid);

      if(!f || !sec) return false;

      for(const opt of getOptions(item)){
        const block=opt.block;
        const room=opt.room;
        const day=block[0].day;
        const roomId=idOf(room);

        const fd=`${fid}|${day}`;
        const sd=`${sid}|${day}`;
        const skey=`${idOf(sub)}|${day}`;

        for(const slot of block){
          const k=slotKey(slot);
          fBusy.add(`${fid}|${k}`);
          secBusy.add(`${sid}|${k}`);
          roomBusy.add(`${roomId}|${k}`);
        }

        if(!fDays.has(fid)) fDays.set(fid,new Set());
        fDays.get(fid).add(day);

        fDayCount.set(
          fd,
          (fDayCount.get(fd)||0)+block.length
        );

        secDayCount.set(
          sd,
          (secDayCount.get(sd)||0)+block.length
        );

        subDayCount.set(
          skey,
          (subDayCount.get(skey)||0)+1
        );

        entries.push({
          day,
          startTime:block[0].startTime,
          endTime:block.at(-1).endTime,
          order:Number(block[0].order||0),
          duration:block.length,
          section:sec._id,
          subject:sub._id,
          faculty:f._id,
          room:room._id
        });

        if(place(index+1)) return true;

        entries.pop();

        for(const slot of block){
          const k=slotKey(slot);
          fBusy.delete(`${fid}|${k}`);
          secBusy.delete(`${sid}|${k}`);
          roomBusy.delete(`${roomId}|${k}`);
        }

        fDayCount.set(
          fd,
          Math.max(0,(fDayCount.get(fd)||0)-block.length)
        );

        secDayCount.set(
          sd,
          Math.max(0,(secDayCount.get(sd)||0)-block.length)
        );

        subDayCount.set(
          skey,
          Math.max(0,(subDayCount.get(skey)||0)-1)
        );

        if(
          !entries.some(
            e=>idOf(e.faculty)===fid && e.day===day
          )
        ){
          fDays.get(fid)?.delete(day);
          if(!fDays.get(fid)?.size){
            fDays.delete(fid);
          }
>>>>>>> 62a144d (Phase 18 QA fixes and Link2 runtime fix)
        }
      }

      return false;
    }

<<<<<<< HEAD
    const completed = place([...candidatesByTask]);
    const scoredEntries = completed ? entries : bestPartial;

    let score = scoredEntries.length * 10000;

    if (cfg.distributeSubjectAcrossDays) {
      for (const sub of subjects) {
        const uniqueDays = new Set(
          scoredEntries
            .filter(e => idOf(e.subject) === idOf(sub))
            .map(e => e.day)
        ).size;

        score += uniqueDays * 100;
      }
    }

    // Penalize consecutive-class violations instead of rejecting an otherwise
    // valid placement. This prevents the backtracking engine from returning
    // zero classes when a complete timetable is possible but the preference
    // cannot be satisfied perfectly.
    for (const e of scoredEntries) {
      const day = e.day;
      const fid = idOf(e.faculty);
      const sid = idOf(e.section);
      const fRun = maxRun(getEntryOrders(scoredEntries, "faculty", fid, day));
      const sRun = maxRun(getEntryOrders(scoredEntries, "section", sid, day));
      if (fRun > cfg.maxConsecutiveFaculty) {
        score -= (fRun - cfg.maxConsecutiveFaculty) * 60;
      }
      if (sRun > cfg.maxConsecutiveSection) {
        score -= (sRun - cfg.maxConsecutiveSection) * 60;
      }
    }

    if (cfg.avoidSameSubjectSameDay) {
      for (const sub of subjects) {
        const daysForSubject = {};
        for (const e of scoredEntries) {
          if (idOf(e.subject) !== idOf(sub)) continue;
          daysForSubject[e.day] =
            (daysForSubject[e.day] || 0) + 1;
        }

        for (const count of Object.values(daysForSubject)) {
          if (count > 1) score -= (count - 1) * 25;
        }
      }
    }

    if (
      scoredEntries.length > best.entries.length ||
      (scoredEntries.length === best.entries.length &&
        score > best.score)
    ) {
      best = {
        entries: [...scoredEntries],
        score,
        warnings: []
      };
    }

    if (completed && entries.length === tasks.length) {
      return {
        ...best,
        warnings: candidateWarnings.length
          ? candidateWarnings
          : []
      };
    }
  }

  const warnings = [...candidateWarnings];

  for (const p of impossiblePreflight) {
    if (!p.matchingRooms) warnings.push(`${p.subject}: no room matches ${p.roomType}.`);
    else if (!p.allowedDayBlocks) warnings.push(`${p.subject}: no usable time block falls on the faculty's configured available days.`);
  }

  if (best.entries.length < tasks.length) {
    if (Date.now() >= deadline) {
      warnings.push(
        "Generation time limit reached before all sessions could be placed."
      );
    }

    warnings.push(
      `Only ${best.entries.length} of ${tasks.length} required weekly sessions could be scheduled.`
    );

    warnings.push(
      "Hard constraints: faculty availability, faculty/section/room conflicts, room type, daily limits and working-day limits."
    );

    warnings.push(
      "Subject distribution, consecutive-class limits, and first/last-period avoidance are treated as soft preferences."
    );
  }

  return {
    ...best,
    warnings,
    diagnostics: { preflight, impossible: impossiblePreflight }
  };
}


function variance(values) {
  const xs = values.filter(v => Number.isFinite(Number(v))).map(Number);
  if (xs.length < 2) return 0;
  const mean = xs.reduce((a,b) => a+b, 0) / xs.length;
  return xs.reduce((sum,v) => sum + Math.pow(v-mean,2), 0) / xs.length;
}

function optimizationMetrics(result, {faculty=[], sections=[], rooms=[], subjects=[], slots=[]} = {}) {
  const entries = Array.isArray(result?.entries) ? result.entries : [];
  const required = subjects.reduce((n,s)=>n+Number(s.classesPerWeek||0),0);
  const coverage = required ? entries.length / required : 1;

  const facultyCounts = new Map(faculty.map(f=>[idOf(f),0]));
  const sectionCounts = new Map(sections.map(s=>[idOf(s),0]));
  const roomCounts = new Map(rooms.map(r=>[idOf(r),0]));
  const subjectDay = new Map();
  const facultyDay = new Map();
  const sectionDay = new Map();
  const roomDay = new Map();
  const orderByFacultyDay = new Map();
  const orderBySectionDay = new Map();
  const usableOrdersByDay = new Map();

  for (const slot of slots.filter(s=>!s.isBreak)) {
    const key=normDay(slot.day);
    if(!usableOrdersByDay.has(key)) usableOrdersByDay.set(key,[]);
    usableOrdersByDay.get(key).push(Number(slot.order||0));
  }

  for (const e of entries) {
    const fid=idOf(e.faculty), sid=idOf(e.section), rid=idOf(e.room), sub=idOf(e.subject), day=normDay(e.day);
    facultyCounts.set(fid,(facultyCounts.get(fid)||0)+1);
    sectionCounts.set(sid,(sectionCounts.get(sid)||0)+1);
    roomCounts.set(rid,(roomCounts.get(rid)||0)+Math.max(1,Number(e.duration||1)));
    const sd=`${sub}|${day}`;
    subjectDay.set(sd,(subjectDay.get(sd)||0)+1);
    const fd=`${fid}|${day}`;
    const secd=`${sid}|${day}`;
    facultyDay.set(fd,(facultyDay.get(fd)||0)+1);
    sectionDay.set(secd,(sectionDay.get(secd)||0)+1);
    const forders=orderByFacultyDay.get(fd)||[];
    const sord=orderBySectionDay.get(secd)||[];
    const start=Number(e.order||0), dur=Math.max(1,Number(e.duration||1));
    for(let i=0;i<dur;i++){forders.push(start+i);sord.push(start+i);}
    orderByFacultyDay.set(fd,forders); orderBySectionDay.set(secd,sord);
    const rd=`${rid}|${day}`; roomDay.set(rd,(roomDay.get(rd)||0)+dur);
  }

  let duplicateSubjectDay=0;
  for(const n of subjectDay.values()) if(n>1) duplicateSubjectDay += n-1;

  let facultyConsecutivePenalty=0, sectionConsecutivePenalty=0;
  for(const orders of orderByFacultyDay.values()) {
    const run=maxRun(orders); if(run>2) facultyConsecutivePenalty += run-2;
  }
  for(const orders of orderBySectionDay.values()) {
    const run=maxRun(orders); if(run>3) sectionConsecutivePenalty += run-3;
  }

  const facultyWorkloads=[...facultyCounts.values()];
  const sectionWorkloads=[...sectionCounts.values()];
  const roomWorkloads=[...roomCounts.values()].filter(v=>v>0);
  const facultyVariance=variance(facultyWorkloads);
  const sectionVariance=variance(sectionWorkloads);
  const roomVariance=variance(roomWorkloads);

  let firstLastPenalty=0;
  for(const e of entries){
    const orders=usableOrdersByDay.get(normDay(e.day))||[];
    if(!orders.length) continue;
    const min=Math.min(...orders), max=Math.max(...orders), start=Number(e.order||0), end=start+Math.max(1,Number(e.duration||1))-1;
    if(start===min) firstLastPenalty++;
    if(end===max) firstLastPenalty++;
  }

  const optimizationScore =
    coverage * 100000 -
    facultyVariance * 35 -
    sectionVariance * 30 -
    roomVariance * 12 -
    duplicateSubjectDay * 45 -
    facultyConsecutivePenalty * 18 -
    sectionConsecutivePenalty * 15 -
    firstLastPenalty * 4;

  return {
    requiredSessions: required,
    scheduledSessions: entries.length,
    coveragePercent: Number((coverage*100).toFixed(2)),
    facultyVariance: Number(facultyVariance.toFixed(3)),
    sectionVariance: Number(sectionVariance.toFixed(3)),
    roomVariance: Number(roomVariance.toFixed(3)),
    duplicateSubjectDay,
    facultyConsecutivePenalty,
    sectionConsecutivePenalty,
    firstLastPenalty,
    optimizationScore: Number(optimizationScore.toFixed(2))
  };
}

export function generateBestTimetable({
  faculty=[], programs=[], subjects=[], sections=[], rooms=[], slots=[], settings={},
  runs=8, totalMaxMillis=30000, perRunMillis=3500, attemptsPerRun=150
}={}) {
  const started=Date.now();
  const maxRuns=Math.max(1,Math.min(20,Number(runs||8)));
  const candidates=[];
  let completedRuns=0;
  let best=null;

  for(let i=0;i<maxRuns;i++){
    const remaining=Math.max(500,totalMaxMillis-(Date.now()-started));
    if(remaining<=500) break;
    const result=generateTimetable({
      faculty,programs,subjects,sections,rooms,slots,settings,
      attempts:attemptsPerRun,
      maxMillis:Math.min(perRunMillis,remaining)
    });
    completedRuns++;
    const metrics=optimizationMetrics(result,{faculty,sections,rooms,subjects,slots});
    const candidate={...result,metrics,run:i+1};
    candidates.push(candidate);
    if(!best || candidate.entries.length>best.entries.length ||
      (candidate.entries.length===best.entries.length && candidate.metrics.optimizationScore>best.metrics.optimizationScore)) best=candidate;
    if(candidate.entries.length === subjects.reduce((n,s)=>n+Number(s.classesPerWeek||0),0) && candidate.metrics.optimizationScore>0 && remaining<1000) break;
  }

  if(!best){
    best=generateTimetable({faculty,programs,subjects,sections,rooms,slots,settings,attempts:attemptsPerRun,maxMillis:perRunMillis});
    best.metrics=optimizationMetrics(best,{faculty,sections,rooms,subjects,slots});
    completedRuns=1;
  }

  const ranked=[...candidates].sort((a,b)=>b.entries.length-a.entries.length || b.metrics.optimizationScore-a.metrics.optimizationScore);
  return {
    ...best,
    optimization: {
      runsRequested:maxRuns,
      runsCompleted:completedRuns,
      elapsedMs:Date.now()-started,
      bestRun:best.run||1,
      candidates:ranked.slice(0,Math.min(10,ranked.length)).map(x=>({run:x.run,scheduledSessions:x.entries.length,score:x.score,optimizationScore:x.metrics.optimizationScore,coveragePercent:x.metrics.coveragePercent})),
      metrics:best.metrics
    }
  };
=======
    place(0);

    let score=entries.length*1000;

    if(cfg.avoidSameSubjectSameDay){
      const seenSubjectDays=new Set();
      for(const e of entries){
        const key=`${idOf(e.subject)}|${e.day}`;
        if(seenSubjectDays.has(key)) score-=40;
        else seenSubjectDays.add(key);
      }
    }

    if(cfg.distributeSubjectAcrossDays){
      for(const sub of validSubjects){
        const unique=new Set(
          entries
            .filter(e=>idOf(e.subject)===idOf(sub))
            .map(e=>e.day)
        ).size;

        score+=unique*20;
      }
    }

    score-=entries.reduce(
      (sum,e)=>
        sum+
        Math.max(
          0,
          Number(e.order||0)-Number(firstOrder||0)
        )*0.1,
      0
    );

    if(
      entries.length>best.entries.length ||
      (
        entries.length===best.entries.length &&
        score>best.score
      )
    ){
      best={
        entries:[...entries],
        score,
        warnings:[...warnings],
        metrics:calculateQualityMetrics({entries,tasks,subjects:validSubjects,faculty,sections,slots:usableSlots,settings:cfg})
      };
    }

    if(entries.length===tasks.length){
      return best;
    }
  }

  if(best.entries.length<tasks.length){
    best.warnings=[
      ...(timedOut ? ["Generation time limit reached before all sessions could be placed."] : []),
      ...warnings,
      `Only ${best.entries.length} of ${tasks.length} required weekly sessions could be scheduled.`,
      "Check faculty availability, maximum classes/day, maximum working days, consecutive-class limits, unavailable periods, room types, section limits and time slots."
    ];
  }

  best.metrics ||= calculateQualityMetrics({entries:best.entries,tasks,subjects:validSubjects,faculty,sections,slots:usableSlots,settings:cfg});
  return best;
>>>>>>> 62a144d (Phase 18 QA fixes and Link2 runtime fix)
}
