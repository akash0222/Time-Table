# Production Deployment

## Architecture

Vercel (React/Vite) -> Render (Express API) -> MongoDB Atlas

## Render

- Root Directory: `server`
- Build Command: `npm install`
- Start Command: `npm start`
- Do not manually set `PORT`; Render supplies it.

Required Render environment variables:

```env
NODE_ENV=production
MONGO_URI=<MongoDB Atlas URI for timetable_generator>
JWT_SECRET=<32+ character random secret>
DEFAULT_ADMIN_PASSWORD=<strong admin password>
CLIENT_URL=https://time-table-beige-three.vercel.app
CORS_ORIGINS=https://time-table-beige-three.vercel.app
PUBLIC_APP_URL=https://time-table-beige-three.vercel.app
TRUST_PROXY=true
JSON_BODY_LIMIT=2mb
```

MongoDB Atlas Network Access must permit the Render service. For initial deployment, `0.0.0.0/0` can be used with strong database credentials; tighten network access later if your hosting plan/network setup supports it.

## Vercel

Set the production environment variable:

```env
VITE_API_URL=https://<your-render-service>.onrender.com/api
```

Never put MongoDB credentials, JWT secrets, or admin passwords in the Vercel frontend or Git repository.

## Security

- Rotate any MongoDB password or JWT secret that has been exposed.
- `.env` files are ignored by Git; `.env.example` contains placeholders only.
- The server refuses to start without `MONGO_URI` in production.
- MongoDB credentials are never printed to logs.
