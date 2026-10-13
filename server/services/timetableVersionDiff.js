const DAY_ORDER = new Map(["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"].map((day,index)=>[day,index]));

function idOf(value) {
  if(value===null||value===undefined)return "";
  if(typeof value==="object"&&value._id!==undefined)return String(value._id);
  return String(value);
}

function labelOf(value, fallback = "Unassigned") {
  if(!value)return fallback;
  if(typeof value==="object")return String(value.name||value.code||value.label||value._id||fallback);
  return String(value||fallback);
}

function entryKey(entry) {
  const section=idOf(entry.section);
  const subject=idOf(entry.subject);
  return section&&subject ? section+"|"+subject : "entry|"+idOf(entry._id);
}

function slotSort(entry) {
  return [
    DAY_ORDER.get(String(entry.day||""))??99,
    Number(entry.order||0),
    String(entry.startTime||"")
  ];
}

function compareSort(a,b) {
  const left=slotSort(a),right=slotSort(b);
  return left[0]-right[0]||left[1]-right[1]||left[2].localeCompare(right[2]);
}

function describe(entry) {
  return {
    day:String(entry.day||"—"),
    startTime:String(entry.startTime||"—"),
    endTime:String(entry.endTime||"—"),
    duration:Math.max(1,Number(entry.duration||1)),
    section:labelOf(entry.section),
    subject:labelOf(entry.subject),
    faculty:labelOf(entry.faculty),
    room:labelOf(entry.room),
    sectionId:idOf(entry.section),
    subjectId:idOf(entry.subject),
    facultyId:idOf(entry.faculty),
    roomId:idOf(entry.room)
  };
}

function changedFields(before,after) {
  const pairs=[
    ["day","Day"],
    ["startTime","Start time"],
    ["endTime","End time"],
    ["duration","Duration"],
    ["facultyId","Faculty"],
    ["roomId","Room"]
  ];
  return pairs.filter(([key])=>before[key]!==after[key]).map(([key,label])=>({
    field:label,
    before:key==="facultyId"?before.faculty:key==="roomId"?before.room:before[key],
    after:key==="facultyId"?after.faculty:key==="roomId"?after.room:after[key]
  }));
}

/**
 * Compares two populated timetable versions without changing either source.
 * Entries are paired by section+subject and then ordered by their timetable slot.
 * Any moved/resource-changed class is reported as changed; unmatched rows are
 * reported as added or removed. The source versions are never mutated.
 */
export function compareTimetableVersions(leftEntries = [], rightEntries = []) {
  const leftMap=new Map(),rightMap=new Map();
  for(const entry of Array.isArray(leftEntries)?leftEntries:[]){
    const key=entryKey(entry);
    if(!leftMap.has(key))leftMap.set(key,[]);
    leftMap.get(key).push(entry);
  }
  for(const entry of Array.isArray(rightEntries)?rightEntries:[]){
    const key=entryKey(entry);
    if(!rightMap.has(key))rightMap.set(key,[]);
    rightMap.get(key).push(entry);
  }
  for(const rows of leftMap.values())rows.sort(compareSort);
  for(const rows of rightMap.values())rows.sort(compareSort);

  const changes=[];
  const keys=[...new Set([...leftMap.keys(),...rightMap.keys()])];
  let unchanged=0;
  for(const key of keys){
    const left=leftMap.get(key)||[];
    const right=rightMap.get(key)||[];
    const pairs=Math.min(left.length,right.length);
    for(let index=0;index<pairs;index++){
      const before=describe(left[index]),after=describe(right[index]);
      const fields=changedFields(before,after);
      if(fields.length){
        changes.push({
          type:"CHANGED",
          key,
          subject:after.subject||before.subject,
          section:after.section||before.section,
          before,after,fields
        });
      }else unchanged++;
    }
    for(let index=pairs;index<left.length;index++){
      const before=describe(left[index]);
      changes.push({type:"REMOVED",key,subject:before.subject,section:before.section,before,after:null,fields:[]});
    }
    for(let index=pairs;index<right.length;index++){
      const after=describe(right[index]);
      changes.push({type:"ADDED",key,subject:after.subject,section:after.section,before:null,after,fields:[]});
    }
  }
  const summary={
    added:changes.filter(item=>item.type==="ADDED").length,
    removed:changes.filter(item=>item.type==="REMOVED").length,
    changed:changes.filter(item=>item.type==="CHANGED").length,
    unchanged
  };
  const typeOrder={CHANGED:0,ADDED:1,REMOVED:2};
  changes.sort((a,b)=>(typeOrder[a.type]??9)-(typeOrder[b.type]??9)||a.section.localeCompare(b.section)||a.subject.localeCompare(b.subject));
  return {summary,changes};
}
