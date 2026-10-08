import {Router} from 'express';
import AcademicSession from '../models/AcademicSession.js';
import SessionPlan from '../models/SessionPlan.js';
import Faculty from '../models/Faculty.js';
import Subject from '../models/Subject.js';
import Section from '../models/Section.js';
import Room from '../models/Room.js';
import TimeSlot from '../models/TimeSlot.js';
import SchedulerSetting from '../models/SchedulerSetting.js';
import Program from '../models/Program.js';
import {generateBestTimetable} from '../services/generator.js';
import {allowRoles} from '../middleware/auth.js';

const router=Router();
const pad=n=>String(n).padStart(2,'0');
const dateKey=d=>`${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}`;
const parseDate=s=>{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw Error(`Invalid date: ${s}`);
  const d=new Date(`${s}T00:00:00.000Z`);
  if(Number.isNaN(d.valueOf())||dateKey(d)!==s) throw Error(`Invalid date: ${s}`);
  return d;
};
const weekdays=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const weekOrder=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

function mondayOnOrBefore(d){
  const x=new Date(d);
  const offset=(x.getUTCDay()+6)%7;
  x.setUTCDate(x.getUTCDate()-offset);
  return x;
}

function buildWeeks(start,end,holidays,slotDays){
  const excluded=new Set(holidays);
  const weeks=[];
  let cursor=mondayOnOrBefore(start);
  let number=0;

  while(cursor<=end){
    const weekStart=new Date(cursor);
    const weekEnd=new Date(cursor);
    weekEnd.setUTCDate(weekEnd.getUTCDate()+6);

    const dates=[];
    const calendarDates=[];
    for(let d=new Date(weekStart);d<=weekEnd;d.setUTCDate(d.getUTCDate()+1)){
      if(d<start || d>end) continue;
      const key=dateKey(d);
      const day=weekdays[d.getUTCDay()];
      const holiday=excluded.has(key);
      calendarDates.push({date:key,day,status:holiday?'HOLIDAY':'WORKING',title:holiday?'Holiday':''});
      if(slotDays.has(day) && !holiday) dates.push(key);
    }

    // Keep an academic week even if it has no classes, so the viewer retains
    // the real Monday-Sunday calendar structure used by the institution.
    weeks.push({
      weekNumber:++number,
      startDate:dateKey(weekStart),
      endDate:dateKey(weekEnd>end?end:weekEnd),
      calendarDates,
      workingDates:dates
    });

    cursor=new Date(weekEnd);
    cursor.setUTCDate(cursor.getUTCDate()+1);
  }
  return weeks;
}

function idOf(v){return String(v?._id??v??'');}
function subjectTarget(subject,weekCount){
  const explicit=Number(subject.totalSessions||0);
  if(explicit>0) return explicit;
  const weekly=Number(subject.classesPerWeek||0);
  return Math.max(0,weekly*weekCount);
}

function subjectEligibleWeeks(subject,weeks){
  if(!subject._programStartDate || !subject._programEndDate) return weeks.length;
  const start=String(subject._programStartDate).slice(0,10);
  const end=String(subject._programEndDate).slice(0,10);
  return weeks.filter(w=>w.workingDates.some(d=>d>=start && d<=end)).length;
}

function subjectWeeklyMax(subject,weekCount){
  const explicit=Number(subject.maxClassesPerWeek||0);
  if(explicit>0) return explicit;
  const weekly=Number(subject.classesPerWeek||0);
  if(weekly>0) return weekly;
  const total=subjectTarget(subject,weekCount);
  return Math.max(1,Math.ceil(total/Math.max(1,weekCount)));
}

