// personview.js — turns TMDB's raw person record into what the person sheet shows.
// Pure (no I/O) so it can be tested against real records without the server.
//
// The old route sorted every acting credit by TMDB "popularity". For almost any
// working actor that puts talk shows first: The Graham Norton Show, The Tonight
// Show and friends are on air every week, so they are permanently "popular",
// and a single guest spot counted the same as a lead role. Reported by Nick
// 2026-11-13 (Richard Madden: El Hormiguero, Graham Norton, Actors on Actors).
//
// What counts as "known for" now:
//   * not an appearance as themselves (character "Self", "Himself", "Self - Guest"…)
//   * not a Talk or News programme
//   * weighted by how many people rated the title, how well, how high the
//     person is billed (films) and how many episodes they were in (series)

const TALK = 10767, NEWS = 10763;
const SELF_RE = /(^|[\s(\-/])(self|himself|herself|themselves|themself)([\s)\-/,]|$)|archive footage|uncredited/i;
const CREW_KEEP = ['Director', 'Writer', 'Screenplay', 'Producer', 'Executive Producer', 'Creator', 'Story', 'Novel', 'Original Music Composer', 'Director of Photography'];

const yearOf = (c) => String(c.release_date || c.first_air_date || '').slice(0, 4);
const dateOf = (c) => String(c.release_date || c.first_air_date || '');

function isAppearance(c) {
  // A host is known for their own show: 20+ episodes is a job, not a guest spot.
  if (c.media_type === 'tv' && (c.episode_count || 0) >= 20) return false;
  const g = c.genre_ids || [];
  if (g.includes(TALK) || g.includes(NEWS)) return true;
  return SELF_RE.test(c.character || '');
}

function score(c) {
  const votes = Math.log10(1 + (c.vote_count || 0));           // 0 … ~4.5
  const quality = c.vote_average || 5;
  let weight = 1;
  if (c.media_type === 'tv') {
    const eps = c.episode_count || 0;
    weight = eps >= 10 ? 1 : eps >= 4 ? 0.8 : eps >= 2 ? 0.45 : 0.2;   // a one-episode guest spot barely counts
  } else if (typeof c.order === 'number') {
    weight = c.order <= 2 ? 1 : c.order <= 5 ? 0.8 : c.order <= 10 ? 0.55 : 0.35;   // billing position
  }
  return votes * quality * weight;
}

