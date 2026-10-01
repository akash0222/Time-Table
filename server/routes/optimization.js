import express from "express";
import Timetable from "../models/Timetable.js";
import Faculty from "../models/Faculty.js";
import Subject from "../models/Subject.js";
import Section from "../models/Section.js";
import Room from "../models/Room.js";
import TimeSlot from "../models/TimeSlot.js";
import SchedulerSetting from "../models/SchedulerSetting.js";
import AuditLog from "../models/AuditLog.js";
import Notification from "../models/Notification.js";

const router = express.Router();
const days = ["Monday","Tuesday","Wednesday","Thursday","Friday"];
const norm = v => String(v ?? "").trim().toLowerCase();
const id = v => String(v?._id ?? v ?? "");

function slotBlocks(slots, day, startOrder, duration){
  const ds = slots.filter(s=>s.day===day && !s.isBreak).sort((a,b)=>Number(a.order)-Number(b.order));
  const idx = ds.findIndex(s=>Number(s.order)===Number(startOrder));
  if(idx<0) return [];
  const block=ds.slice(idx,idx+Math.max(1,Number(duration||1)));
  if(block.length!==Math.max(1,Number(duration||1))) return [];
  for(let i=1;i<block.length;i++) if(Number(block[i].order)!==Number(block[i-1].order)+1) return [];
  return block;
}

function overlaps(a, b){
  if(a.day!==b.day) return false;
  const as=Number(a.order||0), ae=as+Math.max(1,Number(a.duration||1));
  const bs=Number(b.order||0), be=bs+Math.max(1,Number(b.duration||1));
  return as<be && bs<ae;
}

function availableFaculty(f, day, block){
  const allowed=Array.isArray(f?.availableDays)?f.availableDays.map(norm).filter(Boolean):[];
  if(allowed.length && !allowed.includes(norm(day))) return false;
  const unavailable=new Set((f?.unavailableSlots||[]).map(x=>`${norm(x.day)}|${x.startTime}-${x.endTime}`));
  return !block.some(s=>unavailable.has(`${norm(s.day)}|${s.startTime}-${s.endTime}`));
}

function maxRun(entries, field, ownerId, day){
  const orders=[];
  for(const e of entries){
    if(id(e[field])!==String(ownerId)||e.day!==day) continue;
    for(let i=0;i<Math.max(1,Number(e.duration||1));i++) orders.push(Number(e.order||0)+i);
  }
  const x=[...new Set(orders)].sort((a,b)=>a-b); let best=0,run=0,prev=null;
  for(const n of x){if(prev!==null&&n===prev+1)run++;else run=1;best=Math.max(best,run);prev=n;}
  return best;
}

async function context(){
  const [timetable,faculty,subjects,sections,rooms,slots,settings]=await Promise.all([
    Timetable.findOne({isCurrent:true}).sort({createdAt:-1}), Faculty.find().lean(), Subject.find().lean(),
    Section.find().lean(), Room.find().lean(), TimeSlot.find({isBreak:{$ne:true}}).sort({day:1,order:1}).lean(), SchedulerSetting.findOne({key:"default"}).lean()
  ]);
  return {timetable,faculty,subjects,sections,rooms,slots,settings:settings||{maxConsecutiveFaculty:2,maxConsecutiveSection:3,avoidSameSubjectSameDay:true}};
}

