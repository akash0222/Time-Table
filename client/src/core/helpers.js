export function localToday(){return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date())}
export function authRole(){try{return JSON.parse(localStorage.getItem("tt_user")||"null")?.role||""}catch{return ""}}
