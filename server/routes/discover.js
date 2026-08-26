// Discovery routes. KEY CHANGE: mini() now passes through `imdbRating` when an
// item carries `_imdbRating` (from the IMDb chart scrape) — so those posters get
// the IMDb badge instantly, no OMDb call. Also: /imdb-ratings batch, /brand-logos.
import express from '../mini.js';
import tmdb from '../services/tmdb.js';
import omdb from '../services/omdb.js';
import plex from '../services/plex.js';
import boxoffice from '../services/boxoffice.js';
import tautulli from '../services/tautulli.js';
import engine from '../recommend/engine.js';
import { aiRerank } from '../recommend/ai.js';
import { load } from '../config.js';
import { cached, TTL_DAY, TTL_HOUR } from '../lib/cache.js';

const router = express.Router();
const isForce = (req) => req.query.refresh === '1' || req.query.force === '1';
function mondayKey() { const d = new Date(); const dow = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - dow); return d.toISOString().slice(0, 10); }
function fmtMoney(n) { if (n == null) return null; if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B'; if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M'; if (n >= 1e3) return '$' + Math.round(n).toLocaleString('en-US'); return '$' + n; }
async function libMap() { const c = load(); if (c.services.plex?.url && c.services.plex?.token) { try { return await plex.libraryMap(); } catch { return {}; } } return {}; }
async function ownedSet() { return new Set(Object.keys(await libMap())); }
async function posterFor(title, year, media) {
  if (!title) return null;
  return cached(`poster:${(media || 'multi')}:${title.toLowerCase()}:${year || ''}`, TTL_DAY, async () => {
    try { const res = await tmdb.search(title, media === 'show' ? 'tv' : (media || 'multi')); let list = (res.results || []).filter((r) => r.poster_path); if (year) { const y = String(year); const exact = list.find((r) => (r.release_date || r.first_air_date || '').startsWith(y)); if (exact) list = [exact, ...list]; } const hit = list[0]; return hit ? { id: hit.id, media: hit.media_type || (hit.title ? 'movie' : 'tv'), poster: tmdb.img(hit.poster_path), backdrop: tmdb.img(hit.backdrop_path, 'w1280') } : null; } catch { return null; }
  }, false);
}
function tuning() { const t = load().aiTuning || {}; return { minRating: Number.isFinite(t.minRating) ? t.minRating : 6.2, minVotes: Number.isFinite(t.minVotes) ? t.minVotes : 80, maxCandidates: Number.isFinite(t.maxCandidates) ? t.maxCandidates : 50, historyDays: Number.isFinite(t.historyDays) ? t.historyDays : 60, englishOnly: t.englishOnly === undefined ? false : !!t.englishOnly }; }

router.get('/home', async (req, res) => { try { res.json(await engine.recommend({ userId: req.query.userId, force: isForce(req) })); } catch (e) { res.status(200).json({ error: e.message, rows: [] }); } });

router.get('/rows', async (req, res) => { try { res.json(await cached('rows:curated', TTL_DAY, buildCuratedRows, isForce(req))); } catch (e) { res.status(200).json({ error: e.message, rows: [] }); } });
async function buildCuratedRows() {
  const rows = [];
  const push = (title, items, kind, brand) => { if (items && items.length) rows.push({ title, kind, brand, items: items.map(mini) }); };
  const [tm, tv] = await Promise.allSettled([tmdb.trending('movie', 'week'), tmdb.trending('tv', 'week')]);
  if (tm.status === 'fulfilled') push('Trending Movies', (tm.value.results || []).slice(0, 20), 'movie');
  if (tv.status === 'fulfilled') push('Trending Series', (tv.value.results || []).slice(0, 20), 'tv');
  const results = await Promise.allSettled(tmdb.STREAMING.map((s) => tmdb.topByProvider(s.key, 'movie', 10)));
  results.forEach((r, i) => { if (r.status === 'fulfilled' && r.value.items.length) push(`${r.value.provider} · Top 10`, r.value.items, 'movie', tmdb.STREAMING[i].key); });
  if (!rows.length) return { error: 'TMDB not configured or unavailable', rows: [] };
  return { rows };
}

