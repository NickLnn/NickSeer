// mini.js — a hardened zero-dependency Express-compatible shim.
// Optimized for Cloudflare Tunnel & reverse proxies (CF-Connecting-IP, security headers, edge caching).
//
// AUDIT REMEDIATION (2026-09-09):
//  * resolveIp(): CF-Connecting-IP / X-Forwarded-For are now only trusted when
//    the TCP peer is an allow-listed proxy CIDR. Previously any client could
//    spoof its own IP and defeat the /api/auth/login rate limiter.
//  * serveStatic(): replaced `no-store` (which disabled ALL browser + edge
//    caching for the 21 JS modules and 3 stylesheets) with strong ETags,
//    immutable caching for fingerprinted `?v=` assets, gzip, and an in-memory
//    asset cache that removes fs.readFileSync from the per-request hot path.
//  * decorate(): added HSTS, Permissions-Policy, COOP/CORP and CSP.
import http from 'http';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import crypto from 'crypto';
import { URL } from 'url';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.webp': 'image/webp', '.woff2': 'font/woff2',
  '.woff': 'font/woff', '.map': 'application/json'
};

// ---------------------------------------------------------------------------
// Trusted proxy handling
// ---------------------------------------------------------------------------
// Only these TCP peers may dictate the client IP via forwarding headers.
// Defaults cover loopback plus the Docker bridge range that cloudflared uses.
// Override with TRUSTED_PROXY_CIDRS="127.0.0.1/32,172.16.0.0/12,10.0.0.0/8".
const TRUSTED_PROXIES = (process.env.TRUSTED_PROXY_CIDRS ||
  '127.0.0.1/32,::1/128,172.16.0.0/12,10.0.0.0/8,192.168.0.0/16')
  .split(',').map((s) => s.trim()).filter(Boolean);

const IP_SHAPE = /^[0-9a-fA-F.:]{3,45}$/;

function ipToInt(a) {
  const parts = a.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const o = Number(p);
    if (!Number.isInteger(o) || o < 0 || o > 255) return null;
    n = ((n << 8) + o) >>> 0;
  }
  return n;
}

function inCidr(ip, cidr) {
  const [range, bitsRaw] = cidr.split('/');
  if (!ip.includes('.') || !range.includes('.')) return ip === range;
  const bits = Number(bitsRaw);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const a = ipToInt(ip), b = ipToInt(range);
  if (a === null || b === null) return false;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (a & mask) === (b & mask);
}

function resolveIp(req) {
  const socketIp = String(req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
  const trusted = TRUSTED_PROXIES.some((c) => inCidr(socketIp, c));

  // Direct connection (e.g. someone hitting the published LAN port): the
  // socket address is the only value we are allowed to believe.
  if (!trusted) return socketIp || '0.0.0.0';

  const cf = req.headers['cf-connecting-ip'];
  if (typeof cf === 'string' && IP_SHAPE.test(cf.trim())) return cf.trim();

  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string') {
    const first = xff.split(',')[0].trim();
    if (IP_SHAPE.test(first)) return first;
  }
  return socketIp || '0.0.0.0';
}

// ---------------------------------------------------------------------------
// Content Security Policy
// ---------------------------------------------------------------------------
// Report-only by default so a missing source can never black-screen the app.
// Flip to enforcing with CSP_ENFORCE=1 once the console is clean.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://image.tmdb.org https://plex.tv https://*.plex.direct https://*.plex.tv https://m.media-amazon.com",
  "connect-src 'self' https://plex.tv https://*.plex.direct https://*.plex.tv",
  "frame-src https://www.youtube.com https://www.youtube-nocookie.com",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'"
].join('; ');
const CSP_ENFORCING = process.env.CSP_ENFORCE === '1';
const CSP_HEADER = CSP_ENFORCING
  ? 'Content-Security-Policy'
  : 'Content-Security-Policy-Report-Only';
// upgrade-insecure-requests is ignored in a report-only policy (and the browser
// logs a console error saying so), so only emit it when actually enforcing.
const CSP_VALUE = CSP_ENFORCING ? CSP + '; upgrade-insecure-requests' : CSP;

function compilePath(prefix, routePath) {
  let full = (prefix + routePath).replace(/\/+/g, '/');
  if (full.length > 1 && full.endsWith('/')) full = full.slice(0, -1);
  const names = [];
  const regexStr = full
    .replace(/[.+^$${}()|[\]\\*]/g, '\\$&')
    .replace(/:(\w+)/g, (_, n) => { names.push(n); return '([^/]+)'; })
    .replace(/\\\*/g, () => '.*');
  return { regex: new RegExp('^' + regexStr + '/?$'), names };
}