// Create a balanced but non-identical weekly distribution for every subject.
// It deliberately does not require the same number of sessions every week.
function buildAllocation(subjects,weeks,slots,seed=0){
  const allocation=weeks.map(()=>new Map());
  const rng=()=>{
    let x=(seed+1)*1103515245+12345;
    seed=(x>>>0);
    return (seed%100000)/100000;
  };

  for(const subject of subjects){
    const eligibleWeekCount=subjectEligibleWeeks(subject,weeks);
    const total=subjectTarget(subject,eligibleWeekCount);
    if(!total) continue;
    const maxPerWeek=subjectWeeklyMax(subject,eligibleWeekCount);
    const start=subject._programStartDate ? String(subject._programStartDate).slice(0,10) : null;
    const end=subject._programEndDate ? String(subject._programEndDate).slice(0,10) : null;
    const activeSlots = (slots||[]).filter(s=>!s.isBreak && String(s.day)!=="Sunday");
    const slotsPerDay = new Map();
    for(const slot of activeSlots){
      const day=String(slot.day||"");
      slotsPerDay.set(day,(slotsPerDay.get(day)||0)+1);
    }
    const eligible=weeks.map((w,i)=>({
      i,
      capacity:w.workingDates
        .filter(d=>!start || (d>=start && d<=end))
        .reduce((n,d)=>n+(slotsPerDay.get(weekdays[parseDate(d).getUTCDay()])||0),0)
    })).filter(x=>x.capacity>0);
    if(!eligible.length) throw Error(`${subject.name}: no working dates are available in the academic session.`);

    const counts=Array(weeks.length).fill(0);
    let remaining=total;

    // Start from a balanced distribution, then shuffle the order of weeks so
    // consecutive weeks do not all receive the same count.
    const order=[...eligible].sort(()=>rng()-0.5);
    while(remaining>0){
      const candidates=order
        .filter(x=>counts[x.i]<maxPerWeek)
        .sort((a,b)=>counts[a.i]-counts[b.i] || rng()-0.5);
      if(!candidates.length) break;
      const x=candidates[0];
      counts[x.i]++;
      remaining--;
    }

    if(remaining>0){
      throw Error(`${subject.name}: total sessions ${total} cannot be distributed across ${weeks.length} weeks with a maximum of ${maxPerWeek} sessions per week. Increase Max Classes / Week or reduce Total Sessions.`);
    }

    counts.forEach((count,i)=>{if(count)allocation[i].set(idOf(subject),count)});
  }
  return allocation;
}

function sig(e){return `${e.date}|${e.startTime}|${e.endTime}|${idOf(e.subject)}|${idOf(e.section)}|${idOf(e.faculty)}`;}

