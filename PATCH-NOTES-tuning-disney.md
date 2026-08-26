# NickSeer patch — AI tuning sliders + REAL streaming logos

## 1) AI Suggestions tuning sliders (Settings → AI Brain)
A new "AI Suggestions tuning" panel with live sliders:
- **Minimum ★ rating** (0–9, default 6.2)
- **Minimum votes** (0–1000, default 80 — less obscure)
- **Max candidates** (20–150, default 50)
- **Watch history window** (14–365 days, default 60)
- **English only** toggle (ignore your foreign-language history)

Saves to config.aiTuning; the discover route reads it live (the AI-suggest cache
key includes the tuning values, so changing a slider + hitting ⟳ rebuilds fresh).
Tested: defaults + custom values honored. ✅

## 2) REAL streaming logos (fixes Disney+ everywhere)
Instead of hand-drawn wordmarks, brands.js now loads TMDB's OFFICIAL provider
logos (Netflix, Disney+, Prime Video, HBO Max, Apple TV+, Paramount+) via a new
`/api/discover/brand-logos` endpoint that reads each provider's real logo_path
from TMDB using your key. Falls back to the SVG wordmark only if an image fails.
Tested: all six providers resolve to real TMDB logo URLs (incl. Disney+). ✅

## Files
```
server/routes/discover.js        # + /brand-logos, + configurable AI tuning
public/js/settings-tuning.js     # NEW — the sliders
public/js/brands.js              # real TMDB provider logos (+ SVG fallback)
public/index.html                # loads settings-tuning.js
```

## IMPORTANT — one config line
Your config must allow an `aiTuning` object. If your server/config.js DEFAULTS
doesn't have it, add this key (settings are deep-merged, so nothing else breaks):
```js
aiTuning: { minRating: 6.2, minVotes: 80, maxCandidates: 50, historyDays: 60, englishOnly: false },
```
(Place it alongside the other top-level keys like `ai`, `recommendation`, etc.)
If you skip this, the sliders still SAVE and WORK — the server just falls back to
the same defaults until the key is persisted; adding it makes it explicit.

## Apply
```bash
cd /volume1/docker/nickseer
docker compose up -d --build
```
Ctrl+F5. Settings → AI Brain → scroll to "AI Suggestions tuning", set your
values, Save, then open AI Suggestions and hit ⟳. Disney+ (and all) logos now
show the real artwork.
