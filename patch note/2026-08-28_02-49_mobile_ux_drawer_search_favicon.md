# NickSeer Patch Note — 2026-08-28 02:49
**Scope:** Mobile UI/UX Overhaul (Seerr-style), iPhone Modal Alignment & Clearance, Centered Responsive Search Grid, Mobile Drawer Navigation (`☰`), Dark Aegean Favicon & Apple Touch Icon.

### Summary of Changes:
- Created vector brand logo favicon (`public/favicon.svg`) and Apple Touch Icon (`public/apple-touch-icon.png`).
- Added static favicon links in `public/index.html` and dynamic sync in `public/js/logo.js`.
- Added Seerr-style slide-out Mobile Navigation Drawer (`#drawerOverlay`) with complete Discover & Manage categories.
- Added topbar mobile hamburger button (`☰`) and bottom bar `[More ☰]` button.
- Fixed iPhone modal clipping: added `padding-bottom: calc(75px + env(safe-area-inset-bottom))` and symmetrical action button grid (`+ Request` full width, `▶ Trailer` and `IMDb` side-by-side).
- Replaced horizontal scroll in `runSearch()` with centered, thumb-friendly responsive CSS Grid (`.search-results-grid`).
- Updated `docker-compose.yml` with `./server:/app/server` and `./public:/app/public` live volume mounts.