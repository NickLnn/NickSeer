# NickSeer — big batch: honest status (READ ME FIRST)

You asked for a lot at once, and some of it touches **authentication** (Plex
login, approvals gating). I want to be straight about what's done, what's tested,
and what needs care — rather than dump a huge change that could break your
working app or lock you out.

## ✅ Built AND logic-tested (server side — safe, high value)
1. **Box Office worldwide total on BOTH paths** — the fix for your screenshot.
   Your NAS couldn't reach Box Office Mojo (it fell back to the TMDB proxy,
   which had no global $). The proxy path now enriches each film with TMDB's
   worldwide `revenue`, so the global total always shows.
2. **Apple TV+ fixed** — it's a TV-heavy service with almost no movies, so the
   movie-only rows were empty and hid. It now **falls back to TV**, so Apple TV+
   appears in Streaming Top 10, New, and Coming Soon.
3. **Plex library stats** — `/api/status` now returns your library counts
   (movies / series / episodes per section) for the Downloads & Health card,
   and can report a Plex-logged-in user's OWN server via `?self=1`.
4. **Approvals workflow (server)** — when "admin approves" is on, non-admin
   requests are queued as **pending**; admin approves (→ Radarr/Sonarr) or
   declines. `/api/requests` endpoints built.
5. **Sign in with Plex (server)** — full OAuth PIN flow: create PIN → redirect
   to app.plex.tv → poll → resolve account → **auto-create a NickSeer user**
   (first Plex user becomes admin). *Provisioning unit-tested ✅.*
6. **Streaming brand keys** — every row now carries a `brand` key so the UI can
   render a proper logo (server side done).

All 11 backend files pass syntax checks. Plex provisioning + token logic tested.

## 🟡 Included but NOT yet wired into the UI (the big frontend piece)
The **visible** parts — real streaming **logos** on row titles, the **Plex login
button**, the **Approvals tab**, and the **Plex library card** — all need changes
inside `public/js/app.js`. That file has grown to ~40KB with ~15 features across
our patches. I did **not** rebuild it from memory in this drop, because doing so
blind (I can't diff against your live copy) risks silently regressing something
you rely on. `enhance.css` (logos/styles) and `index.html` (Approvals tab slot)
ARE included and ready.

## ⚠️ Two things I genuinely cannot test from here
- **Plex OAuth** needs a real Plex account + browser redirect + your Cloudflare
  URL as the `forwardUrl`. The logic is built and provisioning is unit-tested,
  but the end-to-end claim must be tested live.
- **Approvals + auth guard** gate real requests; must be verified live.

## 🧯 Safety: back up first + how to recover if ever locked out
Before enabling login/approvals:
```bash
cp /volume1/docker/nickseer/config/settings.json /volume1/docker/nickseer/config/settings.backup.json
```
If you ever get locked out, edit `config/settings.json` and set:
```json
"auth": { "enabled": false }
```
then `docker compose restart nickseer`. You're back in with no login.

## What I recommend
Apply this backend + css/html now (safe, gives you the Box Office worldwide fix
+ Apple TV+ fix + Plex-stats API immediately). Then let me do the **app.js
frontend wiring as one careful, focused step** — I'll add: brand logos on rows,
the Plex login button, the Approvals tab UI, and the Plex library card — and we
test the Plex login + approvals live together.

## Files in this drop
```
server/config.js                 server/index.js
server/services/plexauth.js      server/services/auth.js
server/services/plex.js          server/services/tmdb.js
server/routes/auth.js            server/routes/requests.js
server/routes/request.js         server/routes/status.js
server/routes/discover.js
public/css/enhance.css           public/index.html
```
