# FreightFlow Super Admin

Greenfield platform Super Admin SPA. Talks to **freight-flow-backend** (`/api/v2`) with Microsoft SSO + JWT. Hub credentials live in backend Settings (never in the browser).

## Setup

```bash
cp .env.example .env
npm install
npm run dev
```

Defaults to http://localhost:5174

### Env

| Var | Example |
|-----|---------|
| `VITE_API_BASE_URL` | `http://localhost:7000/api/v2` |
| `ENVIRONMENT` | `dev` — enables email/password login (same as org frontend) |

When `ENVIRONMENT` is not `dev`, only Microsoft SSO is shown.

### Backend

Set `ADMIN_FRONTEND_URL=http://localhost:5174` so Microsoft OAuth `app=admin` redirects here.

## Features

- Microsoft login (superuser only)
- Overview, Organizations, Users, Shipments, Approvals, Missing MBL, Routing, Hub, Emails
- Settings: hub tracking URL + API key (DB-backed via backend)
