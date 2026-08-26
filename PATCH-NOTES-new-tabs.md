# NickSeer patch — New tabs + Director/Crew

Adds three new nav tabs and a director/crew section on actor pages.

## New tabs
- **New** — "Newly Added": one row per streaming service (Netflix, Disney+,
  Prime, HBO Max, Paramount+) of recently-released titles now on that service.
  Toggle **Movies / TV** at the top.
- **Box Office** — weekly **Top 10** currently in cinemas, ranked by gross.
  The cache key is tied to the week's **Monday**, so the list rotates
  automatically every Monday.
  ⚠️ Honest note: TMDB has **no weekend $ figures**. This ranks now-playing
  titles by total gross as a proxy. (A true weekend-$ chart would need a paid
  Box Office Mojo / The Numbers scraper — can be added later if you want.)
- **Coming Soon** — "Highly Anticipated": a **🎬 In Cinemas Soon** row first
  (theatrical releases), then a row per streaming service of upcoming titles.
  Toggle **Movies / TV**.

## Actor pages
- Clicking a face now also shows a **"Directed · written · produced"** row
  (from TMDB crew credits), each poster with the same **✓ In library** badge or
  **＋ request** button as the acting row.

## Files in this patch (drop-in replacements)
```
nickseer/server/services/tmdb.js     # + newlyAdded, inCinemasTop, comingSoon*, providerId
nickseer/server/routes/discover.js   # + /new, /boxoffice, /anticipated, crew on /person
nickseer/public/index.html           # + New / Box Office / Coming Soon nav tabs
nickseer/public/js/app.js            # + the three views, Movies/TV toggle, crew section
```
No CSS change (reuses existing styles).

## Apply it (SSH)
```bash
cd /volume1/docker/nickseer
# copy the 4 files over the existing ones (File Station / scp), then:
docker compose up -d --build
```
Then hard-refresh the browser (Ctrl+F5).

## Notes
- All rows honor your **TMDB region** (GR) and refresh on the 24h cycle; the ⟳
  button forces an immediate refresh. Box Office refreshes weekly (Monday).
- Upcoming-on-streaming rows can be thin (providers often aren't assigned to
  future titles yet); empty rows are skipped automatically. The Cinema row is
  the reliable one for theatrical.