// batch IMDb ratings (TMDB id → imdb_id → OMDb)
async function imdbIdFor(media, id) { return cached(`imdbid:${media}:${id}`, 30 * TTL_DAY, async () => { try { const ext = await tmdb.externalIds(media, id); return ext?.imdb_id || null; } catch { return null; } }, false); }
router.post('/imdb-ratings', async (req, res) => {
  const cfg = load();
  if (!cfg.omdb?.apiKey) return res.status(200).json({ error: 'omdb-not-configured', ratings: {} });
  const items = (req.body && req.body.items) || [];
  const out = {};
  await Promise.all(items.slice(0, 40).map(async (it) => {
    const media = it.media === 'tv' || it.media === 'show' ? 'tv' : 'movie'; const id = it.id; if (!id) return;
    try { const imdbId = await imdbIdFor(media, id); if (!imdbId) return; const o = await omdb.byImdbId(imdbId); if (o?.rating) out[String(id)] = o.rating; } catch { /* skip */ }
  }));
  res.json({ ratings: out });
});

// real brand logos
async function tmdbProvidersRaw(media, region) { try { const d = await tmdb.watchProviders(media, region); return d.results || []; } catch { return []; } }
router.get('/brand-logos', async (req, res) => {
  try {
    const data = await cached('brand-logos', TTL_DAY, async () => {
      const region = (load().tmdb?.region) || 'US';
      const [mv, tv] = await Promise.all([tmdbProvidersRaw('movie', region), tmdbProvidersRaw('tv', region)]);
      const all = [...mv, ...tv]; const out = {};
      for (const svc of tmdb.STREAMING) { let hit = null; for (const alias of svc.aliases) { hit = all.find((p) => (p.provider_name || '').toLowerCase() === alias.toLowerCase()) || all.find((p) => (p.provider_name || '').toLowerCase().includes(alias.toLowerCase())); if (hit) break; } if (hit && hit.logo_path) out[svc.key] = 'https://image.tmdb.org/t/p/original' + hit.logo_path; }
      return out;
    }, isForce(req));
    res.json(data);
  } catch (e) { res.status(200).json({ error: e.message }); }
});

// IMDb Top (chart/list) — items carry imdbRating from the chart when available.
router.get('/imdb-top', async (req, res) => {
  const media = req.query.media === 'tv' ? 'tv' : 'movie';
  try { const data = await cached(`imdb-top:v2:${media}`, TTL_DAY, async () => { const t = await tmdb.imdbTop(media, 250); return { source: t.source, items: t.items.map((c, i) => ({ rank: i + 1, ...mini(c) })) }; }, isForce(req)); res.json(data); }
  catch (e) { res.status(200).json({ error: e.message, items: [] }); }
});

// AI suggestions (60-day default, tunable)
async function recentHistory(days) { const c = load(); if (c.services.tautulli?.url && c.services.tautulli?.apikey) { try { return await tautulli.historyDays(days, undefined, 800); } catch { /* fall */ } } if (c.services.plex?.url && c.services.plex?.token) { try { const h = await plex.history(500); const cut = Date.now() / 1000 - days * 86400; return h.filter((x) => Number(x.viewedAt || 0) >= cut); } catch { return []; } } return []; }
async function resolveSeed(key, type) { try { const media = type === 'show' ? 'tv' : 'movie'; const r = await tmdb.search(key, media); const hit = (r.results || [])[0]; return hit ? { id: hit.id, media, genre_ids: hit.genre_ids || [], genres: (hit.genre_ids || []).join(','), lang: hit.original_language || 'en', title: key } : null; } catch { return null; } }
router.get('/ai-suggest', async (req, res) => {
  const cfg = load(); const aiOn = cfg.ai?.provider && cfg.ai.provider !== 'none'; const T = tuning();
  try {
    const key = `ai-suggest:v3:${req.query.userId || 'all'}:${cfg.ai?.provider || 'none'}:${T.minRating}:${T.minVotes}:${T.maxCandidates}:${T.historyDays}:${T.englishOnly ? 'en' : 'multi'}`;
    const data = await cached(key, TTL_DAY, async () => {
      const hist = await recentHistory(T.historyDays);
      if (!hist.length) return { source: aiOn ? 'ai' : 'rules', items: [], note: 'no-history', days: T.historyDays };
      const weight = new Map(); const typeOf = new Map();
      for (const h of hist) { const k = (h.grandparentTitle || h.title || '').toLowerCase().trim(); if (!k) continue; weight.set(k, (weight.get(k) || 0) + 1); typeOf.set(k, h.type); }
      const top = [...weight.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
      const seeds = []; for (const [k] of top) { const s = await resolveSeed(k, typeOf.get(k)); if (s) seeds.push(s); }
      const allowedLangs = new Set(['en']); if (!T.englishOnly) for (const s of seeds) if (s.lang) allowedLangs.add(s.lang);
      const owned = await ownedSet(); const pool = new Map();
      for (const s of seeds) { for (const fn of ['recommendations', 'similar']) { try { const r = await tmdb[fn](s.media, s.id); for (const c of r.results || []) { const id = `${s.media}:${c.id}`; if (owned.has(String(c.id))) continue; if ((c.vote_average || 0) < T.minRating) continue; if ((c.vote_count || 0) < T.minVotes) continue; if (c.original_language && !allowedLangs.has(c.original_language)) continue; if (!c.poster_path) continue; if (!pool.has(id)) pool.set(id, { ...c, media: s.media }); } } catch { /* skip */ } } }
      let candidates = [...pool.values()].sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0)).slice(0, T.maxCandidates);
      if (aiOn) { try { candidates = await aiRerank(candidates, seeds); } catch { /* keep */ } }
      return { source: aiOn ? 'ai' : 'rules', days: T.historyDays, basedOn: seeds.slice(0, 6).map((s) => cap(s.title)), items: candidates.slice(0, 24).map((c) => ({ ...mini(c), why: c._why })) };
    }, isForce(req));
    res.json({ ...data, aiConfigured: aiOn, tuning: T });
  } catch (e) { res.status(200).json({ error: e.message, items: [], aiConfigured: aiOn }); }
});

