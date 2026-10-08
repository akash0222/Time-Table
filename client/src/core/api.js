import axios from "axios";

const configuredApiUrl = String(import.meta.env.VITE_API_URL || "").trim();

// Localhost is intentionally only a development fallback. Production Vercel
// deployments must provide VITE_API_URL pointing at the Render API.
export const API = (configuredApiUrl || (import.meta.env.DEV ? "http://localhost:5000/api" : "")).replace(/\/$/, "");

if (!API && import.meta.env.PROD) {
  console.error("VITE_API_URL is not configured. Set it in Vercel before deploying the client.");
}

axios.defaults.timeout = 30000;
axios.interceptors.request.use(config => {
  const token = localStorage.getItem("tt_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
axios.interceptors.response.use(r => r, err => {
  if (err.response?.status === 401 && localStorage.getItem("tt_token")) {
    localStorage.removeItem("tt_token");
    localStorage.removeItem("tt_user");
    window.location.reload();
  }
  return Promise.reject(err);
});

export const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const apiName = { programs: "Programs", faculty: "Faculty", subjects: "Subjects", sections: "Sections", rooms: "Rooms", timeslots: "Time Slots" };
export function refId(v) { return String(v?._id ?? v ?? ""); }
