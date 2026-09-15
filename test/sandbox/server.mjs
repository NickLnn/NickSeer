// NickSeer UI sandbox.
//
// Serves the REAL public/ directory against stubbed API responses so the front
// end can be driven in a browser without touching the NAS container.
//
// This deliberately does NOT import server/index.js. That module calls
// startMonitoring() on boot, which dispatches real Telegram and Discord alerts
// using the live config — booting it locally is exactly what must not happen.
// Nothing here reads config/, opens a socket to Plex/Radarr/Sonarr, or sends a
// notification. It is a static file server plus a fixture table.
//
//   node test/sandbox/server.mjs [port]      # default 5099
//
// Fixtures are shaped to exercise the things that are hard to eyeball:
//   * ROWS x PER_ROW cards, so the old document-wide repaint loop would be
//     plainly visible as jank and the viewport-scoped one plainly is not.
//   * Deliberate same-title collisions (Dune 1984/2021, IT 1990/2017) with
//     DIFFERENT ratings, so a card painted from a title match instead of its
//     data-id shows the wrong number and the bug is visible rather than subtle.
//   * Posters are generated locally as SVG — no image.tmdb.org dependency, so
//     the sandbox works with no outbound network at all.

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, '..', '..', 'public');
const PORT = Number(process.argv[2] || 5099);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
  '.webp': 'image/webp', '.woff2': 'font/woff2'
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const ROWS = 8;
const PER_ROW = 30;

// [title, year, imdb, tmdb] — the pairs sharing a title carry different scores
// on purpose. Under the old title-keyed lookup both cards resolved to whichever
// was harvested last, so they rendered identical numbers.
const COLLIDERS = [
  ['Dune', '1984', 6.3, 6.2],
  ['Dune', '2021', 8.0, 7.8],
  ['IT', '1990', 6.9, 7.0],
  ['IT', '2017', 7.3, 7.2],
  ['The Lion King', '1994', 8.5, 8.3],
  ['The Lion King', '2019', 6.8, 7.1]
];

const FILLER = [
  'Queen of the South', 'Breaking Bad', 'The Bear', 'Severance', 'Andor',
  'Shogun', 'Fallout', 'The Last of Us', 'Arcane', 'Dark', 'Chernobyl',
  'True Detective', 'Mr Robot', 'Peaky Blinders', 'The Wire', 'Fargo',
  'Better Call Saul', 'Succession', 'The Boys', 'Barry', 'Ozark', 'Mindhunter'
];

let nextId = 1000;
const byId = new Map();

function makeItem(title, year, imdb, tmdb, media = 'movie') {
  const id = nextId++;
  const it = {
    id, media, title, year,
    poster: `/sandbox-poster/${id}.svg`,
    backdrop: `/sandbox-poster/${id}.svg`,
    rating: tmdb,
    overview: `${title} (${year}) — sandbox fixture.`,
    imdbRating: imdb,
    imdbUrl: `https://www.imdb.com/find/?q=${encodeURIComponent(title)}`
  };
  byId.set(String(id), it);
  return it;
}

const rows = [];
for (let r = 0; r < ROWS; r++) {
  const items = [];
  // Every row leads with the colliding titles so they are on screen immediately.
  for (const [t, y, i, m] of COLLIDERS) items.push(makeItem(t, y, i, m));
  for (let n = items.length; n < PER_ROW; n++) {
    const title = FILLER[n % FILLER.length];
    const year = String(2005 + ((n * 3) % 20));
    // A third of the filler has no IMDb rating, to exercise the card fallback.
    const imdb = n % 3 === 0 ? null : Math.round((5.5 + (n % 45) / 10) * 10) / 10;
    const tmdb = Math.round((5.0 + (n % 50) / 10) * 10) / 10;
    items.push(makeItem(`${title}`, year, imdb, tmdb, n % 4 === 0 ? 'tv' : 'movie'));
  }
  rows.push({ title: `Sandbox Row ${r + 1}`, items });
}

const allItems = rows.flatMap((r) => r.items);

