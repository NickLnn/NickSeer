# NickSeer patch — CRITICAL Home fix + Live richness + Info tab

## 🔴 1) CRITICAL: Home was stuck on "Loading…" — FIXED
Cause: my previous patch spliced AI Suggestions into /home, and the call to your
local llama.cpp had NO timeout. Your model accepted the connection but never
returned, so /home hung forever (nothing in logs because the request never
completed).
Fixes:
- ai.js now aborts any AI call after 20s (AbortController) and NEVER throws
  upward — it falls back to rule-based ranking.
- /home races the AI row against an 8s budget, so the page is always snappy;
  the AI row fills in on a later visit once cached.
Tested: with a permanently-hanging AI server, aiRerank returns in ~20s (not
forever) and Home stays responsive. ✅

## 🟢 2) AI Suggestions row
Still appears under "Picked for you" (last-30-day taste). If your local AI is
reachable it's AI-ranked with a "why"; if not, it gracefully falls back to
rule-based — either way it no longer blocks Home.
(To get true AI ranking, set AI Brain → Ollama URL = http://192.168.31.173:10000/v1
and model = qwen, level 3.)

## 🟢 3) Live Streaming — richer
- Now Watching: poster (matched via TMDB) + Playing/Paused/Buffering, Direct
  Play vs Transcode, 4K badge + HDR/Dolby Vision, video+audio codecs & channels,
  player + bandwidth, progress bar.
- Stats: mini posters on Top Movies/TV; Top Platforms names fixed (were "—");
  Top Users show real usernames. 30/60/90/1-year filters.
Tested: session parses 4K/HDR/HEVC/EAC3/5.1 + transcode; platform & user names
correct. ✅

## 🟢 4) New "Info" tab (next to Downloads)
Moves NickSeer **health (green ✓ icon)**, **Radarr**, **Sonarr**, **Plex
Library** (with Sync now) and **AI & Activity** stats OFF Downloads into a new
**Info** tab. Downloads now shows only the actual download activity: Gluetun VPN
+ SABnzbd (Radarr/Sonarr cards are auto-stripped there).

## Files
```
server/recommend/ai.js        # 20s timeout — fixes the Home hang
server/services/tautulli.js   # rich sessions + correct stat names
server/routes/discover.js     # /home non-blocking + live poster enrichment
public/js/live.js             # rich Now Watching + stats posters
public/js/info.js             # NEW Info tab (health/Radarr/Sonarr) + strips Downloads
public/js/plexcard.js         # Plex card → Info
public/js/stats.js            # "AI & Activity" → Info
public/index.html             # + Info nav
```

## Apply
```bash
cd /volume1/docker/nickseer
docker compose up -d --build
```
Ctrl+F5. Home loads immediately now.

## Still staged (needs the auth/app.js pass — next)
Approvals-as-a-tab for other users + roles editor (admin/requester) + Plex-user
auto-provisioning into the user list. The server pieces exist; this is the UI +
live auth testing, best done as one focused step.
