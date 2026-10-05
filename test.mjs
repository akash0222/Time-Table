const base = "http://localhost:5000";
const health = await fetch(`${base}/api/health`);
console.log("health", health.status, await health.json());
const protectedResponse = await fetch(`${base}/api/faculty`);
console.log("protected /api/faculty", protectedResponse.status);
<<<<<<< HEAD
const login = await fetch(`${base}/api/auth/login`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({username:"admin",password:"admin123"}) });
=======
const login = await fetch(`${base}/api/auth/login`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({username:"admin",password:process.env.TEST_ADMIN_PASSWORD || "admin123"}) });
>>>>>>> 62a144d (Phase 18 QA fixes and Link2 runtime fix)
console.log("login", login.status, await login.json());
