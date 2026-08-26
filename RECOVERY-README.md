# NickSeer RECOVERY — app was blank (server crash-loop / cached page)

## What happened
Your last patch shipped a server/index.js that STATICALLY imported routes/health.js
and routes/public.js. If any of those files isn't present on your NAS, Node
throws on startup → the container restart-loops → your browser showed a CACHED
page (topbar only) while every /api call failed → blank Home, no login.

## The fix (this recovery build)
1. **server/index.js** — HARDENED: every router is imported defensively. A
   missing file can no longer crash the server; it just logs and skips that route.
   The startup log now lists which routers loaded.
2. **public/js/errors.js** — shows any uncaught JS error on-screen (red banner),
   so if anything is still wrong we can SEE it instead of guessing.
3. **public/index.html** — loads errors.js first.

## Apply (IMPORTANT: do a clean rebuild + hard refresh)
```bash
cd /volume1/docker/nickseer
docker compose down
docker compose up -d --build
docker logs -n 30 nickseer        # <-- check it says "NickSeer running ... (routers: ...)"
```
Then in the browser: **Ctrl+Shift+R** (hard refresh to drop the cached page).

## What to look for
- `docker logs nickseer` should show:
  `NickSeer running on http://0.0.0.0:5056 (routers: auth, public, settings, discover, status, request, ...)`
  If a router is missing it will say `[boot] optional router ./routes/xxx.js not loaded: ...`
  — that's fine, the server still runs; that feature is just off until the file exists.
- If Home is STILL blank after a hard refresh, a red error banner should appear
  at the bottom of the page. Send me that exact text — it names the file + line
  that's throwing, and I'll fix that one file precisely.

## If you want the fastest possible "just work again"
Temporarily disable login so nothing gates the app:
- edit config/settings.json → set  "auth": { "enabled": false }
- docker compose restart nickseer
