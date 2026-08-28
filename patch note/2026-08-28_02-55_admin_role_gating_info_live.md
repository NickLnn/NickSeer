# NickSeer Patch Note — 2026-08-28 02:55
**Scope:** Admin Role Gating for Sensitive Views (System Info / Health & Live Streaming Activity), Frontend Navigation Filtering, Backend Endpoint Protection.

### Summary of Changes:
- Added backend route guards in `server/index.js` returning HTTP 403 Forbidden for non-admins calling `/api/health-detail` and `/api/discover/live/*`.
- Dynamically hidden `Info`, `Live Streaming`, and `Settings` from topbar and mobile drawer for non-admin accounts in `public/js/app.js`, `public/js/info.js`, and `public/js/live.js`.
- Added route guard in `showView(view)` to automatically block non-admins and redirect to `Home` with a toast alert.