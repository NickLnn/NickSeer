// public.js — Unauthenticated public endpoints for login screen wallpaper.
// Returns real weekly trending backdrops and poster mosaic URLs.
import express from '../mini.js';
import { load } from '../config.js';
import { cached, TTL_DAY } from '../lib/cache.js';

const router = express.Router();

async function tmdbTrendingMedia() {
  const t = load().tmdb || {};
  if (!t.apiKey && !t.readToken) return { backdrops: [], posters: [] };
  const headers = { accept: 'application/json' };
  const build = (media) => {
    const url = new URL(`https://api.themoviedb.org/3/trending/${media}/week`);
    if (t.readToken) headers.Authorization = `Bearer ${t.readToken}`;
    else url.searchParams.set('api_key', t.apiKey);
    url.searchParams.set('language', t.language || 'en-US');
    return url;
  };

  const grab = async (media) => {
    try {
      const res = await fetch(build(media), { headers });
      if (!res.ok) return [];
      const d = await res.json();
      return (d.results || []).filter((r) => r.poster_path && r.backdrop_path);
    } catch {
      return [];
    }
  };

  const [mv, tv] = await Promise.all([grab('movie'), grab('tv')]);
  const combined = [...mv, ...tv];
  
  // Shuffle/interleave movies and TV
  combined.sort(() => Math.random() - 0.5);

  const seenBackdrops = new Set();
  const seenPosters = new Set();
  const backdrops = [];
  const posters = [];

  for (const item of combined) {
    if (item.backdrop_path && !seenBackdrops.has(item.backdrop_path)) {
      seenBackdrops.add(item.backdrop_path);
      backdrops.push(`https://image.tmdb.org/t/p/w1280${item.backdrop_path}`);
    }
    if (item.poster_path && !seenPosters.has(item.poster_path)) {
      seenPosters.add(item.poster_path);
      posters.push(`https://image.tmdb.org/t/p/w342${item.poster_path}`);
    }
    if (posters.length >= 36 && backdrops.length >= 16) break;
  }

  return { backdrops, posters };
}

router.get('/backdrops', async (req, res) => {
  try {
    const data = await cached('public:trending-wallpaper:v2', 7 * TTL_DAY, tmdbTrendingMedia, req.query.refresh === '1');
    res.json(data);
  } catch (e) {
    res.status(200).json({ backdrops: [], posters: [], error: e.message });
  }
});

import plexauth from '../services/plexauth.js';
import auth from '../services/auth.js';

router.get('/profiles', (req, res) => {
  const c = load();
  const users = (c.auth?.users || []).map(u => ({
    id: u.username,
    name: u.username,
    thumb: u.thumb || '',
    role: u.role || 'user',
    isAccount: true,
    plex: !!u.plexToken
  }));
  res.json({ ok: true, profiles: users });
});

router.post('/plex/pin', async (req, res) => {
  try {
    const { forwardUrl } = req.body || {};
    const pin = await plexauth.createPin(forwardUrl);
    res.json({ ok: true, id: pin.id, code: pin.code, authUrl: pin.authUrl });
  } catch (e) {
    res.status(200).json({ ok: false, error: e.message });
  }
});

router.get('/plex/check/:id', async (req, res) => {
  try {
    const claim = await plexauth.claimPin(req.params.id);
    if (!claim.claimed) return res.json({ ok: true, pending: true });

    const pUser = await plexauth.getUser(claim.authToken);
    const user = auth.findOrCreatePlexUser({
      plexId: String(pUser.id),
      username: pUser.username || pUser.title || 'plex_' + pUser.id,
      email: pUser.email,
      thumb: pUser.thumb,
      plexToken: claim.authToken
    });

    const token = auth.makeToken(user);
    res.json({ ok: true, pending: false, token, user });
  } catch (e) {
    res.status(200).json({ ok: false, error: e.message });
  }
});

export default router;