function candidateFor(entry, subject, faculty, section, rooms, slots, entries, settings, limit=8){
  const out=[];
  const wanted=norm(subject?.roomType||"Classroom");
  const matchingRooms=rooms.filter(r=>wanted==="any"||norm(r.type||"Classroom")===wanted);
  const originalRoom=id(entry?.room);
  for(const day of days){
    const allowedDays=Array.isArray(faculty?.availableDays)?faculty.availableDays.map(norm).filter(Boolean):[];
    if(allowedDays.length && !allowedDays.includes(norm(day))) continue;
    const ds=slots.filter(s=>s.day===day).sort((a,b)=>Number(a.order)-Number(b.order));
    for(const slot of ds){
      const block=slotBlocks(slots,day,slot.order,entry?.duration||subject?.duration||1);
      if(!block.length) continue;
      const fake={...entry,day,order:Number(block[0].order),duration:block.length};
      const others=entries.filter(e=>id(e)!==id(entry));
      if(others.some(e=>overlaps(fake,e)&&id(e.faculty)===id(faculty))) continue;
      if(others.some(e=>overlaps(fake,e)&&id(e.section)===id(section))) continue;
      if(!availableFaculty(faculty,day,block)) continue;
      const fDayClasses=others.filter(e=>id(e.faculty)===id(faculty)&&e.day===day).length;
      if(fDayClasses+1>Number(faculty?.maxClassesPerDay||99)) continue;
      const fDays=new Set(others.filter(e=>id(e.faculty)===id(faculty)).map(e=>e.day)); fDays.add(day);
      if(fDays.size>Number(faculty?.maxWorkingDays||7)) continue;
      const sDayClasses=others.filter(e=>id(e.section)===id(section)&&e.day===day).length;
      if(sDayClasses+1>Number(section?.maxClassesPerDay||99)) continue;
      if(maxRun(others,"faculty",faculty._id,day)>Number(settings?.maxConsecutiveFaculty||2)) continue;
      if(maxRun(others,"section",section._id,day)>Number(settings?.maxConsecutiveSection||3)) continue;
      if(settings?.avoidSameSubjectSameDay && others.some(e=>id(e.subject)===id(subject)&&e.day===day)) continue;
      const roomOptions=matchingRooms.filter(r=>!others.some(e=>id(e.room)===id(r)&&overlaps(fake,e)));
      if(!roomOptions.length) continue;
      const room=roomOptions.find(r=>id(r)===originalRoom)||roomOptions[0];
      const distance=Math.abs(Number(entry?.order||0)-Number(block[0].order))+Math.abs(days.indexOf(entry?.day)-days.indexOf(day));
      let score=100-distance*5;
      if(day===entry?.day)score+=15;
      if(id(room)===originalRoom)score+=10;
      out.push({day,startTime:block[0].startTime,endTime:block.at(-1).endTime,order:Number(block[0].order),duration:block.length,roomId:room._id,room:room.name,score});
      if(out.length>=limit*3) break;
    }
    if(out.length>=limit*3) break;
  }
  return out.sort((a,b)=>b.score-a.score).slice(0,limit);
}

router.get("/", async (_req,res)=>{
  try{
    const c=await context();
    if(!c.timetable) return res.json({hasTimetable:false,suggestions:[],summary:{issues:0,suggestions:0}});
    const entries=c.timetable.entries||[];
    const fMap=new Map(c.faculty.map(x=>[id(x),x])), sMap=new Map(c.sections.map(x=>[id(x),x])), subMap=new Map(c.subjects.map(x=>[id(x),x]));
    const suggestions=[]; const issueKeys=new Set();
    const add=(type,entry,subject,reason)=>{
      const key=`${type}|${id(entry)}`; if(issueKeys.has(key)) return; issueKeys.add(key);
      const f=fMap.get(id(subject?.faculty||entry?.faculty)), sec=sMap.get(id(subject?.section||entry?.section));
      const candidates=candidateFor(entry||{faculty:f?._id,section:sec?._id,subject:subject?._id,duration:subject?.duration||1},subject,f,sec,c.rooms,c.slots,entries,c.settings,5);
      if(candidates.length) suggestions.push({type,entryId:entry?._id||null,subject:subject?.name||"Unscheduled class",faculty:f?.name||"",section:sec?.name||"",reason,candidates});
    };

    // Existing hard conflicts.
    for(let i=0;i<entries.length;i++) for(let j=i+1;j<entries.length;j++){
      const a=entries[i],b=entries[j]; if(!overlaps(a,b)) continue;
      if(id(a.faculty)===id(b.faculty)) add("FACULTY_CONFLICT",a,subMap.get(id(a.subject)),`${fMap.get(id(a.faculty))?.name||"Faculty"} is double-booked.`);
      if(id(a.section)===id(b.section)) add("SECTION_CONFLICT",a,subMap.get(id(a.subject)),`${sMap.get(id(a.section))?.name||"Section"} is double-booked.`);
      if(id(a.room)===id(b.room)) add("ROOM_CONFLICT",a,subMap.get(id(a.subject)),`${c.rooms.find(r=>id(r)===id(a.room))?.name||"Room"} is double-booked.`);
    }

    // Coverage gaps: suggest a placement for each missing weekly session.
    const counts=new Map(); entries.forEach(e=>counts.set(id(e.subject),(counts.get(id(e.subject))||0)+1));
    for(const subject of c.subjects){
      const missing=Math.max(0,Number(subject.classesPerWeek||0)-(counts.get(id(subject))||0));
      for(let i=0;i<missing;i++) add("UNSCHEDULED",null,subject,`${subject.name}: ${counts.get(id(subject))||0}/${subject.classesPerWeek||0} weekly classes scheduled.`);
    }

    // Availability / room-type issues on existing entries.
    for(const e of entries){
      const sub=subMap.get(id(e.subject)), f=fMap.get(id(e.faculty)), sec=sMap.get(id(e.section)), room=c.rooms.find(r=>id(r)===id(e.room));
      if(sub&&f&&sec){
        const block=slotBlocks(c.slots,e.day,e.order,e.duration||sub.duration||1);
        if(!availableFaculty(f,e.day,block)) add("FACULTY_AVAILABILITY",e,sub,`${f.name} is unavailable for this class time.`);
        if(room&&sub.roomType!=="Any"&&norm(room.type)!==norm(sub.roomType)) add("ROOM_TYPE",e,sub,`${sub.name} requires ${sub.roomType}; ${room.name} is ${room.type}.`);
      }
    }
    const unique=suggestions.slice(0,100);
    res.json({hasTimetable:true,status:c.timetable.status,version:c.timetable.version,versionLabel:c.timetable.versionLabel,summary:{issues:unique.length,suggestions:unique.reduce((n,x)=>n+x.candidates.length,0)},suggestions:unique});
  }catch(e){res.status(500).json({message:e.message});}
});