async function generatePlan({session,holidays,faculty,subjects,sections,rooms,slots,settings,weeks}){
  const totalRequired=subjects.reduce((n,s)=>n+subjectTarget(s,weeks.length),0);
  const activeSlots=slots.filter(s=>!s.isBreak);
  const attempts=Math.min(12,Math.max(3,Number(settings?.sessionGenerationAttempts||6)));
  let best=null;

  for(let allocationAttempt=0;allocationAttempt<attempts;allocationAttempt++){
    let allocation;
    try{allocation=buildAllocation(subjects,weeks,activeSlots,allocationAttempt*7919+17);}catch(e){return {error:e.message};}

    const planned=[];
    let previous=new Set();
    let totalScheduled=0;
    let failed=null;

    for(let wi=0;wi<weeks.length;wi++){
      const week=weeks[wi];
      if(!week.workingDates.length){
        planned.push({...week,entries:[],variationPercent:100});
        continue;
      }

      const counts=allocation[wi];
      const weekSubjects=subjects
        .filter(s=>counts.get(idOf(s))>0)
        .map(s=>({...s,classesPerWeek:counts.get(idOf(s))}));

      if(!weekSubjects.length){
        planned.push({...week,entries:[],variationPercent:100});
        continue;
      }

      const availableDays=new Set(week.workingDates.map(d=>weekdays[parseDate(d).getUTCDay()]));
      const weekSlots=activeSlots.filter(s=>availableDays.has(s.day));
      const weekSubjectsWithWindows=weekSubjects.map(s=>{
        const start=s._programStartDate ? String(s._programStartDate).slice(0,10) : null;
        const end=s._programEndDate ? String(s._programEndDate).slice(0,10) : null;
        const allowedDays=[...new Set(week.workingDates.filter(d=>!start || (d>=start && d<=end)).map(d=>weekdays[parseDate(d).getUTCDay()]))];
        return {...s,allowedDays};
      }).filter(s=>s.allowedDays.length);
      const candidates=[];

      for(let trial=0;trial<4;trial++){
        const r=generateBestTimetable({
          faculty,subjects:weekSubjectsWithWindows,sections,rooms,slots:weekSlots,
          settings:{...settings,avoidSameSubjectSameDay:false},
          runs:Number(settings?.generationRuns||4),
          totalMaxMillis:Math.min(12000,Number(settings?.generationTimeLimitMs||10000)),
          perRunMillis:Math.min(4000,Number(settings?.generationTimeLimitMs||10000)),
          attemptsPerRun:Math.max(200,Number(settings?.generationAttempts||500))
        });
        const repeated=r.entries.filter(e=>previous.has(`${e.day}|${e.startTime}|${idOf(e.subject)}|${idOf(e.section)}|${idOf(e.faculty)}`)).length;
        candidates.push({r,repeated,quality:r.entries.length*100000-repeated*100+(r.optimization?.metrics?.optimizationScore||0)+Math.random()*50});
      }

      candidates.sort((a,b)=>b.quality-a.quality);
      const chosen=candidates[0];
      const expected=weekSubjectsWithWindows.reduce((n,s)=>n+Number(s.classesPerWeek||0),0);

      if(chosen.r.entries.length!==expected){
        failed=`Week ${week.weekNumber} (${week.startDate}–${week.endDate}) could only schedule ${chosen.r.entries.length}/${expected} planned classes. No partial plan saved.`;
        break;
      }

      const dateBuckets=new Map();
      for(const d of week.workingDates) dateBuckets.set(weekdays[parseDate(d).getUTCDay()],d);
      const mapped=chosen.r.entries.map(e=>({...e,date:dateBuckets.get(e.day)})).filter(e=>e.date);
      const repeated=chosen.repeated;
      const variationPercent=Math.round((1-repeated/Math.max(1,mapped.length))*100);
      previous=new Set(chosen.r.entries.map(e=>`${e.day}|${e.startTime}|${idOf(e.subject)}|${idOf(e.section)}|${idOf(e.faculty)}`));
      totalScheduled+=mapped.length;
      planned.push({...week,entries:mapped,variationPercent});
    }

    const quality=totalScheduled*1000+planned.reduce((n,w)=>n+(w.variationPercent||0),0);
    if(!best||quality>best.quality) best={planned,totalScheduled,quality,failed};
    if(!failed&&totalScheduled===totalRequired) return {planned,totalScheduled};
  }

  return {error:best?.failed||`Could only schedule ${best?.totalScheduled||0}/${totalRequired} total classes. Adjust subject session targets, faculty availability, rooms or time slots.`};
}

const populated='weeks.entries.section weeks.entries.subject weeks.entries.faculty weeks.entries.room';

router.get('/',async(req,res)=>{
  try{
    const sessionId=req.query.sessionId;
    if(!sessionId)return res.status(400).json({message:'sessionId required'});
    const list=await SessionPlan.find({academicSession:sessionId}).select('-weeks.entries').sort({version:-1}).lean();
    res.json(list);
  }catch(e){res.status(500).json({message:e.message});}
});

router.get('/:id',async(req,res)=>{
  try{
    const doc=await SessionPlan.findById(req.params.id).populate(populated);
    if(!doc)return res.status(404).json({message:'Session plan not found'});
    if(req.user?.role==='FACULTY') for(const w of doc.weeks) w.entries=w.entries.filter(e=>idOf(e.faculty)===String(req.user.faculty));
    else if(req.user?.role==='VIEWER') for(const w of doc.weeks) w.entries=w.entries.filter(e=>idOf(e.section)===String(req.user.section));
    res.json(doc);
  }catch(e){res.status(500).json({message:e.message});}
});

