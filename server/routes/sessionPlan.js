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
import User from '../models/User.js';
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
    if(req.user?.role==='FACULTY'){
      // Resolve the current assignment from MongoDB rather than trusting a
      // potentially stale JWT mapping.
      const account=await User.findById(req.user?.id).select('faculty active').lean();
      if(!account||account.active===false){
        return res.status(401).json({message:'User account is inactive or no longer available. Please sign in again.'});
      }
      const assignedFacultyId=String(account.faculty||'');
      if(!assignedFacultyId){
        return res.status(400).json({message:'No Faculty is mapped to this account. Ask an administrator to assign a faculty member.'});
      }
      for(const w of doc.weeks) w.entries=w.entries.filter(e=>idOf(e.faculty)===assignedFacultyId);
    }else if(req.user?.role==='VIEWER'){
      // Section IDs are intentionally loaded from the user record; the JWT
      // does not currently contain a section claim.
      const account=await User.findById(req.user?.id).select('section active').lean();
      if(!account||account.active===false){
        return res.status(401).json({message:'User account is inactive or no longer available. Please sign in again.'});
      }
      const assignedSectionId=String(account.section||'');
      if(!assignedSectionId){
        return res.status(400).json({message:'No Section is mapped to this Viewer account. Ask an administrator to assign a section.'});
      }
      for(const w of doc.weeks) w.entries=w.entries.filter(e=>idOf(e.section)===assignedSectionId);
    }
    res.json(doc);
  }catch(e){res.status(500).json({message:e.message});}
});