router.get('/live/now', async (req, res) => { const c = load(); if (!c.services.tautulli?.url || !c.services.tautulli?.apikey) return res.status(200).json({ error: 'Tautulli not configured', sessions: [] }); try { const data = await tautulli.activity(); for (const s of data.sessions) { const m = await posterFor(s.grandparent || s.title, s.year, s.type === 'episode' ? 'tv' : (s.type || 'multi')); s.poster = m?.poster || null; s.tmdbId = m?.id || null; } res.json(data); } catch (e) { res.status(200).json({ error: e.message, sessions: [] }); } });
router.get('/live/stats', async (req, res) => { const c = load(); if (!c.services.tautulli?.url || !c.services.tautulli?.apikey) return res.status(200).json({ error: 'Tautulli not configured' }); const days = [30, 60, 90, 365].includes(Number(req.query.days)) ? Number(req.query.days) : 30; try { const data = await cached(`live:stats:${days}`, TTL_HOUR, async () => { const st = await tautulli.homeStats(days, 10); const enrich = async (rows, media) => { for (const r of (rows || [])) { const m = await posterFor(r.name, r.year, media); r.poster = m?.poster || null; r.id = m?.id || null; r.media = m?.media || media; } return rows; }; await Promise.all([enrich(st.topMovies, 'movie'), enrich(st.topTv, 'tv')]); return st; }, isForce(req)); res.json(data); } catch (e) { res.status(200).json({ error: e.message }); } });

router.get('/new', async (req, res) => { const media = req.query.media === 'tv' ? 'tv' : 'movie'; try { const data = await cached(`new:${media}`, TTL_DAY, async () => { const settled = await Promise.allSettled(tmdb.STREAMING.map((s) => tmdb.newlyAdded(s.key, media, 20))); const rows = []; settled.forEach((r, i) => { if (r.status === 'fulfilled' && r.value.items.length) rows.push({ title: `New on ${r.value.provider}`, kind: media, brand: tmdb.STREAMING[i].key, items: r.value.items.map(mini) }); }); return { rows }; }, isForce(req)); res.json(data); } catch (e) { res.status(200).json({ error: e.message, rows: [] }); } });

