function idOf(v) {
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
  }
  return x;
}

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
            return (
              fBusy.has(`${fid}|${key}`) ||
              secBusy.has(`${sid}|${key}`) ||
              roomBusy.has(`${roomId}|${key}`)
            );
          });

          if(conflict) continue;

          opts.push({
            block,
            room,
            repeated,
            sameSubjectDay: repeated > 0
          });
        }
      }

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
        }
      }

      return false;
    }

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
}
