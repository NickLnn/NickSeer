# NickSeer patch — REAL weekly Box Office (Box Office Mojo)

Upgrades the **Box Office** tab from the TMDB gross-proxy to **real weekend
grosses scraped from Box Office Mojo**, then enriched via TMDB so posters and
one-click Request still work — the same method boxarr uses.

## What changed
- New **`boxoffice.js`** service: scrapes the latest *completed* weekend chart
  from Box Office Mojo, parses rank / title / weekend gross / total gross /
  weeks, then matches each title to TMDB for poster + id.
- **Box Office tab** now shows the real **weekend $** on every poster (green
  badge), plus "wk N · $total total", and the weekend label (e.g.
  "Domestic Weekend Aug 21-23, 2026") in the header.
- **Auto-rotates weekly** — cached for 7 days and re-fetches when a new weekend
  is published.
- **Safe fallback**: if scraping ever fails (network/parse) or you set the
  source to `tmdb`, it automatically falls back to the TMDB gross-proxy, so the
  tab never breaks.

## Files (drop-in replacements)
```
nickseer/server/services/boxoffice.js   # NEW — BOM scraper + TMDB matcher
nickseer/server/routes/discover.js      # /boxoffice now uses BOM (+ fallback)
nickseer/public/js/app.js               # Box Office view shows real $ figures
```
No config change needed — it defaults to Box Office Mojo, US & Canada domestic.

## Optional settings (config/settings.json)
```json
"boxoffice": { "source": "bom", "area": "" }
```
- `source`: `"bom"` (real, default) or `"tmdb"` (proxy).
- `area`: Box Office Mojo area code for a different region, e.g. `"GB"`,
  `"DE"`, `"NL"`. Empty = US & Canada domestic (the fullest chart).
  ⚠️ Greece has a very thin BOM chart, so the default US domestic gives the
  recognisable global blockbusters. Set an area code only if you specifically
  want a local chart.

## Apply it (SSH)
```bash
cd /volume1/docker/nickseer
# copy the 3 files over the existing ones, then:
docker compose up -d --build
```
Then hard-refresh the browser (Ctrl+F5).

## Notes / honesty
- Box Office Mojo has **no official API**; this scrapes public HTML (personal
  use, weekly cache, normal User-Agent) — exactly how boxarr does it. If BOM
  changes its markup, the parser may need a tweak; the TMDB fallback keeps the
  tab working meanwhile.
- The container needs outbound access to `boxofficemojo.com` (your NAS has it).
- Parser is unit-tested against real BOM markup (rank, title, $ figures, weeks).