async function withWorldwide(items) { const out = []; for (const it of items) { let ww = null; if (it.id) { try { const b = await tmdb.movieBrief(it.id); if (b && b.revenue) ww = b.revenue; } catch { /* ignore */ } } out.push({ ...it, total: fmtMoney(ww) || it.total || null, totalKind: ww ? 'worldwide' : (it.totalKind || 'domestic') }); } return out; }
router.get('/boxoffice', async (req, res) => {
  const source = load().boxoffice?.source || 'bom'; const areaKey = load().boxoffice?.area || 'US';
  try { if (source === 'bom') { const data = await cached(`boxoffice:bom:${areaKey}:${mondayKey()}`, 7 * TTL_DAY, async () => { const bo = await boxoffice.topWeekend(); return { source: bo.source, region: bo.region, weekOf: bo.weekLabel || mondayKey(), note: 'Real weekend grosses (Box Office Mojo) · worldwide totals from TMDB.', items: bo.items.map((it) => ({ rank: it.rank, id: it.id, media: 'movie', title: it.title, year: it.year, overview: it.overview, poster: it.poster, backdrop: it.backdrop, rating: it.rating, weekend: it.weekendGrossText, total: it.worldwideTotalText || it.domesticTotalText, totalKind: it.worldwideTotalText ? 'worldwide' : 'domestic', weeks: it.weeks })) }; }, isForce(req)); if (data.items && data.items.length) return res.json(data); } } catch (e) { console.warn('[boxoffice] BOM failed, proxy:', e.message); }
  try { const data = await cached(`boxoffice:proxy:${mondayKey()}`, 7 * TTL_DAY, async () => { const t = await tmdb.inCinemasTop(10); const items = await withWorldwide(t.items.map((c, i) => ({ rank: i + 1, ...mini(c) }))); return { source: 'tmdb-proxy', weekOf: mondayKey(), note: 'In cinemas now · ranked by gross · worldwide totals from TMDB.', items }; }, isForce(req)); res.json(data); } catch (e) { res.status(200).json({ error: e.message, items: [] }); }
});
router.get('/anticipated', async (req, res) => { const media = req.query.media === 'tv' ? 'tv' : 'movie'; try { const data = await cached(`anticipated:${media}`, TTL_DAY, async () => { const rows = []; if (media === 'movie') { const cinema = await tmdb.comingSoonCinema('movie', 24).catch(() => ({ items: [] })); if (cinema.items.length) rows.push({ title: '🎬 In Cinemas Soon', kind: 'movie', items: cinema.items.map(mini) }); } else { const up = await tmdb.comingSoonCinema('tv', 24).catch(() => ({ items: [] })); if (up.items.length) rows.push({ title: '📺 Premiering Soon', kind: 'tv', items: up.items.map(mini) }); } const settled = await Promise.allSettled(tmdb.STREAMING.map((s) => tmdb.comingSoonProvider(s.key, media, 20))); settled.forEach((r, i) => { if (r.status === 'fulfilled' && r.value.items.length) rows.push({ title: `Coming to ${r.value.provider}`, kind: media, brand: tmdb.STREAMING[i].key, items: r.value.items.map(mini) }); }); if (!rows.length) return { error: 'Nothing upcoming found for your region yet.', rows: [] }; return { rows }; }, isForce(req)); res.json(data); } catch (e) { res.status(200).json({ error: e.message, rows: [] }); } });

router.get('/person/:id', async (req, res) => {
  try {
    const [p, owned] = await Promise.all([tmdb.person(req.params.id), ownedSet()]);
    const seen = new Set(); const credits = [];
    for (const c of (p.combined_credits?.cast || [])) { if (c.adult) continue; const media = c.media_type === 'tv' ? 'tv' : 'movie'; const key = media + ':' + c.id; if (seen.has(key)) continue; seen.add(key); credits.push({ id: c.id, media, title: c.title || c.name, year: (c.release_date || c.first_air_date || '').slice(0, 4), poster: tmdb.img(c.poster_path), backdrop: tmdb.img(c.backdrop_path, 'w1280'), rating: c.vote_average, popularity: c.popularity || 0, character: c.character || '', owned: owned.has(String(c.id)) }); }
    const inLibrary = credits.filter((c) => c.owned).sort((a, b) => b.popularity - a.popularity);
    const knownFor = credits.filter((c) => c.poster).sort((a, b) => b.popularity - a.popularity).slice(0, 24);
    const KEEP = ['Director', 'Writer', 'Screenplay', 'Producer', 'Executive Producer', 'Creator', 'Story'];
    const crewSeen = new Set(); const crew = [];
    for (const c of (p.combined_credits?.crew || [])) { if (c.adult || !KEEP.includes(c.job)) continue; const media = c.media_type === 'tv' ? 'tv' : 'movie'; const key = media + ':' + c.id; if (crewSeen.has(key)) continue; crewSeen.add(key); crew.push({ id: c.id, media, title: c.title || c.name, year: (c.release_date || c.first_air_date || '').slice(0, 4), poster: tmdb.img(c.poster_path), backdrop: tmdb.img(c.backdrop_path, 'w1280'), rating: c.vote_average, popularity: c.popularity || 0, job: c.job, owned: owned.has(String(c.id)) }); }
    const crewKnownFor = crew.filter((c) => c.poster).sort((a, b) => b.popularity - a.popularity).slice(0, 24);
    const bio = p.biography ? (p.biography.length > 420 ? p.biography.slice(0, 417) + '…' : p.biography) : '';
    res.json({ id: p.id, name: p.name, department: p.known_for_department, photo: tmdb.img(p.profile_path, 'w300'), biography: bio, birthday: p.birthday, place: p.place_of_birth, imdbId: p.external_ids?.imdb_id || null, imdbUrl: p.external_ids?.imdb_id ? `https://www.imdb.com/name/${p.external_ids.imdb_id}/` : null, counts: { library: inLibrary.length, total: credits.length, crew: crew.length }, inLibrary, knownFor, crewKnownFor });
  } catch (e) { res.status(200).json({ error: e.message }); }
});

