# NickSeer patch — Login screen: REAL background + always-on Plex button

## What was wrong (from your screenshot)
- The **logo IS working** (the calligraphic-N + wave shows in the blue tile). 👍
- **Background was black** — my earlier hardcoded TMDB backdrop paths were guesses
  and 404'd, so nothing loaded.
- **No Plex button** — it was hidden because Plex login wasn't enabled on the
  server. You want it visible regardless.

## Fixes
1. **Real cinematic background** — a new PUBLIC endpoint
   `GET /api/public/backdrops` returns actual TRENDING backdrops (using your
   TMDB key, server-side). The login screen fetches these and cross-fades them,
   with a small curated fallback only if TMDB is unreachable. Runs pre-auth
   (the auth guard now allows /api/public).
2. **"Sign in with Plex" — always shown** as a second option under Sign in. If
   Plex login isn't enabled on the server, clicking it shows a friendly
   "enable it in Settings → Users" note instead of silently doing nothing.
3. Calligraphic-N logo + Aegean Sign-in button kept.

## Files
```
server/routes/public.js     # NEW — /backdrops (pre-auth)
server/index.js             # mounts publicRouter + allows /api/public in guard
public/js/login-enhance.js  # real backdrops + always-on Plex button
public/index.html           # loads login-enhance.js
```
Keep your other existing modules — index.html still loads them.

IMPORTANT: this index.js assumes routes/public.js exists (included). It also
mounts health-detail + requests (approvals) as before — if your current index.js
differs, this one supersedes it and keeps all mounts.

## Apply
```bash
cd /volume1/docker/nickseer
docker compose up -d --build
```
Ctrl+F5, then Log out to see the enhanced sign-in screen with the moving
cinematic background and the Plex button.

## To actually USE Plex login
Settings → Users → enable Plex login (and "Require login"). Then the Plex button
completes the OAuth flow and auto-provisions the Plex user.
