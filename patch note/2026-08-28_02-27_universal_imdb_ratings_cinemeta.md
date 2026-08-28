# NickSeer Patch Note — 2026-08-28 02:27
**Scope:** Universal IMDb Ratings Engine, Fallback Provider (Cinemeta), Poster Rating Badges (IMDb + TMDB), Movie/Series Detail Ratings, Dedicated Admin Request Sub-Tabs.

### Summary of Changes:
- Rebuilt `server/services/omdb.js` with multi-tier rating resolver: Tier 1 (OMDb API) -> Tier 2 (Free Cinemeta Open Metadata for official IMDb scores).
- Resolved OMDb HTTP 401 error by automatically falling back to Cinemeta (`https://v3-cinemeta.strem.io/meta/${media}/${imdbId}.json`).
- Removed blocking `cfg.omdb?.apiKey` checks in `server/routes/discover.js`.
- Added yellow `[IMDb] 8.4` badge and secondary `[TMDB] 7.9` badge to all movie/series posters (`public/js/imdb-badge.js`).
- Reworked detail modal header meta row: IMDb rating shown FIRST, TMDB shown SECOND (`public/js/detail-ratings.js`).
- Added dedicated sub-tabs with counter badges (`⏳ Pending`, `✓ Approved`, `✕ Declined`, `All`) in `public/js/approvals.js`.