export function buildPersonView(p, { isOwned = () => false, img = (x) => x, today = new Date().toISOString().slice(0, 10) } = {}) {
  const shape = (c, extra = {}) => {
    const media = c.media_type === 'tv' ? 'tv' : 'movie';
    return {
      id: c.id, media, title: c.title || c.name || '', year: yearOf(c), date: dateOf(c),
      poster: img(c.poster_path), backdrop: img(c.backdrop_path, 'w1280'),
      rating: c.vote_average || 0, popularity: c.popularity || 0,
      owned: isOwned(media + ':' + String(c.id)), ...extra
    };
  };

  // ---- acting, one entry per title (a series can list several roles) -------
  const cast = new Map();
  for (const c of (p.combined_credits?.cast || [])) {
    if (c.adult) continue;
    const key = (c.media_type === 'tv' ? 'tv' : 'movie') + ':' + c.id;
    const prev = cast.get(key);
    const entry = { raw: c, appearance: isAppearance(c), score: score(c), episodes: c.episode_count || 0 };
    // Keep the most substantial role for the title.
    if (!prev || (prev.appearance && !entry.appearance) || (prev.appearance === entry.appearance && entry.score > prev.score)) {
      if (prev) entry.episodes = Math.max(entry.episodes, prev.episodes);
      cast.set(key, entry);
    }
  }
  const acting = [...cast.values()];
  const roles = acting.filter((e) => !e.appearance);
  const item = (e) => shape(e.raw, { character: e.raw.character || '', episodes: e.episodes || 0, appearance: e.appearance });

  const released = (e) => { const d = dateOf(e.raw); return d && d <= today; };
  let knownFor = roles.filter((e) => e.raw.poster_path && released(e)).sort((a, b) => b.score - a.score).slice(0, 20).map(item);
  // Someone credited almost only as themselves (a presenter, a documentary
  // subject) still gets a row. Directors and writers do not: their work is in
  // the crew list, which the sheet then leads with.
  const actor = (p.known_for_department || 'Acting') === 'Acting';
  if (knownFor.length < 4 && actor) {
    const have = new Set(knownFor.map((k) => k.media + ':' + k.id));
    const extra = acting.filter((e) => e.raw.poster_path && released(e)).sort((a, b) => (b.episodes - a.episodes) || (b.score - a.score)).map(item).filter((k) => !have.has(k.media + ':' + k.id));
    knownFor = knownFor.concat(extra).slice(0, 20);
  }

  // ---- behind the camera ---------------------------------------------------
  const crewMap = new Map();
  for (const c of (p.combined_credits?.crew || [])) {
    if (c.adult || !CREW_KEEP.includes(c.job)) continue;
    const key = (c.media_type === 'tv' ? 'tv' : 'movie') + ':' + c.id;
    const prev = crewMap.get(key);
    if (prev) { if (!prev.jobs.includes(c.job)) prev.jobs.push(c.job); }
    else crewMap.set(key, { raw: c, jobs: [c.job], score: Math.log10(1 + (c.vote_count || 0)) * (c.vote_average || 5) });
  }
  const crewAll = [...crewMap.values()];
  const crewItem = (e) => shape(e.raw, { job: e.jobs.slice(0, 2).join(' · ') });
  const crewKnownFor = crewAll.filter((e) => e.raw.poster_path).sort((a, b) => b.score - a.score).slice(0, 20).map(crewItem);

  // ---- in the library: anything they worked on -------------------------------
  const libSeen = new Set(); const inLibrary = [];
  // Same set as the filmography (real roles and crew jobs), so the header
  // count, this row and the "In library" filter below always agree.
  for (const it of [...roles.map(item), ...crewAll.map(crewItem)]) {
    const k = it.media + ':' + it.id;
    if (!it.owned || libSeen.has(k)) continue;
    libSeen.add(k); inLibrary.push(it);
  }
  inLibrary.sort((a, b) => b.popularity - a.popularity);

  // ---- every real role and crew job, one entry per title ---------------------
  const filmSeen = new Map();
  for (const e of roles) { const it = item(e); filmSeen.set(it.media + ':' + it.id, { ...it, role: it.character ? `as ${it.character}` : '' }); }
  for (const e of crewAll) {
    const it = crewItem(e); const k = it.media + ':' + it.id; const prev = filmSeen.get(k);
    if (prev) prev.role = [prev.role, it.job].filter(Boolean).join(' · ');
    else filmSeen.set(k, { ...it, role: it.job });
  }
  // …split three ways by where the title is in its life. They used to be one
  // list with the undated ones on top, so a filmography opened on a row of
  // blank "TBA" tiles (Nick, 2026-11-13):
  //   filmography  released — what the person has actually made
  //   upcoming     has a release date in the future
  //   announced    no date yet (in development; usually no poster either)
  const slim = ({ backdrop, appearance, ...keep }) => keep;
  const everything = [...filmSeen.values()];
  const filmography = everything.filter((f) => f.date && f.date <= today)
    .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 400).map(slim);
  const upcoming = everything.filter((f) => f.date && f.date > today)
    .sort((a, b) => a.date.localeCompare(b.date)).slice(0, 30).map(slim);
  const announced = everything.filter((f) => !f.date)
    .sort((a, b) => (b.popularity - a.popularity) || a.title.localeCompare(b.title)).slice(0, 40).map(slim);

  // ---- facts -------------------------------------------------------------------
  // From every credit (the list above is capped), ignoring anything dated before
  // the person could plausibly have worked — archive footage in documentaries.
  const born = p.birthday ? Number(p.birthday.slice(0, 4)) : 0;
  const years = [...filmSeen.values()].map((f) => Number(f.year)).filter((y) => y > 1880 && y >= born + 3 && String(y) <= today.slice(0, 4));
  const age = (() => {
    if (!p.birthday) return null;
    const end = p.deathday || today;
    let a = Number(end.slice(0, 4)) - Number(p.birthday.slice(0, 4));
    if (end.slice(5) < p.birthday.slice(5)) a--;
    return a >= 0 && a < 130 ? a : null;
  })();
  const hero = knownFor.find((k) => k.backdrop) || crewKnownFor.find((k) => k.backdrop) || null;
  const imdbId = p.external_ids?.imdb_id || null;

  return {
    id: p.id, name: p.name, department: p.known_for_department || '',
    // Which list is this person's main body of work.
    primary: !actor && crewKnownFor.length >= 3 ? 'crew' : 'acting',
    photo: img(p.profile_path, 'h632'), backdrop: hero ? hero.backdrop : null,
    biography: p.biography || '', birthday: p.birthday || null, deathday: p.deathday || null, age, place: p.place_of_birth || '',
    imdbId, imdbUrl: imdbId ? `https://www.imdb.com/name/${imdbId}/` : null,
    counts: {
      library: inLibrary.length,
      total: filmography.length,
      movies: filmography.filter((f) => f.media === 'movie').length,
      series: filmography.filter((f) => f.media === 'tv').length,
      crew: crewAll.length,
      appearances: acting.length - roles.length,
      upcoming: upcoming.length,
      announced: announced.length,
      from: years.length ? Math.min(...years) : null,
      to: years.length ? Math.max(...years) : null
    },
    inLibrary, knownFor, upcoming, announced, crewKnownFor, filmography
  };
}

export default { buildPersonView };
