// public.js — endpoints safe to call BEFORE login (used by the login screen).
// /backdrops returns real trending backdrop image URLs so the sign-in page has a
// cinematic background even though the user isn't authenticated yet.
import express from '../mini.js';
import { load } from '../config.js';
import { cached, TTL_DAY } from '../lib/cache.js';

const router = express.Router();

async function tmdbTrendingBackdrops() {
  const t = load().tmdb || {};
  if (!t.apiKey && !t.readToken) return [];
  const headers = { accept: 'application/json' };
  const build = (media) => {
    const url = new URL(`https://api.themoviedb.org/3/trending/${media}/week`);
    if (t.readToken) headers.Authorization = `Bearer ${t.readToken}`;
    else url.searchParams.set('api_key', t.apiKey);
    url.searchParams.set('language', t.language || 'en-US');
    return url;
  };
  const grab = async (media) => {
    try { const res = await fetch(build(media), { headers }); if (!res.ok) return []; const d = await res.json(); return (d.results || []).map((r) => r.backdrop_path).filter(Boolean); }
    catch { return []; }
  };
  const [mv, tv] = await Promise.all([grab('movie'), grab('tv')]);
  const paths = [...mv, ...tv].filter(Boolean);
  // de-dup, cap, and turn into full CDN URLs (public — no key needed to view).
  const seen = new Set(); const urls = [];
  for (const p of paths) { if (seen.has(p)) continue; seen.add(p); urls.push('https://image.tmdb.org/t/p/original' + p); if (urls.length >= 12) break; }
  return urls;
}

router.get('/backdrops', async (req, res) => {
  try {
    const urls = await cached('public:backdrops', TTL_DAY, tmdbTrendingBackdrops, req.query.refresh === '1');
    res.json({ backdrops: urls });
  } catch (e) { res.status(200).json({ backdrops: [], error: e.message }); }
});

export default router;
