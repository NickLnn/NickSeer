# NickSeer Master Patch Notes & Change History

All historical patches and architectural updates are preserved chronologically below. Each individual patch is also saved in its own timestamped markdown file in this folder.

---

## 📅 2026-08-28 03:14 — High-Definition Vector Streaming Logos & IMDb/TMDB Badges
- **File:** 2026-08-28_03-14_hd_vector_brand_logos.md
- **Details:** Replaced all streaming brand logos (Netflix, Disney+, Prime Video, HBO Max, Apple TV+, Paramount+) with pixel-perfect, high-definition SVG vectors. Upgraded IMDb and TMDB badges with official vector artwork.


---

## 📅 2026-08-28 02:55 — Admin Role Gating for Info & Live Streaming
- **File:** `2026-08-28_02-55_admin_role_gating_info_live.md`
- **Details:** Gated `Info` (System Health) and `Live Streaming` (Active sessions/stats) to `admin` role only. Protected backend routes `/api/health-detail` and `/api/discover/live/*` with 403 status. Added automatic client-side redirect to Home for non-admin navigation attempts.

---

## 📅 2026-08-28 02:49 — Mobile UI/UX Overhaul (Seerr-style) & Favicon
- **File:** `2026-08-28_02-49_mobile_ux_drawer_search_favicon.md`
- **Details:** Created `public/favicon.svg` and `public/apple-touch-icon.png` matching dark brand tile. Added slide-out mobile drawer with all discover/manage links. Overhauled iPhone modal layout with bottom-sheet fit and clearance. Replaced search results with centered responsive CSS Grid. Added live volume mounts to `docker-compose.yml`.

---

## 📅 2026-08-28 02:27 — Universal IMDb Ratings Engine & Sub-Tabs
- **File:** `2026-08-28_02-27_universal_imdb_ratings_cinemeta.md`
- **Details:** Rebuilt `omdb.js` with multi-tier fallback (OMDb -> Free Cinemeta Open Metadata). Added yellow `[IMDb]` logo and rating on all posters and detail modal. Added dedicated `⏳ Pending` and `✓ Approved` sub-tabs to Requests view.

---

## 📅 2026-08-28 02:15 — Authentication, Approvals Queue & Server Hardening
- **File:** `2026-08-28_02-15_auth_approvals_hardening.md`
- **Details:** Enabled auth and request gating for standard users. Added Plex OAuth PIN flow. Added inline `✏️ Edit` panel on requests. Added atomic settings persistence (`.tmp` -> `fs.renameSync`) with automatic backup rotation and disk `mtimeMs` reloading. Added graceful shutdown handlers in `server/index.js`.