# NickSeer patch — AI Suggestions row + Live Streaming tab

Two additive, tested features (no app.js changes). The rest of your list is
staged honestly below.

## ✅ 1) AI Suggestions row (Home)
A new **"AI Suggestions · last 30 days"** row appears right **under "Picked for
you"**. It pulls your **Tautulli** (or Plex) watch history from the last 30 days
(movies AND series), builds seeds, pools TMDB recs, filters what you already
own, and — if your local AI is on — runs it through your **llama.cpp/Qwen** for
ranking + a short "why". Rendered natively by the existing UI (clickable +
requestable). Cached 24h; ⟳ forces refresh.
Implemented server-side (spliced into /api/discover/home), so nothing in app.js
changes.

## ✅ 2) Live Streaming tab (right of Coming Soon)
New **Live Streaming** nav tab with two sub-tabs:
- **Now Watching** — Tautulli current streams: user, title, ▶/⏸/buffering,
  Direct Play vs Transcode, player, and a live progress bar. Auto-refreshes
  every 10s while you're on it.
- **Stats** — Tautulli home stats with **30 / 60 / 90 / 1-year** filters:
  Top Movies, Top TV, Top Users, Top Platforms.
Verified against a mock Tautulli (now-watching states + transcode flags + stats
+ 30-day window all correct). ✅

## Files
```
nickseer/server/services/tautulli.js   # + activity(), homeStats(days), historyDays()
nickseer/server/routes/discover.js     # + /ai-suggest, /live/now, /live/stats, AI row in /home
nickseer/public/js/live.js             # NEW — Live Streaming tab
nickseer/public/index.html             # + Live Streaming nav + loads live.js
```

## Apply
```bash
cd /volume1/docker/nickseer
docker compose up -d --build
```
Ctrl+F5. (AI Suggestions needs Tautulli or Plex history + AI set to Level 3 with
your /v1 URL from the last patch.)

## 🟡 Staged (needs the app.js pass + live auth testing — next step)
These genuinely require editing the big app.js and/or verifying auth live, so I
did NOT ship them blind:
1. **"Info" tab** that MOVES NickSeer health, Radarr, Sonarr, Plex Library and
   AI/activity stats OFF Downloads. (Radarr/Sonarr/health cards are built inside
   app.js renderStatus — moving them needs an app.js edit.)
2. **Approvals tab** (Overseerr-style admin approval) as a visible tab. The
   server approval queue + endpoints already exist from the earlier backend
   batch; this is the UI + wiring.
3. **Roles admin/requester + permissions editor**, set any user's role, and
   **auto-provision Plex users** into the list even before they log in
   (via plex.tv friends/home users). Needs the auth batch verified live +
   an app.js/settings pass.

I'd like to do those as ONE careful, focused app.js step so we don't risk your
working UI — say the word and I'll build + we test approvals/roles together.
