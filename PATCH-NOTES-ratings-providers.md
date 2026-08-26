# NickSeer patch — Detail ratings rework + smaller poster badge + provider rows

## 1) Detail page: IMDb first, TMDB labeled with its logo
On a movie/series detail page, the rating row now shows:
- **IMDb** (official yellow logo) + score **/10** + votes — placed where the
  TMDB ★ used to be (prominent).
- **TMDB** (official teal→blue gradient logo) + its score — to the RIGHT, so you
  know that number came from TMDB.
The bare gold ★ is gone; both sources are clearly labeled with official logos.
Verified: star value parsed, IMDb promoted, TMDB relabeled. ✅
(If OMDb isn't set / no IMDb rating, it just shows the TMDB-labeled score.)

## 2) Poster IMDb badge — smaller, official mini logo
The on-poster IMDb badge (like Plex) is now noticeably smaller (7.5px logo,
10.5px score) so it doesn't dominate the artwork.

## 3) Paramount+ & Peacock Top 10 now appear (Streaming / New / Home)
Root cause: in your Greece region, Paramount+ and Peacock have thin/empty MOVIE
catalogs, so the movie-only rows returned nothing and hid. Fix: provider rows
(Top 10, New) now **fall back to TV for ANY provider** when the movie query is
empty — so Paramount+ and Peacock populate (from their TV catalog) and show up
everywhere, with their official logos via /brand-logos.

## Files
```
server/services/tmdb.js        # TV fallback for all providers + Peacock
public/js/detail-ratings.js    # NEW — IMDb+TMDB labeled rating row
public/js/imdb-badge.js        # smaller poster badge
public/index.html              # loads detail-ratings.js
```
Keep your other existing modules — index.html still loads them all.

## Apply
```bash
cd /volume1/docker/nickseer
docker compose up -d --build
```
Ctrl+F5, then hit **⟳** once so the cached streaming/new/home rows rebuild with
Paramount+ & Peacock. OMDb key required (Settings → IMDb) for the IMDb numbers.