router.get('/:id/export/:format',async(req,res)=>{
  try{
    const format=String(req.params.format||'').toLowerCase();
    if(!['excel','pdf'].includes(format)){
      return res.status(400).json({message:'Export format must be excel or pdf.'});
    }
    const doc=await SessionPlan.findById(req.params.id)
      .populate(populated)
      .populate('academicSession','name startDate endDate programDates');
    if(!doc)return res.status(404).json({message:'Session plan not found.'});

    // Match the role-scoped view permissions used by the session-plan viewer.
    if(req.user?.role==='FACULTY'){
      const account=await User.findById(req.user?.id).select('faculty active').lean();
      if(!account||account.active===false)return res.status(401).json({message:'User account is inactive or no longer available. Please sign in again.'});
      const assignedFacultyId=String(account.faculty||'');
      if(!assignedFacultyId)return res.status(400).json({message:'No Faculty is mapped to this account. Ask an administrator to assign a faculty member.'});
      for(const week of doc.weeks)week.entries=week.entries.filter(entry=>idOf(entry.faculty)===assignedFacultyId);
    }else if(req.user?.role==='VIEWER'){
      const account=await User.findById(req.user?.id).select('section active').lean();
      if(!account||account.active===false)return res.status(401).json({message:'User account is inactive or no longer available. Please sign in again.'});
      const assignedSectionId=String(account.section||'');
      if(!assignedSectionId)return res.status(400).json({message:'No Section is mapped to this Viewer account. Ask an administrator to assign a section.'});
      for(const week of doc.weeks)week.entries=week.entries.filter(entry=>idOf(entry.section)===assignedSectionId);
    }

    const requestedSectionId=String(req.query.sectionId||'');
    const requestedFacultyId=String(req.query.facultyId||'');
    const allEntries=[];
    for(const week of doc.weeks||[]){
      for(const entry of week.entries||[]){
        const plainEntry=typeof entry.toObject==='function'?entry.toObject():entry;
        allEntries.push({...plainEntry,weekNumber:Number(week.weekNumber||0)});
      }
    }
    const selectedEntries=allEntries.filter(entry=>
      (!requestedSectionId||idOf(entry.section)===requestedSectionId)&&
      (!requestedFacultyId||idOf(entry.faculty)===requestedFacultyId)
    ).sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||
      String(a.startTime||'').localeCompare(String(b.startTime||'')));
    if(!selectedEntries.length){
      return res.status(404).json({message:'No scheduled classes found for this session or selected filters.'});
    }

    const sessionName=String(doc.academicSession?.name||'Academic Session');
    const cleanName=value=>String(value||'').trim().replace(/[^a-z0-9_-]+/gi,'-').replace(/^-+|-+$/g,'').slice(0,55)||'session';
    const fileBase='full-session-timetable-'+cleanName(sessionName)+'-v'+String(doc.version||1);
    const sectionLabel=selectedEntries.find(entry=>requestedSectionId&&idOf(entry.section)===requestedSectionId)?.section?.name||'All sections';
    const facultyLabel=selectedEntries.find(entry=>requestedFacultyId&&idOf(entry.faculty)===requestedFacultyId)?.faculty?.name||'All faculty';
    const programOf=entry=>entry.section?.program||entry.section?.programId?.name||'';

    const scheduleRows=selectedEntries.map(entry=>({
      Date:entry.date||'',Day:entry.day||'',Week:entry.weekNumber||'',
      Start:entry.startTime||'',End:entry.endTime||'',Program:programOf(entry),
      Semester:entry.section?.semester||'',Section:entry.section?.name||'',
      Subject:entry.subject?.name||'',SubjectCode:entry.subject?.code||'',
      Faculty:entry.faculty?.name||'',Room:entry.room?.name||'',
      Duration:Number(entry.duration||1)
    }));

    const holidaySet=new Set((doc.holidays||[]).map(String));
    const dayName=date=>new Date(String(date)+'T00:00:00.000Z').toLocaleDateString('en-US',{weekday:'long',timeZone:'UTC'});
    const calendarItems=(doc.weeks||[]).flatMap(week=>{
      const weekNumber=Number(week.weekNumber||0);
      if(Array.isArray(week.calendarDates)&&week.calendarDates.length){
        return week.calendarDates.map(item=>{
          const plain=typeof item.toObject==='function'?item.toObject():item;
          const date=String(plain.date||'');
          const day=String(plain.day||(date?dayName(date):''));
          const holiday=String(plain.status||'').toUpperCase()==='HOLIDAY'||holidaySet.has(date)||day==='Sunday';
          return {...plain,date,day,status:holiday?'HOLIDAY':'WORKING',weekNumber};
        });
      }
      // Fallback for older versions without calendarDates.
      const dates=new Set([
        ...(week.workingDates||[]).map(String),
        ...(week.entries||[]).map(entry=>String(entry.date||'')).filter(Boolean)
      ]);
      return [...dates].sort().map(date=>{
        const day=dayName(date);
        const holiday=holidaySet.has(date)||day==='Sunday';
        return {date,day,status:holiday?'HOLIDAY':'WORKING',title:holiday?'Holiday':'',weekNumber};
      });
    }).filter(item=>item.date).sort((a,b)=>String(a.date).localeCompare(String(b.date)));

    const calendarByDate=new Map(calendarItems.map(item=>[String(item.date),item]));
    for(const entry of selectedEntries){
      const date=String(entry.date||'');
      if(date&&!calendarByDate.has(date)){
        const day=String(entry.day||dayName(date));
        const holiday=holidaySet.has(date)||day==='Sunday';
        calendarByDate.set(date,{date,day,status:holiday?'HOLIDAY':'WORKING',weekNumber:Number(entry.weekNumber||0)});
      }
    }
    const orderedCalendar=[...calendarByDate.values()].sort((a,b)=>String(a.date).localeCompare(String(b.date)));

    const timeSlots=[...new Map(selectedEntries.map(entry=>{
      const startTime=String(entry.startTime||'');
      const endTime=String(entry.endTime||'');
      const order=Number(entry.order||0);
      return [startTime+'|'+endTime+'|'+order,{key:startTime+'|'+endTime+'|'+order,startTime,endTime,order}];
    })).values()].sort((a,b)=>a.order-b.order||a.startTime.localeCompare(b.startTime)||a.endTime.localeCompare(b.endTime));

    const entriesByCell=new Map();
    for(const entry of selectedEntries){
      const date=String(entry.date||'');
      if(!date)continue;
      const key=date+'|'+String(entry.startTime||'')+'|'+String(entry.endTime||'')+'|'+Number(entry.order||0);
      if(!entriesByCell.has(key))entriesByCell.set(key,[]);
      entriesByCell.get(key).push(entry);
    }
    const cellText=items=>{
      if(!items||!items.length)return '—';
      return items.map(entry=>{
        const code=String(entry.subject?.code||entry.subject?.name||'Subject');
        const name=String(entry.subject?.name||'');
        const faculty=String(entry.faculty?.name||'Faculty');
        const section=String(entry.section?.name||'Section');
        const room=String(entry.room?.name||'Room');
        const lines=[code];
        if(name&&name!==code)lines.push(name);
        lines.push(faculty,section+' · '+room);
        if(Number(entry.duration||1)>1)lines.push(String(entry.duration)+' periods');
        return lines.join('\n');
      }).join('\n\n');
    };
    const gridRows=orderedCalendar.map(item=>{
      const date=String(item.date||'');
      const holiday=String(item.status||'').toUpperCase()==='HOLIDAY'||holidaySet.has(date)||item.day==='Sunday';
      const cells=timeSlots.map(slot=>{
        if(holiday)return 'Holiday';
        const key=date+'|'+slot.startTime+'|'+slot.endTime+'|'+slot.order;
        return cellText(entriesByCell.get(key));
      });
      return {weekNumber:Number(item.weekNumber||0),date,day:String(item.day||dayName(date)),holiday,cells,
        classes:selectedEntries.filter(entry=>String(entry.date||'')===date).length};
    });

    const calendarRows=gridRows.map(row=>({
      Week:row.weekNumber||'',Date:row.date,Day:row.day,
      Status:row.holiday?'HOLIDAY':'WORKING',Note:row.holiday?'Holiday':'',
      ScheduledClasses:row.classes
    }));

    if(format==='excel'){
      const ExcelJS=(await import('exceljs')).default;
      const workbook=new ExcelJS.Workbook();
      workbook.creator='Time Table';
      workbook.subject='Full academic session timetable';
      workbook.title=sessionName+' - Full Session Timetable';
      workbook.created=new Date();

      // This is the primary sheet and mirrors the date-by-time grid on screen.
      const gridSheet=workbook.addWorksheet('Session Grid');
      gridSheet.columns=[
        {header:'Week',key:'Week',width:8},
        {header:'Week / Date',key:'Date',width:15},
        {header:'Day',key:'Day',width:14},
        ...timeSlots.map((slot,index)=>({header:slot.startTime+'–'+slot.endTime,key:'slot'+index,width:29}))
      ];
      for(const gridRow of gridRows){
        const dataRow={Week:gridRow.weekNumber,Date:gridRow.date,Day:gridRow.day};
        gridRow.cells.forEach((value,index)=>{dataRow['slot'+index]=value;});
        const excelRow=gridSheet.addRow(dataRow);
        const lineCount=Math.max(1,...gridRow.cells.map(value=>String(value||'').split('\n').length));
        excelRow.height=Math.min(240,Math.max(30,lineCount*13+6));
        excelRow.eachCell(cell=>{
          cell.alignment={vertical:'middle',wrapText:true};
          cell.border={
            top:{style:'thin',color:{argb:'FFE2E8F0'}},
            bottom:{style:'thin',color:{argb:'FFE2E8F0'}},
            left:{style:'thin',color:{argb:'FFE2E8F0'}},
            right:{style:'thin',color:{argb:'FFE2E8F0'}}
          };
        });
        if(gridRow.holiday){
          excelRow.eachCell(cell=>{cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFFEDD5'}};});
        }else{
          gridRow.cells.forEach((value,index)=>{
            if(value!=='—'){
              excelRow.getCell(4+index).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFEFF6FF'}};
            }
          });
        }
      }
      gridSheet.views=[{state:'frozen',ySplit:1,xSplit:3}];
      gridSheet.getRow(1).height=25;
      gridSheet.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};
      gridSheet.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF1D4ED8'}};
      gridSheet.autoFilter={from:{row:1,column:1},to:{row:1,column:gridSheet.columnCount}};
      gridSheet.pageSetup={orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:'1:1'};
      gridSheet.headerFooter.oddHeader='&B'+sessionName+' - Full Academic Session Timetable';
      gridSheet.headerFooter.oddFooter='Page &P of &N';

      const scheduleSheet=workbook.addWorksheet('Schedule Details');
      scheduleSheet.columns=[
        {header:'Date',key:'Date',width:13},{header:'Day',key:'Day',width:14},
        {header:'Week',key:'Week',width:9},{header:'Start',key:'Start',width:10},
        {header:'End',key:'End',width:10},{header:'Program',key:'Program',width:24},
        {header:'Semester',key:'Semester',width:12},{header:'Section',key:'Section',width:18},
        {header:'Subject',key:'Subject',width:28},{header:'Subject Code',key:'SubjectCode',width:16},
        {header:'Faculty',key:'Faculty',width:24},{header:'Room',key:'Room',width:15},
        {header:'Duration',key:'Duration',width:11}
      ];
      scheduleSheet.addRows(scheduleRows);

      const calendarSheet=workbook.addWorksheet('Academic Calendar');
      calendarSheet.columns=[
        {header:'Week',key:'Week',width:9},{header:'Date',key:'Date',width:13},
        {header:'Day',key:'Day',width:14},{header:'Status',key:'Status',width:14},
        {header:'Note',key:'Note',width:28},{header:'Scheduled Classes',key:'ScheduledClasses',width:20}
      ];
      calendarSheet.addRows(calendarRows);

      const summarySheet=workbook.addWorksheet('Summary');
      summarySheet.columns=[{header:'Item',key:'Item',width:28},{header:'Value',key:'Value',width:48}];
      summarySheet.addRows([
        {Item:'Academic Session',Value:sessionName},
        {Item:'Version',Value:doc.version||1},
        {Item:'Status',Value:doc.status||'DRAFT'},
        {Item:'First Date',Value:orderedCalendar[0]?.date||doc.weeks?.[0]?.startDate||''},
        {Item:'Last Date',Value:orderedCalendar[orderedCalendar.length-1]?.date||doc.weeks?.[doc.weeks.length-1]?.endDate||''},
        {Item:'Academic Weeks',Value:doc.weeks?.length||0},
        {Item:'Scheduled Classes',Value:selectedEntries.length},
        {Item:'Section Filter',Value:requestedSectionId?sectionLabel:'All sections'},
        {Item:'Faculty Filter',Value:requestedFacultyId?facultyLabel:'All faculty'}
      ]);

      for(const sheet of [scheduleSheet,calendarSheet,summarySheet]){
        sheet.views=[{state:'frozen',ySplit:1}];
        sheet.getRow(1).height=23;
        sheet.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};
        sheet.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF1D4ED8'}};
        sheet.autoFilter={from:{row:1,column:1},to:{row:1,column:sheet.columnCount}};
        sheet.pageSetup={orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:'1:1'};
      }
      for(let rowIndex=2;rowIndex<=calendarSheet.rowCount;rowIndex++){
        const excelRow=calendarSheet.getRow(rowIndex);
        if(excelRow.getCell(4).value==='HOLIDAY'){
          excelRow.eachCell(cell=>{cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFFEDD5'}};});
        }
      }
      const buffer=Buffer.from(await workbook.xlsx.writeBuffer());
      res.setHeader('Content-Disposition','attachment; filename="'+fileBase+'.xlsx"');
      res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(buffer);
      return;
    }

    // A3 landscape matches the wide period grid displayed by the timetable page.
    const PDFDocument=(await import('pdfkit')).default;
    res.setHeader('Content-Disposition','attachment; filename="'+fileBase+'.pdf"');
    res.setHeader('Content-Type','application/pdf');
    const pdf=new PDFDocument({margin:24,size:'A3',layout:'landscape'});
    pdf.pipe(res);
    const pageWidth=pdf.page.width;
    const pageHeight=pdf.page.height;
    const left=24;
    const right=24;
    const usableWidth=pageWidth-left-right;
    const fixedWidths=[34,70,56];
    const columns=[
      {label:'Week',width:fixedWidths[0]},
      {label:'Week / Date',width:fixedWidths[1]},
      {label:'Day',width:fixedWidths[2]},
      ...timeSlots.map(slot=>({label:slot.startTime+'–'+slot.endTime,width:(usableWidth-fixedWidths.reduce((sum,n)=>sum+n,0))/Math.max(1,timeSlots.length)}))
    ];
    const tableWidth=columns.reduce((sum,column)=>sum+column.width,0);
    const titleText='Full Academic Session Timetable';
    const metaText=sessionName+' · Version '+String(doc.version||1)+' · '+String(doc.status||'DRAFT')+' · '+selectedEntries.length+' classes';
    const filterText='Section: '+(requestedSectionId?sectionLabel:'All sections')+' · Faculty: '+(requestedFacultyId?facultyLabel:'All faculty');
    let y=24;
    function drawPageTitle(firstPage=false){
      pdf.font('Helvetica-Bold').fontSize(firstPage?17:10).fillColor('#172033')
        .text(titleText,left,y,{width:usableWidth,align:'center',lineBreak:false});
      y+=firstPage?24:16;
      if(firstPage){
        pdf.font('Helvetica').fontSize(9).fillColor('#475569')
          .text(metaText,left,y,{width:usableWidth,align:'center',lineBreak:false});
        y+=14;
        pdf.text(filterText,left,y,{width:usableWidth,align:'center',lineBreak:false});
        y+=19;
      }else{
        pdf.font('Helvetica').fontSize(7).fillColor('#475569')
          .text(metaText,left,y,{width:usableWidth,align:'center',lineBreak:false});
        y+=13;
      }
    }
    function drawHeader(){
      const headerHeight=24;
      pdf.save().fillColor('#EAF1FF').rect(left,y,tableWidth,headerHeight).fill().restore();
      pdf.strokeColor('#CBD5E1').lineWidth(0.45).rect(left,y,tableWidth,headerHeight).stroke();
      let x=left;
      pdf.font('Helvetica-Bold').fontSize(7).fillColor('#172033');
      for(const column of columns){
        pdf.text(column.label,x+3,y+6,{width:column.width-6,height:13,lineBreak:false});
        x+=column.width;
        pdf.strokeColor('#CBD5E1').lineWidth(0.35).moveTo(x,y).lineTo(x,y+headerHeight).stroke();
      }
      y+=headerHeight;
    }
    drawPageTitle(true);
    drawHeader();
    const fontSize=timeSlots.length>10?5.2:6.1;
    function drawGridRow(row){
      const cellValues=['W'+String(row.weekNumber||''),row.date,row.day,...row.cells];
      const heights=cellValues.map((value,index)=>{
        const width=columns[index].width-7;
        pdf.font('Helvetica').fontSize(fontSize);
        return pdf.heightOfString(String(value??'—'),{width:Math.max(10,width),fontSize,lineGap:0.5});
      });
      const rowHeight=Math.max(36,Math.ceil(Math.max(...heights))+8);
      if(y+rowHeight>pageHeight-24){
        pdf.addPage({size:'A3',layout:'landscape',margin:24});
        y=24;
        drawPageTitle(false);
        drawHeader();
      }
      let x=left;
      for(let index=0;index<columns.length;index++){
        const column=columns[index];
        const value=String(cellValues[index]??'—');
        const isHoliday=row.holiday;
        const hasClass=index>=3&&value!=='—'&&value!=='Holiday';
        const fill=isHoliday?'#FFF1E6':hasClass?'#EFF6FF':'#FFFFFF';
        pdf.save().fillColor(fill).rect(x,y,column.width,rowHeight).fill().restore();
        pdf.strokeColor('#D8E0EA').lineWidth(0.4).rect(x,y,column.width,rowHeight).stroke();
        pdf.font('Helvetica').fontSize(index<3?6.2:fontSize).fillColor(isHoliday&&index>=3?'#9A3412':'#172033');
        pdf.text(value,x+3,y+4,{width:Math.max(8,column.width-6),height:rowHeight-8,lineGap:0.5});
        x+=column.width;
      }
      y+=rowHeight;
    }
    for(const gridRow of gridRows)drawGridRow(gridRow);
    pdf.end();
  }catch(e){
    if(res.headersSent){res.end();return;}
    res.status(e.status||500).json({message:e.message});
  }
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
      // Program ObjectId is the canonical mapping. Text names/codes are
      // only a compatibility fallback for legacy sections.
      const sectionProgramId=String(section?.programId?._id||section?.programId||'');
      const program=programMap.get(sectionProgramId)
        || programMap.get(`name:${String(section?.program||'').trim().toLowerCase()}`)
        || programMap.get(`code:${String(section?.program||'').trim().toLowerCase()}`);
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
