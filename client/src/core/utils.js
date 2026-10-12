export const days = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
export const apiName = {programs:"Programs",faculty:"Faculty",subjects:"Subjects",sections:"Sections",rooms:"Rooms",timeslots:"Time Slots"};

export function refId(v){return String(v?._id??v??"");}

export function authRole(){try{return JSON.parse(localStorage.getItem("tt_user")||"null")?.role||""}catch{return ""}}

export function localToday(){return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date())}
