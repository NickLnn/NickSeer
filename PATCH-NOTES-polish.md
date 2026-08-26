# NickSeer patch — Nicer requests, Apple TV+, nav fix, worldwide box office

Four improvements in this patch:

## 1) ✅ Nicer "added" view (no more raw Radarr JSON)
The ugly `Request failed: radarr 400: [{...}]` is gone. Now:
- **Success** → a polished ✓ panel: "Added to Radarr — downloading soon", then
  auto-closes.
- **Already owned** → a friendly ✓ "Already in your library" panel instead of
  the raw `MovieExistsValidator` 400 blob.
Server-side, `/api/request` detects the exists case and returns
`{ ok:false, code:'exists' }` so the UI can render the nice message.

## 2) 🍎 Coming Soon (and all rows) now include Apple TV+
Added **Apple TV+** to the streaming provider list, so it appears in Coming Soon
(movies + TV), Newly Added, and Streaming Top 10 alongside Netflix, Disney+,
Prime Video, HBO Max and Paramount+.

## 3) 🎮 Streaming Top 10 navigation fixed
Left/right no longer "jumps" up/down to another service's row. Navigation now
requires the target to overlap the current row (for left/right) or column (for
up/down), so rows stay clean; it only crosses rows when there's genuinely
nothing left in the current one.

## 4) 🌍 Box Office shows the GLOBAL total
Each film now shows its **worldwide cumulative gross** (from TMDB's `revenue`
field) under the title — e.g. "wk 4 · $714.4M 🌍 worldwide" — in addition to the
green weekend-gross badge. It refreshes automatically when the weekly scheduler
re-fetches (7-day cache, keyed to the weekend + area).

## Files (drop-in replacements)
```
nickseer/server/services/tmdb.js       # + Apple TV+, + movieBrief (revenue)
nickseer/server/services/boxoffice.js  # + worldwide revenue enrichment
nickseer/server/routes/discover.js     # box office passes worldwide total
nickseer/server/routes/request.js      # friendly 'already exists' code
nickseer/public/js/nav.js              # row/column-overlap navigation fix
nickseer/public/js/app.js              # success panel + worldwide total + Apple TV+
```

## Apply it (SSH)
```bash
cd /volume1/docker/nickseer
# copy the 6 files over the existing ones, then:
docker compose up -d --build
```
Then hard-refresh the browser (Ctrl+F5).

## Notes
- Worldwide totals cost one extra TMDB call per film (10/week) — trivial, and
  cached weekly.
- Apple TV+ upcoming rows can be thin (few future titles carry a provider yet);
  empty rows auto-hide.
- Tested: 'already-exists' detection ✅, box-office weekend + domestic +
  worldwide extraction ✅, all 6 files pass syntax checks.
