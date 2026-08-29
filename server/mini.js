// mini.js — a hardened zero-dependency Express-compatible shim.
// Optimized for Cloudflare Tunnel & reverse proxies (CF-Connecting-IP, security headers, edge caching).
import http from 'http';
import fs from 'fs';
import path from 'path';
import { URL } from 'url';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.webp': 'image/webp', '.woff2': 'font/woff2',
  '.woff': 'font/woff', '.map': 'application/json'
};

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
    
    // Extract real client IP behind Cloudflare Tunnel / Reverse Proxy
    const xForwarded = req.headers['x-forwarded-for'];
    req.ip = req.headers['cf-connecting-ip'] || (typeof xForwarded === 'string' ? xForwarded.split(',')[0].trim() : '') || req.socket?.remoteAddress || '127.0.0.1';

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
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
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

function serveStatic(root, req, res, mountPath, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  let rel = pathname;
  if (mountPath !== '/' && rel.startsWith(mountPath)) rel = rel.slice(mountPath.length);
  rel = decodeURIComponent(rel);
  if (rel.includes('..')) return false;
  if (rel === '' || rel === '/') rel = '/index.html';
  const filePath = path.join(root, rel);
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return false;
    const ext = path.extname(filePath).toLowerCase();
    res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
    
    // Cloudflare Edge & Browser Caching Policy
    if (ext === '.html' || ext === '.js' || ext === '.css') {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    } else {
      // 24-hour browser caching for static images, SVGs, and fonts
      res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=3600');
    }
    
    res.end(fs.readFileSync(filePath));
    return true;
  } catch { return false; }
}

function express() { return new App(); }
express.Router = () => new Router();
express.json = () => { const mw = (req, res, next) => next(); return mw; };
express.static = (root) => { const mw = () => {}; mw._static = true; mw._root = root; return mw; };

export default express;
export { Router };