router.get('/top/:provider', async (req, res) => { try { const media = req.query.media === 'tv' ? 'tv' : 'movie'; const data = await tmdb.topByProvider(req.params.provider, media, Number(req.query.limit) || 10); res.json({ ...data, items: data.items.map(mini) }); } catch (e) { res.status(200).json({ error: e.message, items: [] }); } });
router.get('/trending', async (req, res) => { try { const [movies, tv] = await Promise.all([tmdb.trending('movie', 'week'), tmdb.trending('tv', 'week')]); res.json({ movies: movies.results, tv: tv.results }); } catch (e) { res.status(200).json({ error: e.message }); } });
router.get('/search', async (req, res) => { try { const data = await tmdb.search(req.query.q || '', 'multi'); res.json((data.results || []).filter((r) => r.media_type !== 'person').map(mini)); } catch (e) { res.status(200).json({ error: e.message }); } });

router.get('/:media/:id', async (req, res) => {
  const { media, id } = req.params;
  try {
    const [d, map] = await Promise.all([tmdb.details(media, id), libMap()]);
    const yt = (d.videos?.results || []).filter((v) => v.site === 'YouTube');
    const trailer = yt.find((v) => v.type === 'Trailer' && v.official) || yt.find((v) => v.type === 'Trailer') || yt[0];
    const imdbId = d.external_ids?.imdb_id || null;
    let imdb = null;
    if (imdbId && load().omdb?.apiKey) { try { const o = await omdb.byImdbId(imdbId); if (o?.rating) imdb = { rating: o.rating, votes: o.votes }; } catch { /* optional */ } }
    const owned = map[String(d.id)] || null;
    let seriesStatus = null, episodePercent = null, episodesOwned = null, episodesTotal = null;
    if (media === 'tv') { const raw = (d.status || '').toLowerCase(); if (raw.includes('end') || raw.includes('cancel')) seriesStatus = 'ended'; else if (raw.includes('return') || raw.includes('production') || raw.includes('airing')) seriesStatus = 'continuing'; episodesTotal = d.number_of_episodes || null; if (owned && episodesTotal) { episodesOwned = owned.leafCount || 0; episodePercent = Math.max(0, Math.min(100, Math.round((episodesOwned / episodesTotal) * 100))); } }
    res.json({ id: d.id, media, title: d.title || d.name, tagline: d.tagline, year: (d.release_date || d.first_air_date || '').slice(0, 4), overview: d.overview, genres: (d.genres || []).map((g) => g.name), runtime: d.runtime || (d.episode_run_time || [])[0], rating: d.vote_average, imdbId, imdbUrl: imdbId ? `https://www.imdb.com/title/${imdbId}/` : null, imdbRating: imdb ? imdb.rating : null, imdbVotes: imdb ? imdb.votes : null, poster: tmdb.img(d.poster_path, 'w500'), backdrop: tmdb.img(d.backdrop_path, 'original'), trailerKey: trailer ? trailer.key : null, inLibrary: !!owned, seriesStatus, episodePercent, episodesOwned, episodesTotal, cast: (d.credits?.cast || []).slice(0, 16).map((c) => ({ id: c.id, name: c.name, character: c.character, photo: tmdb.img(c.profile_path, 'w185') })), similar: (d.similar?.results || []).slice(0, 20).map(mini), recommendations: (d.recommendations?.results || []).slice(0, 20).map(mini) });
  } catch (e) { res.status(200).json({ error: e.message }); }
});

function cap(s) { return String(s).replace(/\b\w/g, (c) => c.toUpperCase()); }
function mini(c) {
  const o = { id: c.id, media: c.media_type || (c.title ? 'movie' : (c.name ? 'tv' : 'movie')), title: c.title || c.name, year: (c.release_date || c.first_air_date || '').slice(0, 4), overview: c.overview, poster: tmdb.img(c.poster_path), backdrop: tmdb.img(c.backdrop_path, 'w1280'), rating: c.vote_average, why: c.why };
  if (c._imdbRating != null) o.imdbRating = c._imdbRating;   // from IMDb chart scrape
  return o;
}

export default router;