function poster(id) {
  const it = byId.get(String(id));
  const label = it ? it.title : 'poster';
  const year = it ? it.year : '';
  const hue = (Number(id) * 37) % 360;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 342 513">
  <rect width="342" height="513" fill="hsl(${hue},45%,22%)"/>
  <circle cx="171" cy="200" r="90" fill="hsl(${hue},55%,38%)"/>
  <text x="171" y="400" font-family="sans-serif" font-size="22" font-weight="700"
        fill="#fff" text-anchor="middle">${escapeXml(label)}</text>
  <text x="171" y="432" font-family="sans-serif" font-size="18"
        fill="#ffffffaa" text-anchor="middle">${year}</text>
</svg>`;
}

function escapeXml(s) {
  return String(s).replace(/[<>&'"]/g, (c) => (
    { '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]
  ));
}

// ---------------------------------------------------------------------------
// Stubbed API
// ---------------------------------------------------------------------------
function api(pathname, url, body) {
  // Auth is reported as disabled so ensureAuth() short-circuits and the app
  // paints the real home view instead of the login overlay.
  if (pathname === '/api/public/bootstrap') {
    return {
      auth: { enabled: false },
      me: { ok: true, user: { username: 'Sandbox', name: 'Sandbox', role: 'admin' } },
      health: { configured: true },
      isAdmin: true
    };
  }
  // login-enhance.js's getMe() returns r.user and app.js reads .username off it.
  if (pathname === '/api/auth/me') return { ok: true, user: { username: 'Sandbox', name: 'Sandbox', role: 'admin' } };
  if (pathname === '/api/auth/profiles') return { profiles: [{ id: 'Sandbox', name: 'Sandbox', username: 'Sandbox', role: 'admin' }] };
  if (pathname === '/api/status') return { ok: true, services: [] };
  if (pathname === '/api/discover/home') return { rows, cold: false };
  if (pathname === '/api/discover/rows') return { rows };
  // renderCategory() reads trend.movies / trend.tv, and the IMDb rail is a
  // Top *250* — the Movies/TV tabs are far heavier than Home, which is where
  // Nick reports the page seizing up. Match that shape.
  if (pathname === '/api/discover/trending') {
    return { movies: allItems.slice(0, 40), tv: allItems.slice(40, 80), items: allItems.slice(0, 40) };
  }
  if (pathname === '/api/discover/imdb-top') {
    const pool = [];
    while (pool.length < 250) pool.push(...allItems);
    return { items: pool.slice(0, 250) };
  }
  if (pathname === '/api/discover/boxoffice') return { items: allItems.slice(0, 20) };
  if (pathname === '/api/discover/search') return { items: allItems.slice(0, 20) };

  if (pathname === '/api/discover/media-status') {
    const statuses = {};
    for (const it of body?.items || []) {
      // Roughly a third in library, a sixth requested.
      if (it.id % 3 === 0) statuses[it.id] = { status: 'in_library', label: 'In library' };
      else if (it.id % 6 === 1) statuses[it.id] = { status: 'requested', label: 'Requested' };
    }
    return { statuses };
  }

  if (pathname === '/api/discover/imdb-ratings') {
    const ratings = {}, urls = {};
    for (const it of body?.items || []) {
      const rec = byId.get(String(it.id));
      ratings[String(it.id)] = rec ? rec.imdbRating : null;
      if (rec && rec.imdbRating != null) urls[String(it.id)] = rec.imdbUrl;
    }
    return { ratings, urls };
  }

  const detail = pathname.match(/^\/api\/discover\/(movie|tv)\/(\d+)$/);
  if (detail) {
    const rec = byId.get(detail[2]);
    if (!rec) return { error: 'not found' };
    return {
      ...rec,
      runtime: 118,
      genres: ['Drama', 'Thriller', 'Crime'],
      inLibrary: Number(detail[2]) % 3 === 0,
      isRequested: false,
      seriesStatus: detail[1] === 'tv' ? 'ended' : null,
      cast: allItems.slice(0, 14).map((c, i) => ({ ...c, job: 'Actor', character: `Role ${i}` })),
      recommendations: allItems.slice(20, 50),
      similar: allItems.slice(50, 80),
      productionCountries: [{ iso_31661: 'US', name: 'United States' }]
    };
  }

  if (pathname.startsWith('/api/discover/person/')) return { ...allItems[0], knownFor: allItems.slice(0, 20) };
  if (pathname === '/api/request/options') return { profiles: [], rootFolders: [], tags: [] };
  if (pathname === '/api/settings/users') return { users: [] };

  return { ok: true, sandbox: true, path: pathname };
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = decodeURIComponent(url.pathname);

  const send = (code, type, payload) => {
    res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(payload);
  };

  if (pathname.startsWith('/sandbox-poster/')) {
    return send(200, MIME['.svg'], poster(pathname.split('/').pop().replace('.svg', '')));
  }

  if (pathname.startsWith('/api/')) {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    return req.on('end', () => {
      let body = null;
      try { body = raw ? JSON.parse(raw) : null; } catch { /* not json */ }
      send(200, MIME['.json'], JSON.stringify(api(pathname, url, body)));
    });
  }

  // Static, confined to public/.
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const file = path.join(PUBLIC, rel);
  if (!file.startsWith(PUBLIC)) return send(403, 'text/plain', 'forbidden');
  fs.readFile(file, (err, buf) => {
    if (err) return send(404, 'text/plain', 'not found');
    send(200, MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', buf);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[sandbox] http://127.0.0.1:${PORT}`);
  console.log(`[sandbox] ${ROWS} rows x ${PER_ROW} cards = ${ROWS * PER_ROW} cards`);
  console.log('[sandbox] stubs only — no config, no Plex/Arr, no notifications');
});
