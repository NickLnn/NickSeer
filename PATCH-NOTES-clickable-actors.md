# NickSeer patch — Clickable actors (person pages)

Tap any face in the **Cast** row to open an actor page that shows:

- **In your library** — every movie/series you already own featuring that actor
  (cross-referenced live against your Plex library), each opens its detail page.
- **Known for** — their most popular roles ranked by TMDB popularity. Titles you
  don't own get a **＋** button to send straight to Radarr/Sonarr (opens the
  Request dialog). Titles you own show a green **✓ In library** badge.
- Actor photo, department, short bio, credit counts, and an **IMDb ↗** link to
  the actor's IMDb page (works via TMDB external_ids).

## Files in this patch (drop-in replacements)

Overlay these onto your project on the NAS (`/volume1/docker/nickseer/`),
overwriting the same paths:

```
nickseer/server/services/tmdb.js     # + person(id) with combined_credits
nickseer/server/routes/discover.js   # + /person/:id route, cast now carries id
nickseer/public/js/app.js            # clickable cast + person modal
```

No CSS or other files change (the person modal reuses existing styles).

## Apply it (SSH)

```bash
cd /volume1/docker/nickseer
# copy the 3 files into place (scp / File Station over the existing ones), then:
docker compose up -d --build
```

Then hard-refresh the browser (Ctrl+F5) so the new app.js loads.