class Router {
  constructor() { this.stack = []; }
  _add(m, p, h) { this.stack.push({ method: m, routePath: p, handler: h }); }
  get(p, h) { this._add('GET', p, h); }
  post(p, h) { this._add('POST', p, h); }
  put(p, h) { this._add('PUT', p, h); }
  delete(p, h) { this._add('DELETE', p, h); }
  patch(p, h) { this._add('PATCH', p, h); }
  use(a, b) {
    if (typeof a === 'function') this.stack.push({ method: 'USE', routePath: '/', handler: a });
    else this.stack.push({ method: 'MOUNT', routePath: a, handler: b });
  }
}

class App extends Router {
  listen(port, cb) {
    const s = http.createServer((q, r) => this._handle(q, r));
    s.listen(port, '0.0.0.0', cb);
    return s;
  }

  async _handle(req, res) {
    decorate(req, res);

    // Extract real client IP behind Cloudflare Tunnel / Reverse Proxy.
    // Forwarding headers are only honoured from allow-listed proxy peers.
    req.ip = resolveIp(req);

    const parsed = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
    req.path = parsed.pathname;
    req.query = Object.fromEntries(parsed.searchParams.entries());

    if (['POST', 'PUT', 'PATCH'].includes(req.method)) req.body = await readJson(req);
    const matched = await this._dispatch(this.stack, '', req, res, req.path);
    if (!matched && !res.headersSent) { res.statusCode = 404; res.end('Not found'); }
  }

  async _dispatch(stack, prefix, req, res, pathname) {
    for (const layer of stack) {
      if (res.headersSent) return true;
      if (layer.method === 'USE') {
        const h = await runMiddleware(layer.handler, req, res, prefix, pathname);
        if (h) return true;
        continue;
      }
      if (layer.method === 'MOUNT') {
        const mountPath = (prefix + layer.routePath).replace(/\/+/g, '/').replace(/\/$/, '') || '/';
        if (pathname === mountPath || pathname.startsWith(mountPath + '/') || mountPath === '/') {
          const sub = layer.handler;
          if (sub instanceof Router) {
            const done = await this._dispatch(sub.stack, mountPath === '/' ? prefix : mountPath, req, res, pathname);
            if (done) return true;
          } else if (typeof sub === 'function') {
            const h = await runMiddleware(sub, req, res, mountPath, pathname);
            if (h) return true;
          }
        }
        continue;
      }
      if (layer.method !== req.method) continue;
      const { regex, names } = compilePath(prefix, layer.routePath);
      const m = pathname.match(regex);
      if (!m) continue;
      req.params = {};
      names.forEach((n, i) => (req.params[n] = decodeURIComponent(m[i + 1])));
      try { await layer.handler(req, res); }
      catch (e) {
        if (!res.headersSent) { res.statusCode = 500; res.json({ error: e.message }); }
      }
      return true;
    }
    return false;
  }
}

function decorate(req, res) {
  // Hardened Security Headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // The Cloudflare Tunnel terminates TLS, so every public path is HTTPS-only.
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  res.setHeader('Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader(CSP_HEADER, CSP_VALUE);

  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (o) => {
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    }
    res.end(JSON.stringify(o));
    return res;
  };
  res.send = (d) => {
    if (Buffer.isBuffer(d) || typeof d === 'string') res.end(d);
    else {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(d));
    }
    return res;
  };
  res.sendFile = (fp) => {
    fs.readFile(fp, (err, data) => {
      if (err) { res.statusCode = 404; res.end('Not found'); return; }
      res.setHeader('Content-Type', MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream');
      // The SPA entry document must revalidate, but MUST remain storable so
      // the browser and the Cloudflare edge can serve a 304 / stale copy.
      res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
      res.end(data);
    });
    return res;
  };
}