router.post("/apply", async (req,res)=>{
  try{
    const {entryId,day,startTime,roomId}=req.body||{};
    if(!entryId||!day||!startTime) return res.status(400).json({message:"entryId, day and startTime are required."});
    const c=await context(); if(!c.timetable)return res.status(404).json({message:"No current timetable found."});
    if(c.timetable.status!=="DRAFT")return res.status(409).json({message:`Timetable is ${c.timetable.status}. Return it to DRAFT before optimization changes.`});
    const entry=c.timetable.entries.id(entryId); if(!entry)return res.status(404).json({message:"Timetable class not found."});
    const sub=c.subjects.find(x=>id(x)===id(entry.subject)), f=c.faculty.find(x=>id(x)===id(entry.faculty)), sec=c.sections.find(x=>id(x)===id(entry.section));
    const blockSlots=c.slots.filter(s=>s.day===day).sort((a,b)=>Number(a.order)-Number(b.order));
    const start=blockSlots.find(s=>s.startTime===startTime); if(!start)return res.status(400).json({message:"Start time is not a configured slot."});
    const candidates=candidateFor({...entry.toObject(),day:entry.day,order:entry.order},sub,f,sec,c.rooms,c.slots,c.timetable.entries.filter(e=>id(e)!==id(entry)),c.settings,20);
    const candidate=candidates.find(x=>x.day===day&&x.startTime===startTime&&(!roomId||String(x.roomId)===String(roomId)));
    if(!candidate)return res.status(409).json({message:"The requested optimization placement is no longer valid. Refresh suggestions and try again."});
    entry.day=candidate.day; entry.startTime=candidate.startTime; entry.endTime=candidate.endTime; entry.order=candidate.order; entry.duration=candidate.duration; if(candidate.roomId)entry.room=candidate.roomId;
    await c.timetable.save();
    await AuditLog.create({action:"APPLY_OPTIMIZATION",category:"TIMETABLE",description:`Applied optimization suggestion for ${sub?.name||"class"}`,user:req.user?.id||null,username:req.user?.username||"",role:req.user?.role||"",targetType:"Timetable",targetId:String(c.timetable._id),metadata:{entryId:String(entry._id),day:candidate.day,startTime:candidate.startTime,roomId:String(candidate.roomId||"")},ipAddress:req.ip||""});
    const recipients=[...new Set([String(entry.faculty||""),String(entry.section||"")].filter(Boolean))];
    for(const fid of recipients){
      const isFaculty=String(entry.faculty||"")===fid;
      await Notification.create({title:"Timetable optimized",message:`${sub?.name||"A class"} was automatically moved to ${candidate.day} ${candidate.startTime}${candidate.room?` in ${candidate.room}`:""}. Please check your timetable.`,priority:"IMPORTANT",audience:isFaculty?"FACULTY":"SECTION",[isFaculty?"faculty":"section"]:fid,published:true,startAt:new Date(),createdBy:req.user?.id||null,sourceType:"TIMETABLE",sourceId:String(c.timetable._id),eventKey:"OPTIMIZATION_APPLIED"});
    }
    res.json({message:"Optimization suggestion applied successfully.",timetable:c.timetable,applied:candidate});
  }catch(e){res.status(500).json({message:e.message});}
});

export default router;
