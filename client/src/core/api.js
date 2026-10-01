import axios from "axios";

export const API=(import.meta.env.VITE_API_URL||"http://localhost:5000/api").replace(/\/$/,"");
axios.defaults.timeout=20000;
axios.interceptors.request.use(config=>{
  const token=localStorage.getItem("tt_token");
  if(token) config.headers.Authorization=`Bearer ${token}`;
  return config;
});
axios.interceptors.response.use(r=>r,err=>{
  if(err.response?.status===401 && localStorage.getItem("tt_token")){
    localStorage.removeItem("tt_token");
    localStorage.removeItem("tt_user");
    window.location.reload();
  }
  return Promise.reject(err);
});
export const days=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
export const apiName={programs:"Programs",faculty:"Faculty",subjects:"Subjects",sections:"Sections",rooms:"Rooms",timeslots:"Time Slots"};
export function refId(v){return String(v?._id??v??"");}