router.post('/generate',allowRoles('ADMIN','SCHEDULER'),async(req,res)=>{
  try{
    const session=await AcademicSession.findById(req.body.sessionId).lean();
    if(!session)return res.status(404).json({message:'Academic session not found.'});

    const programDates=Array.isArray(session.programDates)?session.programDates:[];
    let start=session.startDate?parseDate(dateKey(session.startDate)):null;
    let end=session.endDate?parseDate(dateKey(session.endDate)):null;
    if(programDates.length){
      const starts=programDates.map(x=>new Date(x.startDate)).filter(d=>!Number.isNaN(d.valueOf()));
      const ends=programDates.map(x=>new Date(x.endDate)).filter(d=>!Number.isNaN(d.valueOf()));
      if(!starts.length||!ends.length)return res.status(400).json({message:'Configure valid start and end dates for every program in this academic session.'});
      start=new Date(Math.min(...starts.map(d=>d.valueOf())));
      end=new Date(Math.max(...ends.map(d=>d.valueOf())));
    }
    if(!start||!end)return res.status(400).json({message:'Configure program-wise session start and end dates before generating.'});
    if(end<start||end-start>370*86400000)return res.status(400).json({message:'Academic session must be at most 371 days and end after its start.'});

    const requestedHolidays=Array.isArray(req.body.holidays)?req.body.holidays.map(String).filter(Boolean):[];
    const sessionHolidays=Array.isArray(session.holidayDates)?session.holidayDates.map(String).filter(Boolean):[];
    let holidays=[...new Set([...sessionHolidays,...requestedHolidays])];
    for(const d of holidays)parseDate(d);
    // Sunday is always a holiday. Persisting it here makes the generated
    // academic calendar explicit even when the user does not enter it.
    const sessionHolidaySet=new Set(holidays);
    const cursor=new Date(start);
    const finalHolidays=new Set(holidays);
    while(cursor<=end){
      if(cursor.getUTCDay()===0) finalHolidays.add(dateKey(cursor));
      cursor.setUTCDate(cursor.getUTCDate()+1);
    }
    holidays=[...finalHolidays].sort();

    const persistedHolidayDates=[...new Set([...sessionHolidays,...requestedHolidays])].filter(d=>{const x=parseDate(d); return x.getUTCDay()!==0;}).sort();
    await AcademicSession.findByIdAndUpdate(session._id,{holidayDates:persistedHolidayDates});

    const sections=await Section.find({ academicSession:session._id }).lean();
    const sectionIds=sections.map(x=>x._id);
    const [faculty,subjects,rooms,slots,settings,programs]=await Promise.all([
      Faculty.find().lean(),
      Subject.find({
        $and:[
          {$or:[{academicSession:session._id},{academicSession:null}]},
          {section:{$in:sectionIds}},
          {active:{$ne:false}}
        ]
      }).lean(),
      Room.find().lean(),TimeSlot.find().lean(),SchedulerSetting.findOne({key:'default'}).lean(),Program.find().lean()
    ]);
    const sessionOverride = settings && Array.isArray(settings.sessionOverrides)
      ? settings.sessionOverrides.find(x=>String(x.academicSession)===String(session._id))
      : null;
    const effectiveSettings = { ...(settings || {}), ...(sessionOverride || {}) };

    if(!faculty.length||!subjects.length||!sections.length||!rooms.length||!slots.length)return res.status(400).json({message:'Complete faculty, subjects, sections, rooms and time slots first for the selected academic session.'});

    const fids=new Set(faculty.map(x=>String(x._id)));
    const sids=new Set(sections.map(x=>String(x._id)));
    const invalid=subjects.filter(s=>!fids.has(String(s.faculty))||!sids.has(String(s.section)));
    if(invalid.length)return res.status(422).json({message:`${invalid.length} subjects have missing/invalid faculty or section mappings.`});

    const programMap=new Map();
    for(const p of programs){
      programMap.set(String(p._id),p);
      if(p.name)programMap.set(`name:${String(p.name).trim().toLowerCase()}`,p);
      if(p.code)programMap.set(`code:${String(p.code).trim().toLowerCase()}`,p);
    }
    const programDateMap=new Map((programDates||[]).map(x=>[String(x.program),x]));
    if(programDates.length){
      const sessionProgramIds=new Set();
      for(const section of sections){
        if(section.programId) sessionProgramIds.add(String(section.programId));
        else {
          const match=programs.find(p=>String(p.name||'').trim().toLowerCase()===String(section.program||'').trim().toLowerCase() || String(p.code||'').trim().toLowerCase()===String(section.program||'').trim().toLowerCase());
          if(match) sessionProgramIds.add(String(match._id));
        }
      }
      const missingPrograms=programs.filter(p=>p.active!==false && sessionProgramIds.has(String(p._id))).filter(p=>!programDateMap.has(String(p._id)));
      if(missingPrograms.length)return res.status(422).json({message:`Configure session dates for these programs: ${missingPrograms.map(p=>p.name).join(', ')}.`});
    }
    for(const subject of subjects){
      const section=sections.find(x=>String(x._id)===String(subject.section));
      const programKey=String(section?.program||'').trim().toLowerCase();
      const program=programMap.get(`name:${programKey}`)||programMap.get(`code:${programKey}`);
      const pd=program ? programDateMap.get(String(program._id)) : null;
      if(programDates.length && !pd){
        throw new Error(`${subject.name}: no program-wise session dates are configured for program "${section?.program||'Unknown'}".`);
      }
      if(pd){
        subject._programStartDate=dateKey(new Date(pd.startDate));
        subject._programEndDate=dateKey(new Date(pd.endDate));
      }
    }

    const activeSlots=slots.filter(s=>!s.isBreak);
    const slotDays=new Set(activeSlots.map(s=>s.day));
    const allWeeks=buildWeeks(start,end,holidays,slotDays);
    if(!allWeeks.length)return res.status(422).json({message:'No academic weeks could be created from the session dates.'});
    if(allWeeks.length>54)return res.status(400).json({message:'Too many academic weeks.'});

    const totalRequired=subjects.reduce((n,s)=>n+subjectTarget(s,subjectEligibleWeeks(s,allWeeks)),0);
    if(!totalRequired)return res.status(422).json({message:'Set Total Sessions or Classes / Week for your subjects.'});

    const result=await generatePlan({session,holidays,faculty,subjects,sections,rooms,slots,settings:effectiveSettings,weeks:allWeeks});
    if(result.error)return res.status(422).json({message:result.error});

    const last=await SessionPlan.findOne({academicSession:session._id}).sort({version:-1}).select('version');
    const version=(last?.version||0)+1;
    const doc=await SessionPlan.create({
      academicSession:session._id,
      version,
      status:'DRAFT',
      isCurrent:true,
      holidays,
      weeks:result.planned,
      totalEntries:result.totalScheduled,
      createdBy:req.user?.username||''
    });

    res.status(201).json({id:doc._id,version,weeks:result.planned.length,totalEntries:result.totalScheduled});
  }catch(e){res.status(500).json({message:e.message});}
});

router.patch('/:id/publish',allowRoles('ADMIN','SCHEDULER'),async(req,res)=>{
  try{
    const doc=await SessionPlan.findById(req.params.id);
    if(!doc)return res.status(404).json({message:'Not found'});
    if(doc.status!=='DRAFT')return res.status(409).json({message:'Already published'});
    await SessionPlan.updateMany({academicSession:doc.academicSession},{$set:{isCurrent:false}});
    doc.isCurrent=true;doc.status='PUBLISHED';await doc.save();
    res.json({message:'Session plan published',id:doc._id});
  }catch(e){res.status(500).json({message:e.message});}
});

export default router;