function readJson(req, maxBytes = 1048576) {
  return new Promise((resolve) => {
    let data = '';
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > maxBytes) { req.destroy(); return resolve({}); }
      data += c;
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

function runMiddleware(fn, req, res, mountPath, pathname) {
  return new Promise((resolve) => {
    if (fn._static) return resolve(serveStatic(fn._root, req, res, mountPath, pathname));
    let nexted = false;
    const next = () => { nexted = true; resolve(false); };
    const ret = fn(req, res, next);
    if (ret && typeof ret.then === 'function') ret.then(() => { if (!nexted && !res.headersSent) resolve(false); });
    else if (!nexted && !res.headersSent) resolve(false);
  });
}

// ---------------------------------------------------------------------------
// Static asset serving
// ---------------------------------------------------------------------------
// Read-through cache: file bytes + precomputed gzip + strong ETag, keyed on
// mtime+size. Removes two blocking syscalls per request from the hot path
// (the ./public tree is a Docker bind-mount onto NAS storage).
const assetCache = new Map();
const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.map']);
const ASSET_CACHE_MAX = 400;

function loadAsset(filePath, ext, stat) {
  const key = stat.mtimeMs + ':' + stat.size;
  const hit = assetCache.get(filePath);
  if (hit && hit.key === key) return hit;

  const body = fs.readFileSync(filePath);
  const etag = '"' + crypto.createHash('sha1').update(body).digest('base64url') + '"';
  const gzip = COMPRESSIBLE.has(ext) && body.length > 1024
    ? zlib.gzipSync(body, { level: 6 })
    : null;

  const entry = { key, body, gzip, etag, mtime: stat.mtime.toUTCString() };
  if (assetCache.size >= ASSET_CACHE_MAX) assetCache.clear();
  assetCache.set(filePath, entry);
  return entry;
}

function serveStatic(root, req, res, mountPath, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  let rel = pathname;
  if (mountPath !== '/' && rel.startsWith(mountPath)) rel = rel.slice(mountPath.length);
  rel = decodeURIComponent(rel);
  if (rel.includes('..')) return false;
  if (rel === '' || rel === '/') rel = '/index.html';

  const filePath = path.join(root, rel);
  const ext = path.extname(filePath).toLowerCase();
  let asset;
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return false;
    asset = loadAsset(filePath, ext, stat);
  } catch { return false; }

  res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
  res.setHeader('ETag', asset.etag);
  res.setHeader('Last-Modified', asset.mtime);
  res.setHeader('Vary', 'Accept-Encoding');

  // Cloudflare Edge & Browser Caching Policy.
  // index.html requests assets as /js/app.js?v=<stamp> — that query string IS
  // the cache key, so those responses are safe to mark immutable for a year.
  const fingerprinted = typeof req.query?.v === 'string' && req.query.v.length > 0;
  if (ext === '.html') {
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
  } else if (rel === '/sw.js' || rel === '/manifest.json') {
    // A stale service worker at the edge is very hard to recover from.
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
  } else if (fingerprinted) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  } else if (ext === '.js' || ext === '.mjs' || ext === '.css') {
    // Un-fingerprinted code MUST revalidate.
    //
    // index.html deliberately loads app.js, nav.js, settings.js and
    // login-enhance.js WITHOUT a `?v=` stamp: approvals.js does
    // `import { openDetail } from './app.js'`, and a stamped script tag would
    // make that a second module instance under a different URL, duplicating
    // every listener and observer in it.
    //
    // The old policy gave those files `max-age=3600, stale-while-revalidate=86400`,
    // so an edit to app.js could go unnoticed for an HOUR — and once noticed,
    // stale-while-revalidate still served the OLD copy for that load and only
    // delivered the new one on the load after. That is exactly how a phone ends
    // up running new imdb-badge.js (fingerprinted, new URL, instant) against a
    // stale app.js, which looks like "the fix didn't work".
    //
    // `no-cache` does not mean "don't cache" — the copy is still stored and
    // still returns a 304 with no body via the ETag above. It only forces a
    // revalidation, so the cost is one conditional request per file per load.
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
  } else {
    // Images, fonts and other static media: unchanged.
    res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
  }

  // Conditional request -> 304, no body across the tunnel.
  const inm = req.headers['if-none-match'];
  if (inm && inm.split(/,\s*/).some((t) => t.trim() === asset.etag)) {
    res.statusCode = 304;
    res.end();
    return true;
  }

  const accepts = String(req.headers['accept-encoding'] || '');
  const useGzip = asset.gzip && /\bgzip\b/.test(accepts);
  const payload = useGzip ? asset.gzip : asset.body;
  if (useGzip) res.setHeader('Content-Encoding', 'gzip');
  res.setHeader('Content-Length', payload.length);

  if (req.method === 'HEAD') res.end();
  else res.end(payload);
  return true;
}

function express() { return new App(); }
express.Router = () => new Router();
express.json = () => { const mw = (req, res, next) => next(); return mw; };
express.static = (root) => { const mw = () => {}; mw._static = true; mw._root = root; return mw; };

export default express;
export { Router, resolveIp };
