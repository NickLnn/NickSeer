# NickSeer patch — Plex library card + fixed Prime/Disney logos

## 1) Fixed logos (Prime Video + Disney+)
Redesigned so they read cleanly at 30px:
- **Prime Video** — blue tile with the white smile/arrow + "prime".
- **Disney+** — navy tile with italic "D" and a blue "+".
(Netflix, HBO, Apple, Paramount unchanged.)

## 2) Plex library card in Downloads & Health
A new **Plex Library** card is injected into Downloads & Health showing:
- your Plex **server name**,
- each scanned library (🎬 Movies / 📺 TV Shows) with counts,
  **episodes**, and a **matched %** progress bar (how many titles NickSeer
  matched to TMDB — that's what powers ownership ✓, actor "in library", etc.),
- "Last scanned … · N matched titles",
- a clickable **⟳ Sync now** button that force-scans every Plex library and
  re-reads fresh.

Verified with a mock Plex: counts, matched %, episode totals, and the force
scan all correct. ✅

## Refresh cadence (your question)
- 24h cache: Home recs, Trending, Streaming Top 10, IMDb Top 250, New,
  Coming Soon, Plex library scan, OMDb ratings.
- 7 days: Box Office (weekly).
- Live (every visit): Downloads & Health.
- ⟳ button (top bar) forces everything; the new Plex **Sync now** forces a
  Plex-side rescan on demand.

## Files
```
nickseer/public/js/brands.js       # fixed Prime + Disney logos
nickseer/public/js/plexcard.js     # NEW — Plex library card + Sync button
nickseer/public/index.html         # loads plexcard.js
nickseer/server/services/plex.js   # libraryDetail() + forceScan()
nickseer/server/routes/status.js   # GET /api/status/plex + POST /api/status/plex/sync
```

## Apply
```bash
cd /volume1/docker/nickseer
# copy the 5 files over the existing ones, then:
docker compose up -d --build
```
Then Ctrl+F5, open **Downloads**. First load scans your library (a few seconds);
hit **Sync now** anytime to force a fresh Plex scan.
